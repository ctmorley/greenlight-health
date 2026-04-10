import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkPaStatus } from "@/lib/status-tracker/checker";
import { log } from "@/lib/logger";

/**
 * POST /api/requests/[id]/check-status
 * Triggers a manual status check for a PA request.
 * Simulates a payer response, updates status if changed,
 * and dispatches notifications.
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

  try {
    const { id } = await params;

    // Verify the PA request belongs to this organization
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true, referenceNumber: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    auditPhiAccess(
      request,
      session,
      "status_check",
      "PriorAuthRequest",
      id,
      "Manual status check triggered"
    ).catch(() => {});

    // Run the status check
    const result = await checkPaStatus(id, session.user.id, "manual");

    return NextResponse.json({
      statusCheck: result,
    });
  } catch (error) {
    log.error("Check status error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}
