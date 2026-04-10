import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { encryptPatientFields, decryptPatientRecord, decryptInsuranceRecord } from "@/lib/security/phi-crypto";
import { log } from "@/lib/logger";

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

    auditPhiAccess(request, session, "view", "Patient", id, "Viewed patient detail").catch(() => {});

    // Scoped to organization -- prevents cross-tenant access
    const patient = await prisma.patient.findFirst({
      where: { id, organizationId },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        insurances: {
          include: {
            payer: { select: { id: true, name: true } },
          },
          orderBy: { isPrimary: "desc" },
        },
        requests: {
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          include: {
            payer: { select: { id: true, name: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Dual-read: decrypt if encrypted fields are present
    const d = decryptPatientRecord(patient);

    return NextResponse.json({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      name: `${d.firstName} ${d.lastName}`,
      mrn: d.mrn,
      dob: d.dob instanceof Date ? d.dob.toISOString() : String(d.dob),
      gender: d.gender,
      phone: d.phone,
      email: d.email,
      address: d.address,
      organization: patient.organization,
      createdAt: patient.createdAt.toISOString(),
      insurances: patient.insurances.map((ins) => {
        const di = decryptInsuranceRecord(ins);
        return {
          id: di.id,
          planName: di.planName,
          planType: di.planType,
          memberId: di.memberId,
          groupNumber: di.groupNumber,
          isPrimary: di.isPrimary,
          effectiveDate: ins.effectiveDate.toISOString(),
          terminationDate: ins.terminationDate?.toISOString() || null,
          payer: ins.payer,
        };
      }),
      requests: patient.requests.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        status: r.status,
        urgency: r.urgency,
        serviceCategory: r.serviceCategory,
        serviceType: r.serviceType,
        cptCodes: r.cptCodes,
        payer: r.payer,
        createdBy: `${r.createdBy.firstName} ${r.createdBy.lastName}`,
        createdAt: r.createdAt.toISOString(),
        dueDate: r.dueDate?.toISOString() || null,
        submittedAt: r.submittedAt?.toISOString() || null,
        decidedAt: r.decidedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    log.error("Patient detail error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch patient" }, { status: 500 });
  }
}

// ─── PATCH: Update patient details ──────────────────────────

const emptyToNull = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  z.string().nullable().optional()
);

const updatePatientSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dob: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date of birth" }).optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  phone: emptyToNull,
  email: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    z.string().email().nullable().optional()
  ),
  address: emptyToNull,
});

/**
 * PATCH /api/patients/[id]
 * Update patient demographics. Only accessible for org's own patients.
 */
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
      { error: "Insufficient permissions. Viewers cannot update patients." },
      { status: 403 }
    );
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = updatePatientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid patient data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify patient belongs to org
    const existing = await prisma.patient.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    auditPhiAccess(request, session, "update", "Patient", id, "Updated patient demographics").catch(() => {});

    const data = parsed.data;

    // Build encrypted update — plaintext PHI columns are no longer written
    const phiUpdates: Record<string, string | null | undefined> = {};
    if (data.firstName !== undefined) phiUpdates.firstName = data.firstName;
    if (data.lastName !== undefined) phiUpdates.lastName = data.lastName;
    if (data.dob !== undefined) phiUpdates.dob = data.dob;
    if (data.phone !== undefined) phiUpdates.phone = data.phone ?? null;
    if (data.email !== undefined) phiUpdates.email = data.email ?? null;
    if (data.address !== undefined) phiUpdates.address = data.address ?? null;

    // Gender is not PHI — written directly
    const nonPhiUpdates: Record<string, unknown> = {};
    if (data.gender !== undefined) nonPhiUpdates.gender = data.gender;

    if (Object.keys(phiUpdates).length === 0 && Object.keys(nonPhiUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const encryptedUpdates = encryptPatientFields(phiUpdates);

    const updated = await prisma.patient.update({
      where: { id },
      data: { ...nonPhiUpdates, ...encryptedUpdates },
    });

    // Dual-read: decrypt the updated record before returning
    const du = decryptPatientRecord(updated);
    return NextResponse.json({
      id: du.id,
      firstName: du.firstName,
      lastName: du.lastName,
      name: `${du.firstName} ${du.lastName}`,
      mrn: du.mrn,
      dob: du.dob instanceof Date ? du.dob.toISOString() : String(du.dob),
      gender: du.gender,
      phone: du.phone,
      email: du.email,
      address: du.address,
      updatedAt: du.updatedAt instanceof Date ? du.updatedAt.toISOString() : String(du.updatedAt),
    });
  } catch (error) {
    log.error("Patient update error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update patient" }, { status: 500 });
  }
}
