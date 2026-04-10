import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { resolveTransport, getTransportEnvironment } from "@/lib/transport";

const approveSchema = z.object({
  note: z.string().max(2000).optional(),
});

/**
 * POST /api/requests/[id]/approve-submission
 *
 * Approves the request for live submission on the resolved active transport.
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
      { error: "Only admins and PA coordinators can approve submissions" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = approveSchema.safeParse(body);
    const note = parsed.success ? parsed.data.note : undefined;

    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true, payerId: true, referenceNumber: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Resolve the active transport
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

    // Upsert approval (idempotent — re-approval updates the record)
    const approval = await prisma.submissionApproval.upsert({
      where: {
        requestId_transportId: { requestId: id, transportId: transport.id },
      },
      create: {
        requestId: id,
        transportId: transport.id,
        status: "approved",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        note: note || null,
      },
      update: {
        status: "approved",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        note: note || null,
      },
    });

    auditPhiAccess(
      request,
      session,
      "update",
      "SubmissionApproval",
      approval.id,
      `Approved submission for ${paRequest.referenceNumber} via ${transport.method}`
    ).catch(() => {});

    return NextResponse.json({
      approval: {
        id: approval.id,
        status: approval.status,
        transportId: transport.id,
        transportMethod: transport.method,
        reviewedAt: approval.reviewedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Approve submission error:", error);
    return NextResponse.json(
      { error: "Failed to approve submission" },
      { status: 500 }
    );
  }
}
