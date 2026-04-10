import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { resolveTransport, getTransportEnvironment } from "@/lib/transport";

/**
 * GET /api/requests/[id]/submission-approval
 *
 * Returns the current approval state for the request's active transport.
 */
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

  const { id } = await params;

  const paRequest = await prisma.priorAuthRequest.findFirst({
    where: { id, organizationId },
    select: { id: true, payerId: true },
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
    return NextResponse.json({
      approval: null,
      transportId: null,
      transportMethod: null,
      requiresHumanReview: false,
      approvalRequired: false,
    });
  }

  const approvalRequired =
    transport.requiresHumanReview && transport.method !== "simulated";

  // Look up existing approval for this request + transport
  const approval = await prisma.submissionApproval.findUnique({
    where: {
      requestId_transportId: { requestId: id, transportId: transport.id },
    },
    include: {
      reviewedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  return NextResponse.json({
    approval: approval
      ? {
          id: approval.id,
          status: approval.status,
          reviewedBy: approval.reviewedBy
            ? `${approval.reviewedBy.firstName} ${approval.reviewedBy.lastName}`
            : null,
          reviewedAt: approval.reviewedAt?.toISOString() ?? null,
          note: approval.note,
          createdAt: approval.createdAt.toISOString(),
        }
      : null,
    transportId: transport.id,
    transportMethod: transport.method,
    requiresHumanReview: transport.requiresHumanReview,
    approvalRequired,
  });
}
