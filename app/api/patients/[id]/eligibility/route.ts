import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { decryptPatientRecord, decryptInsuranceRecord } from "@/lib/security/phi-crypto";
import { log } from "@/lib/logger";
import { AvailityClient, type EligibilityResponse } from "@/lib/transport/clearinghouse/availity-client";
import { resolveTransport, getTransportEnvironment } from "@/lib/transport";
import { resolveCredentials } from "@/lib/transport/clearinghouse/credentials";

/**
 * POST /api/patients/[id]/eligibility
 *
 * Check real-time insurance eligibility for a patient via the clearinghouse.
 * Uses the transport registry to resolve the correct transport for the payer.
 *
 * Request body (optional):
 *   { insuranceId?: string }  — check a specific insurance; defaults to primary
 *
 * Falls back to a basic local check if no clearinghouse credentials are available.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const insuranceId = body.insuranceId as string | undefined;

    auditPhiAccess(request, session, "view", "Patient", id, "Eligibility check").catch(() => {});

    // Fetch patient with insurance + payer, and the org for NPI
    const [patient, organization] = await Promise.all([
      prisma.patient.findFirst({
        where: { id, organizationId },
        include: {
          insurances: {
            ...(insuranceId ? { where: { id: insuranceId } } : { where: { isPrimary: true } }),
            include: { payer: true },
            take: 1,
          },
        },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { npi: true, name: true },
      }),
    ]);

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const insurance = patient.insurances[0];
    if (!insurance) {
      return NextResponse.json({ error: "No insurance record found for this patient" }, { status: 404 });
    }

    const decryptedPatient = decryptPatientRecord(patient);
    const decryptedInsurance = decryptInsuranceRecord(insurance);

    // Resolve transport via the canonical registry (org-aware, environment-aware, priority-ordered)
    const environment = getTransportEnvironment();
    const transport = await resolveTransport(insurance.payer.id, organizationId, environment);

    if (transport?.credentialRef) {
      try {
        const credentials = resolveCredentials(transport.credentialRef);
        const client = new AvailityClient({
          baseUrl: transport.endpointUrl || undefined,
        });

        const genderCode = String(decryptedPatient.gender) === "male" ? "M"
          : String(decryptedPatient.gender) === "female" ? "F" : "U";

        const dob = decryptedPatient.dob instanceof Date
          ? decryptedPatient.dob.toISOString().split("T")[0]
          : String(decryptedPatient.dob || "").split("T")[0];

        const orgName = organization?.name || "";

        const result: EligibilityResponse = await client.checkEligibility({
          payerId: transport.clearinghousePayerId || insurance.payer.payerId,
          provider: {
            npi: organization?.npi || "",
            lastName: orgName,
          },
          subscriber: {
            memberId: String(decryptedInsurance.memberId || ""),
            firstName: String(decryptedPatient.firstName || ""),
            lastName: String(decryptedPatient.lastName || ""),
            birthDate: dob,
            genderCode,
          },
          credentials,
        });

        log.info("Eligibility check completed", {
          route: "/api/patients/[id]/eligibility",
          patientId: id,
          payerId: insurance.payer.payerId,
          eligible: result.eligible,
          userId: session.user.id,
          organizationId,
        });

        return NextResponse.json({
          source: "clearinghouse",
          ...result,
          patient: {
            id: patient.id,
            firstName: decryptedPatient.firstName,
            lastName: decryptedPatient.lastName,
          },
          insurance: {
            id: insurance.id,
            payerName: insurance.payer.name,
            memberId: decryptedInsurance.memberId,
          },
        });
      } catch (err) {
        log.warn("Clearinghouse eligibility failed, falling back to local check", {
          patientId: id,
          error: err instanceof Error ? err.message : String(err),
        });
        // Fall through to local check
      }
    }

    // Local fallback: check insurance dates
    const now = new Date();
    const isActive = insurance.effectiveDate <= now
      && (!insurance.terminationDate || insurance.terminationDate > now);

    return NextResponse.json({
      source: "local",
      eligible: isActive,
      status: isActive ? "active" : "inactive",
      message: isActive
        ? "Coverage appears active based on effective/termination dates"
        : "Coverage appears inactive — terminated or not yet effective",
      planName: insurance.planName,
      planStatus: isActive ? "Active" : "Inactive",
      effectiveDate: insurance.effectiveDate.toISOString().split("T")[0],
      terminationDate: insurance.terminationDate?.toISOString().split("T")[0] || null,
      rawResponse: null,
      patient: {
        id: patient.id,
        firstName: decryptedPatient.firstName,
        lastName: decryptedPatient.lastName,
      },
      insurance: {
        id: insurance.id,
        payerName: insurance.payer.name,
        memberId: decryptedInsurance.memberId,
      },
    });
  } catch (error) {
    log.error("Eligibility check error", {
      route: "/api/patients/[id]/eligibility",
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to check eligibility" }, { status: 500 });
  }
}
