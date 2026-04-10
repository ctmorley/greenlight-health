import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { resolveTransport, getTransportEnvironment } from "@/lib/transport";

const rejectSchema = z.object({
  note: z.string().min(1, "Rejection reason is required").max(2000),
});

/**
 * POST /api/requests/[id]/reject-submission
 *
 * Rejects the request for live submission. Requires a reason.
 * Admin or pa_coordinator only.
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

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (!["admin", "pa_coordinator"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Only admins and PA coordinators can reject submissions" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = rejectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true, payerId: true, referenceNumber: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const environment = getTransportEnvironment();
    const transport = paRequest.payerId
      ? await resolveTransport(paRequest.payerId, organizationId, environment)
      : null;

    if (!transport) {
      return NextResponse.json(
        { error: "No transport configured for this payer" },
        { status: 422 }
      );
    }

    if (!transport.requiresHumanReview || transport.method === "simulated") {
      return NextResponse.json(
        { error: "This transport does not require human review" },
        { status: 422 }
      );
    }

    const approval = await prisma.submissionApproval.upsert({
      where: {
        requestId_transportId: { requestId: id, transportId: transport.id },
      },
      create: {
        requestId: id,
        transportId: transport.id,
        status: "rejected",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        note: parsed.data.note,
      },
      update: {
        status: "rejected",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        note: parsed.data.note,
      },
    });

    auditPhiAccess(
      request,
      session,
      "update",
      "SubmissionApproval",
      approval.id,
      `Rejected submission for ${paRequest.referenceNumber}: ${parsed.data.note}`
    ).catch(() => {});

    return NextResponse.json({
      approval: {
        id: approval.id,
        status: approval.status,
        transportId: transport.id,
        transportMethod: transport.method,
        reviewedAt: approval.reviewedAt?.toISOString(),
        note: approval.note,
      },
    });
  } catch (error) {
    console.error("Reject submission error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to reject submission" },
      { status: 500 }
    );
  }
}
