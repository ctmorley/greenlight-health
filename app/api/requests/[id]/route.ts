import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { decryptPatientRecord, decryptInsuranceRecord } from "@/lib/security/phi-crypto";
import { log } from "@/lib/logger";

const VALID_SERVICE_CATEGORIES = ["imaging", "surgical", "medical"] as const;
const VALID_SERVICE_TYPES = [
  "mri", "ct", "pet_ct", "ultrasound", "xray", "fluoroscopy",
  "mammography", "dexa", "nuclear", "surgical_procedure", "medical_procedure",
] as const;
const VALID_URGENCIES = ["routine", "urgent", "emergent"] as const;

const updateRequestSchema = z.object({
  patientId: z.string().optional(),
  serviceCategory: z.enum(VALID_SERVICE_CATEGORIES).optional(),
  serviceType: z.enum(VALID_SERVICE_TYPES).optional(),
  cptCodes: z.array(z.string()).optional(),
  icd10Codes: z.array(z.string()).optional(),
  procedureDescription: z.string().optional().nullable(),
  payerId: z.string().optional(),
  insuranceId: z.string().optional().nullable(),
  urgency: z.enum(VALID_URGENCIES).optional(),
  clinicalNotes: z.string().optional().nullable(),
  orderingPhysicianId: z.string().optional().nullable(),
  renderingPhysicianNpi: z.string().optional().nullable(),
  facilityName: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  currentStep: z.number().int().min(1).max(5).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
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

    auditPhiAccess(request, session, "view", "PriorAuthRequest", id, "Viewed PA request detail").catch(() => {});

    const paReq = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            dob: true,
            gender: true,
            phone: true,
            email: true,
            firstNameEncrypted: true,
            lastNameEncrypted: true,
            mrnEncrypted: true,
            dobEncrypted: true,
            phoneEncrypted: true,
            emailEncrypted: true,
          },
        },
        payer: {
          select: {
            id: true,
            name: true,
            payerId: true,
            type: true,
            rbmVendor: true,
          },
        },
        insurance: {
          select: {
            id: true,
            planName: true,
            planType: true,
            memberId: true,
            groupNumber: true,
            payerId: true,
            memberIdEncrypted: true,
            groupNumberEncrypted: true,
          },
        },
        createdBy: {
          select: { firstName: true, lastName: true },
        },
        assignedTo: {
          select: { firstName: true, lastName: true },
        },
        orderingPhysician: {
          select: { id: true, firstName: true, lastName: true, npiNumber: true },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: { select: { firstName: true, lastName: true } },
          },
        },
        statusChanges: {
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: { select: { firstName: true, lastName: true } },
          },
        },
        denials: {
          orderBy: { createdAt: "desc" },
        },
        appeals: {
          orderBy: { createdAt: "desc" },
          include: {
            filedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!paReq) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Dual-read: decrypt patient and insurance PHI fields
    const patient = decryptPatientRecord(paReq.patient);
    const insurance = paReq.insurance ? decryptInsuranceRecord(paReq.insurance) : null;

    return NextResponse.json({
      id: paReq.id,
      referenceNumber: paReq.referenceNumber,
      status: paReq.status,
      urgency: paReq.urgency,
      serviceCategory: paReq.serviceCategory,
      serviceType: paReq.serviceType,
      cptCodes: paReq.cptCodes,
      icd10Codes: paReq.icd10Codes,
      procedureDescription: paReq.procedureDescription,
      clinicalNotes: paReq.clinicalNotes,
      rbmVendor: paReq.rbmVendor,
      rbmReferenceNumber: paReq.rbmReferenceNumber,
      renderingPhysicianNpi: paReq.renderingPhysicianNpi,
      facilityName: paReq.facilityName,
      approvedUnits: paReq.approvedUnits,
      approvedCptCodes: paReq.approvedCptCodes,
      aiAuditResult: paReq.aiAuditResult,
      draftMetadata: paReq.draftMetadata,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        firstName: patient.firstName,
        lastName: patient.lastName,
        mrn: patient.mrn,
        dob: patient.dob instanceof Date ? patient.dob.toISOString() : String(patient.dob),
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
      },
      payer: paReq.payer,
      insurance,
      createdBy: `${paReq.createdBy.firstName} ${paReq.createdBy.lastName}`,
      assignedTo: paReq.assignedTo
        ? `${paReq.assignedTo.firstName} ${paReq.assignedTo.lastName}`
        : null,
      orderingPhysician: paReq.orderingPhysician
        ? {
            id: paReq.orderingPhysician.id,
            name: `${paReq.orderingPhysician.firstName} ${paReq.orderingPhysician.lastName}`,
            npi: paReq.orderingPhysician.npiNumber,
          }
        : null,
      createdAt: paReq.createdAt.toISOString(),
      updatedAt: paReq.updatedAt.toISOString(),
      submittedAt: paReq.submittedAt?.toISOString() || null,
      decidedAt: paReq.decidedAt?.toISOString() || null,
      expiresAt: paReq.expiresAt?.toISOString() || null,
      dueDate: paReq.dueDate?.toISOString() || null,
      scheduledDate: paReq.scheduledDate?.toISOString() || null,
      documents: paReq.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSize: d.fileSize,
        category: d.category,
        uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
        createdAt: d.createdAt.toISOString(),
      })),
      timeline: paReq.statusChanges.map((sc) => ({
        id: sc.id,
        fromStatus: sc.fromStatus,
        toStatus: sc.toStatus,
        note: sc.note,
        changedBy: `${sc.changedBy.firstName} ${sc.changedBy.lastName}`,
        createdAt: sc.createdAt.toISOString(),
      })),
      denials: paReq.denials.map((d) => ({
        id: d.id,
        denialDate: d.denialDate.toISOString(),
        reasonCode: d.reasonCode,
        reasonCategory: d.reasonCategory,
        reasonDescription: d.reasonDescription,
        payerNotes: d.payerNotes,
      })),
      appeals: paReq.appeals.map((a) => ({
        id: a.id,
        appealLevel: a.appealLevel,
        filedDate: a.filedDate.toISOString(),
        filedBy: `${a.filedBy.firstName} ${a.filedBy.lastName}`,
        appealReason: a.appealReason,
        status: a.status,
        decisionDate: a.decisionDate?.toISOString() || null,
        decisionNotes: a.decisionNotes,
      })),
    });
  } catch (error) {
    log.error("Request detail error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch request" }, { status: 500 });
  }
}

export async function PATCH(
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
    return NextResponse.json(
      { error: "Insufficient permissions. Viewers cannot update PA requests." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const { id } = await params;

    auditPhiAccess(request, session, "update", "PriorAuthRequest", id, "Updated PA request").catch(() => {});

    const body = await request.json();
    const parsed = updateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify the request exists and belongs to this org
    const existing = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Only allow editing drafts
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft requests can be edited" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (data.patientId !== undefined) updateData.patientId = data.patientId;
    if (data.serviceCategory !== undefined) updateData.serviceCategory = data.serviceCategory;
    if (data.serviceType !== undefined) updateData.serviceType = data.serviceType;
    if (data.cptCodes !== undefined) updateData.cptCodes = data.cptCodes;
    if (data.icd10Codes !== undefined) updateData.icd10Codes = data.icd10Codes;
    if (data.procedureDescription !== undefined) updateData.procedureDescription = data.procedureDescription;
    if (data.urgency !== undefined) updateData.urgency = data.urgency;
    if (data.clinicalNotes !== undefined) updateData.clinicalNotes = data.clinicalNotes;
    if (data.orderingPhysicianId !== undefined) updateData.orderingPhysicianId = data.orderingPhysicianId;
    if (data.renderingPhysicianNpi !== undefined) updateData.renderingPhysicianNpi = data.renderingPhysicianNpi;
    if (data.facilityName !== undefined) updateData.facilityName = data.facilityName;
    if (data.scheduledDate !== undefined) {
      updateData.scheduledDate = data.scheduledDate ? new Date(data.scheduledDate) : null;
    }
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    // Handle payer/insurance updates
    if (data.payerId !== undefined) {
      const payer = await prisma.payer.findFirst({
        where: {
          id: data.payerId,
          OR: [{ organizationId }, { organizationId: null }],
        },
      });
      if (!payer) {
        return NextResponse.json({ error: "Payer not found" }, { status: 404 });
      }
      updateData.payerId = data.payerId;
      updateData.rbmVendor = payer.rbmVendor;
    }
    if (data.insuranceId !== undefined) {
      if (data.insuranceId) {
        // Validate insurance belongs to the patient on this request
        const patientId = data.patientId || existing.patientId;
        const insurance = await prisma.patientInsurance.findFirst({
          where: { id: data.insuranceId, patientId },
        });
        if (!insurance) {
          return NextResponse.json(
            { error: "Insurance not found for this patient" },
            { status: 404 }
          );
        }
        updateData.insuranceId = data.insuranceId;
      } else {
        updateData.insuranceId = null;
      }
    }

    // Validate patient belongs to this org (if changing patient)
    if (data.patientId !== undefined && data.patientId !== existing.patientId) {
      const patient = await prisma.patient.findFirst({
        where: { id: data.patientId, organizationId },
      });
      if (!patient) {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 });
      }
    }

    // Store current step in draftMetadata (separate from aiAuditResult)
    if (data.currentStep !== undefined) {
      const existingMeta = (existing.draftMetadata as Record<string, unknown>) || {};
      updateData.draftMetadata = { ...existingMeta, currentStep: data.currentStep };
    }

    // Check if material fields are changing — if so, invalidate approvals
    const materialFields = [
      "cptCodes", "icd10Codes", "clinicalNotes", "payerId",
      "serviceType", "serviceCategory",
    ];
    const materialChange = materialFields.some((f) => f in updateData);

    // Atomic: update request + clear approvals if material fields changed
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.priorAuthRequest.update({
        where: { id },
        data: updateData,
      });

      if (materialChange) {
        await tx.submissionApproval.deleteMany({ where: { requestId: id } });
      }

      return result;
    });

    return NextResponse.json({
      id: updated.id,
      referenceNumber: updated.referenceNumber,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    log.error("Update request error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
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

    auditPhiAccess(request, session, "delete", "PriorAuthRequest", id, "Deleted PA request").catch(() => {});

    const existing = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Only allow deleting drafts
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft requests can be deleted" },
        { status: 400 }
      );
    }

    // Delete related records first
    await prisma.authDocument.deleteMany({ where: { priorAuthId: id } });
    await prisma.authStatusChange.deleteMany({ where: { priorAuthId: id } });
    await prisma.priorAuthRequest.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error("Delete request error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to delete request" }, { status: 500 });
  }
}
