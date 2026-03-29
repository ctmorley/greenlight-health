/**
 * Subscription Guard
 *
 * Helper for API routes to check subscription limits before
 * performing an action. Returns a NextResponse if blocked,
 * or null if allowed.
 */

import { NextResponse } from "next/server";
import { checkSubscriptionLimits } from "./limits";

type GuardAction = "create_user" | "create_pa" | "ai_call";

/**
 * Check subscription limits for an organization action.
 * Returns a 403 NextResponse if blocked, or null if allowed.
 *
 * Usage in API routes:
 * ```
 * const blocked = await guardSubscription(organizationId, "create_pa");
 * if (blocked) return blocked;
 * ```
 */
export async function guardSubscription(
  organizationId: string,
  action: GuardAction
): Promise<NextResponse | null> {
  try {
    const result = await checkSubscriptionLimits(organizationId, action);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: result.reason || "Action not allowed by your current plan",
          code: "SUBSCRIPTION_LIMIT",
          planId: result.planId,
          usage: result.usage,
        },
        { status: 403 }
      );
    }

    return null;
  } catch {
    // If billing check fails, don't block the action
    return null;
  }
}
