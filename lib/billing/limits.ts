/**
 * Subscription Limit Checking
 *
 * Checks current usage against plan limits. Called by API routes
 * and middleware to enforce subscription gates.
 */

import { prisma } from "@/lib/prisma";
import { getPlan, type PlanLimit } from "./plans";

export interface UsageCounts {
  users: number;
  paRequestsThisMonth: number;
  aiCallsThisMonth: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  usage: UsageCounts;
  limits: PlanLimit;
  planId: string;
  subscriptionStatus: string | null;
}

/**
 * Get current usage counts for an organization.
 */
export async function getUsageCounts(
  organizationId: string
): Promise<UsageCounts> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [users, paRequestsThisMonth] = await Promise.all([
    prisma.user.count({
      where: { organizationId, isActive: true },
    }),
    prisma.priorAuthRequest.count({
      where: {
        organizationId,
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  // AI calls are tracked via audit logs with action "ai_generate"
  const aiCallsThisMonth = await prisma.auditLog.count({
    where: {
      organizationId,
      action: "ai_generate",
      createdAt: { gte: startOfMonth },
    },
  });

  return { users, paRequestsThisMonth, aiCallsThisMonth };
}

/**
 * Check if the organization can perform the given action
 * based on their subscription plan limits.
 */
export async function checkSubscriptionLimits(
  organizationId: string,
  action?: "create_user" | "create_pa" | "ai_call"
): Promise<LimitCheckResult> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      planId: true,
      subscriptionStatus: true,
      planPeriodEnd: true,
      trialEndsAt: true,
    },
  });

  const planId = org.planId || "starter";
  const plan = getPlan(planId);
  const usage = await getUsageCounts(organizationId);

  // Check subscription status
  const activeStatuses = ["active", "trialing"];
  if (org.subscriptionStatus && !activeStatuses.includes(org.subscriptionStatus)) {
    // Allow a 3-day grace period after past_due
    if (org.subscriptionStatus === "past_due" && org.planPeriodEnd) {
      const gracePeriodEnd = new Date(org.planPeriodEnd.getTime() + 3 * 24 * 60 * 60 * 1000);
      if (new Date() > gracePeriodEnd) {
        return {
          allowed: false,
          reason: "Your subscription payment is past due. Please update your payment method.",
          usage,
          limits: plan.limits,
          planId,
          subscriptionStatus: org.subscriptionStatus,
        };
      }
    } else if (org.subscriptionStatus !== "past_due") {
      return {
        allowed: false,
        reason: "Your subscription is inactive. Please subscribe to continue.",
        usage,
        limits: plan.limits,
        planId,
        subscriptionStatus: org.subscriptionStatus,
      };
    }
  }

  // If no subscription at all, allow with starter limits (trial/free mode)
  // Organizations start in a free trial — subscription is created when they
  // go through Stripe checkout.

  // Check specific action limits
  if (action === "create_user" && plan.limits.maxUsers !== -1) {
    if (usage.users >= plan.limits.maxUsers) {
      return {
        allowed: false,
        reason: `Your ${plan.name} plan allows up to ${plan.limits.maxUsers} users. Upgrade to add more.`,
        usage,
        limits: plan.limits,
        planId,
        subscriptionStatus: org.subscriptionStatus,
      };
    }
  }

  if (action === "create_pa" && plan.limits.maxPaRequests !== -1) {
    if (usage.paRequestsThisMonth >= plan.limits.maxPaRequests) {
      return {
        allowed: false,
        reason: `You've reached your monthly limit of ${plan.limits.maxPaRequests} PA requests. Upgrade for unlimited.`,
        usage,
        limits: plan.limits,
        planId,
        subscriptionStatus: org.subscriptionStatus,
      };
    }
  }

  if (action === "ai_call" && plan.limits.maxAiCalls !== -1) {
    if (usage.aiCallsThisMonth >= plan.limits.maxAiCalls) {
      return {
        allowed: false,
        reason: `You've reached your monthly limit of ${plan.limits.maxAiCalls} AI calls. Upgrade for unlimited.`,
        usage,
        limits: plan.limits,
        planId,
        subscriptionStatus: org.subscriptionStatus,
      };
    }
  }

  return {
    allowed: true,
    usage,
    limits: plan.limits,
    planId,
    subscriptionStatus: org.subscriptionStatus,
  };
}
