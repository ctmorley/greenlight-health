import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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

    // Scoped to organization — prevents cross-tenant access
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
