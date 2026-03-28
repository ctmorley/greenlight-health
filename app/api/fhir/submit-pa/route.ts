import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { Prisma, AuthStatus } from "@prisma/client";
import { assemblePasBundle } from "@/lib/pas/bundle-assembler";
import { parseClaimResponse, simulateClaimResponse } from "@/lib/pas/claim-response-parser";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * POST /api/fhir/submit-pa
 *
 * Electronic PA submission via Da Vinci PAS.
 * Assembles a FHIR Bundle, submits to the payer's Claim/$submit endpoint
 * (or simulates), parses the ClaimResponse, and updates the GreenLight PA.
 *
 * In production: POST Bundle to payer's FHIR $submit endpoint.
 * In development: Simulates response based on ACR rating.
 */

const submitPaSchema = z.object({
  requestId: z.string().min(1),
  /** If provided, DTR QuestionnaireResponse in FHIR format */
  questionnaireResponse: z.record(z.unknown()).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.submit);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "pa_submit_electronic", "PriorAuthRequest", null, "Electronic PA submission via FHIR PAS").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = submitPaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { requestId, questionnaireResponse } = parsed.data;

    // Fetch the PA request with all related data
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        patient: true,
        payer: true,
        insurance: true,
        orderingPhysician: true,
        organization: true,
      },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "PA request not found" }, { status: 404 });
    }

    if (paRequest.status !== "submitted" && paRequest.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot submit electronically — request is in "${paRequest.status}" status` },
        { status: 400 }
      );
    }

    // ── Assemble PAS Bundle ──
    const bundle = assemblePasBundle({
      patientId: paRequest.patient.id,
      patientFirstName: paRequest.patient.firstName,
      patientLastName: paRequest.patient.lastName,
      patientDob: paRequest.patient.dob.toISOString().split("T")[0],
      patientGender: paRequest.patient.gender,
      patientMrn: paRequest.patient.mrn,
      payerName: paRequest.payer?.name || "Unknown",
      payerId: paRequest.payer?.payerId || "",
      memberId: paRequest.insurance?.memberId || "",
      groupNumber: paRequest.insurance?.groupNumber,
      serviceCategory: paRequest.serviceCategory || "imaging",
      serviceType: paRequest.serviceType || "",
      cptCodes: paRequest.cptCodes,
      icd10Codes: paRequest.icd10Codes,
      procedureDescription: paRequest.procedureDescription || "",
      urgency: paRequest.urgency,
      scheduledDate: paRequest.scheduledDate?.toISOString().split("T")[0],
      orderingPhysicianName: paRequest.orderingPhysician
        ? `${paRequest.orderingPhysician.firstName} ${paRequest.orderingPhysician.lastName}`
        : null,
      orderingPhysicianNpi: paRequest.orderingPhysician?.npiNumber || null,
      renderingPhysicianNpi: paRequest.renderingPhysicianNpi || null,
      facilityName: paRequest.facilityName,
      organizationName: paRequest.organization.name,
      organizationNpi: paRequest.organization.npi,
      clinicalNotes: paRequest.clinicalNotes,
      questionnaireResponse: questionnaireResponse || null,
      referenceNumber: paRequest.referenceNumber,
    });

    // ── Submit to Payer (simulated for now) ──
    // In production: POST bundle to payer's Claim/$submit endpoint
    // const payerFhirUrl = await getPayerFhirEndpoint(paRequest.payerId);
    // const fhirResponse = await fetch(`${payerFhirUrl}/Claim/$submit`, {
    //   method: "POST", body: JSON.stringify(bundle), headers: {...}
    // });

    // Check ACR rating for simulation quality
    let acrRating: number | null = null;
    if (paRequest.cptCodes.length > 0) {
      const guideline = await prisma.clinicalGuideline.findFirst({
        where: { cptCodes: { hasSome: paRequest.cptCodes } },
        orderBy: { rating: "desc" },
        select: { rating: true },
      });
      acrRating = guideline?.rating || null;
    }

    const simulatedResponse = simulateClaimResponse(paRequest.urgency, acrRating);
    const result = parseClaimResponse(simulatedResponse);

    // ── Update PA request with result ──
    const statusMap: Record<string, AuthStatus> = {
      approved: "approved",
      denied: "denied",
      pending_review: "pending_review",
      partially_approved: "partially_approved",
    };

    await prisma.$transaction([
      // Update the PA request status
      prisma.priorAuthRequest.update({
        where: { id: requestId },
        data: {
          status: statusMap[result.status],
          decidedAt: result.status === "pending_review" ? null : new Date(),
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
          approvedUnits: result.approvedUnits,
          approvedCptCodes: result.approvedCptCodes.length > 0 ? result.approvedCptCodes : undefined,
          rbmReferenceNumber: result.authorizationNumber,
          // Store PAS bundle and response in draftMetadata for audit
          draftMetadata: JSON.parse(JSON.stringify({
            pasBundle: bundle,
            pasResponse: simulatedResponse,
            pasSubmittedAt: new Date().toISOString(),
            pasSimulated: true,
          })) as Prisma.InputJsonValue,
        },
      }),
      // Create status change audit record
      prisma.authStatusChange.create({
        data: {
          priorAuthId: requestId,
          changedById: session.user.id,
          fromStatus: paRequest.status,
          toStatus: statusMap[result.status],
          note: `Electronic submission via Da Vinci PAS${result.authorizationNumber ? ` — Auth #${result.authorizationNumber}` : ""}`,
          metadata: JSON.parse(JSON.stringify({
            submissionMethod: "fhir-pas",
            simulated: true,
            claimResponseOutcome: simulatedResponse.outcome,
          })) as Prisma.InputJsonValue,
        },
      }),
      // Create denial record if denied
      ...(result.status === "denied"
        ? [
            prisma.denial.create({
              data: {
                priorAuthId: requestId,
                denialDate: new Date(),
                reasonCode: result.denialReasonCode,
                reasonCategory: "medical_necessity",
                reasonDescription: result.denialReasonDescription,
                payerNotes: result.payerNotes,
              },
            }),
          ]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      result: {
        status: result.status,
        authorizationNumber: result.authorizationNumber,
        expiresAt: result.expiresAt,
        approvedUnits: result.approvedUnits,
        denialReason: result.denialReasonDescription,
        payerNotes: result.payerNotes,
      },
      bundle: {
        resourceCount: (bundle.entry as unknown[]).length,
        timestamp: bundle.timestamp,
      },
      simulated: true,
    });
  } catch (error) {
    console.error("PAS submission error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to submit PA electronically" }, { status: 500 });
  }
}
