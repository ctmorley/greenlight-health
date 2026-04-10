import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { dispatchNotification } from "@/lib/notifications/service";
import { decryptPatientRecord } from "@/lib/security/phi-crypto";

/**
 * POST /api/requests/[id]/submit
 * Submit a draft PA request. Validates completeness, runs AI audit, and transitions to "submitted".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.submit);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const { id } = await params;

    auditPhiAccess(request, session, "pa_submit", "PriorAuthRequest", id, "Submitted PA request").catch(() => {});

    const paReq = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      include: {
        patient: true,
        payer: true,
        insurance: true,
        documents: true,
      },
    });

    if (!paReq) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (paReq.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft requests can be submitted" },
        { status: 400 }
      );
    }

    // Run AI pre-submission audit
    const auditIssues: Array<{ severity: "error" | "warning" | "info"; field: string; message: string }> = [];

    // Check required fields (serviceCategory/serviceType/payerId are nullable for early drafts)
    if (!paReq.patientId) {
      auditIssues.push({ severity: "error", field: "patient", message: "Patient is required" });
    }
    if (!paReq.serviceCategory) {
      auditIssues.push({ severity: "error", field: "serviceCategory", message: "Service category is required" });
    }
    if (!paReq.serviceType) {
      auditIssues.push({ severity: "error", field: "serviceType", message: "Service type is required" });
    }
    if (!paReq.payerId) {
      auditIssues.push({ severity: "error", field: "payer", message: "Payer is required" });
    }
    if (!paReq.insuranceId) {
      auditIssues.push({ severity: "warning", field: "insurance", message: "No insurance selected. The request will be submitted without insurance information." });
    }
    if (paReq.cptCodes.length === 0) {
      auditIssues.push({ severity: "error", field: "cptCodes", message: "At least one CPT code is required" });
    }
    if (paReq.icd10Codes.length === 0) {
      auditIssues.push({ severity: "warning", field: "icd10Codes", message: "No ICD-10 diagnosis codes provided. Most payers require at least one." });
    }

    // Check clinical documentation
    if (!paReq.clinicalNotes && paReq.documents.length === 0) {
      auditIssues.push({
        severity: "warning",
        field: "documentation",
        message: "No clinical notes or supporting documents attached. This may delay authorization.",
      });
    }

    // Check procedure description
    if (!paReq.procedureDescription) {
      auditIssues.push({
        severity: "warning",
        field: "procedureDescription",
        message: "No procedure description provided. Adding one improves approval likelihood.",
      });
    }

    // Check scheduled date
    if (!paReq.scheduledDate) {
      auditIssues.push({
        severity: "info",
        field: "scheduledDate",
        message: "No scheduled procedure date set.",
      });
    }

    // Check code combinations - warn if imaging CPT without relevant ICD-10
    if (paReq.serviceCategory === "imaging" && paReq.icd10Codes.length > 0) {
      // Basic check: make sure ICD-10 codes don't look like screening-only for non-screening procedures
      const hasScreeningOnly = paReq.icd10Codes.every((c) => c.startsWith("Z12"));
      if (hasScreeningOnly && paReq.serviceType !== "mammography") {
        auditIssues.push({
          severity: "warning",
          field: "icd10Codes",
          message: "Only screening diagnosis codes provided for a non-screening procedure. Consider adding clinical indication codes.",
        });
      }
    }

    // Check ordering physician
    if (!paReq.orderingPhysicianId) {
      auditIssues.push({
        severity: "info",
        field: "orderingPhysician",
        message: "No ordering physician specified.",
      });
    }

    const hasErrors = auditIssues.some((i) => i.severity === "error");

    if (hasErrors) {
      // Don't submit - return audit with blocking issues
      return NextResponse.json({
        submitted: false,
        auditResult: {
          passed: false,
          issues: auditIssues,
          timestamp: new Date().toISOString(),
        },
      }, { status: 400 });
    }

    // Calculate due date if not set (default: 14 days for routine, 3 for urgent, 1 for emergent)
    let dueDate = paReq.dueDate;
    if (!dueDate) {
      const now = new Date();
      const dueDays = paReq.urgency === "emergent" ? 1 : paReq.urgency === "urgent" ? 3 : 14;
      dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);
    }

    const auditResult = {
      passed: true,
      issues: auditIssues,
      timestamp: new Date().toISOString(),
    };

    // Update request and create audit entry in a single transaction
    const [updated] = await prisma.$transaction(async (tx) => {
      const req = await tx.priorAuthRequest.update({
        where: { id },
        data: {
          status: "submitted",
          submittedAt: new Date(),
          dueDate,
          aiAuditResult: auditResult,
          draftMetadata: Prisma.JsonNull, // Clear draft metadata on submission
        },
      });

      const statusChange = await tx.authStatusChange.create({
        data: {
          priorAuthId: id,
          changedById: session.user.id,
          fromStatus: "draft",
          toStatus: "submitted",
          note: "PA request submitted for review",
          metadata: auditResult,
        },
      });

      return [req, statusChange] as const;
    });

    // Dual-read: decrypt patient PHI for notification
    const patient = paReq.patient ? decryptPatientRecord(paReq.patient) : null;

    // Dispatch notification (non-blocking)
    dispatchNotification({
      userId: session.user.id,
      organizationId,
      type: "pa_submitted",
      title: "PA Submitted",
      message: `Prior authorization ${updated.referenceNumber} has been submitted for review.`,
      resourceType: "PriorAuthRequest",
      resourceId: updated.id,
      referenceNumber: updated.referenceNumber,
      patientName: patient
        ? `${patient.firstName} ${patient.lastName}`
        : undefined,
    }).catch(() => {});

    return NextResponse.json({
      submitted: true,
      id: updated.id,
      referenceNumber: updated.referenceNumber,
      status: updated.status,
      submittedAt: updated.submittedAt?.toISOString(),
      auditResult,
    });
  } catch (error) {
    console.error("Submit request error:", error);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}
