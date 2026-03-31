import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

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

    return NextResponse.json({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      name: `${patient.firstName} ${patient.lastName}`,
      mrn: patient.mrn,
      dob: patient.dob.toISOString(),
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      organization: patient.organization,
      createdAt: patient.createdAt.toISOString(),
      insurances: patient.insurances.map((ins) => ({
        id: ins.id,
        planName: ins.planName,
        planType: ins.planType,
        memberId: ins.memberId,
        groupNumber: ins.groupNumber,
        isPrimary: ins.isPrimary,
        effectiveDate: ins.effectiveDate.toISOString(),
        terminationDate: ins.terminationDate?.toISOString() || null,
        payer: ins.payer,
      })),
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
    console.error("Patient detail error:", error);
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
    const updateData: Record<string, unknown> = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dob !== undefined) updateData.dob = new Date(data.dob);
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.address !== undefined) updateData.address = data.address;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.patient.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      name: `${updated.firstName} ${updated.lastName}`,
      mrn: updated.mrn,
      dob: updated.dob.toISOString(),
      gender: updated.gender,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Patient update error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update patient" }, { status: 500 });
  }
}
