/**
 * GET /api/billing/status
 *
 * Returns current subscription status, plan info, and usage
 * counts for the authenticated user's organization.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlan, checkSubscriptionLimits } from "@/lib/billing";
import { log } from "@/lib/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        planId: true,
        subscriptionStatus: true,
        planPeriodEnd: true,
        trialEndsAt: true,
        stripeCustomerId: true,
      },
    });

    const planId = org.planId || "starter";
    const plan = getPlan(planId);
    const limitCheck = await checkSubscriptionLimits(organizationId);

    return NextResponse.json({
      plan: {
        id: planId,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
      },
      subscription: {
        status: org.subscriptionStatus || "none",
        periodEnd: org.planPeriodEnd?.toISOString() || null,
        trialEndsAt: org.trialEndsAt?.toISOString() || null,
        hasStripeCustomer: !!org.stripeCustomerId,
      },
      usage: limitCheck.usage,
      limits: limitCheck.limits,
    });
  } catch (error) {
    log.error("Billing status error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch billing status" }, { status: 500 });
  }
}
