/**
 * POST /api/billing/checkout-session
 *
 * Creates a Stripe Checkout session for subscribing to a plan.
 * Returns the checkout URL for client-side redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCheckoutSession, isStripeConfigured } from "@/lib/billing";
import { log } from "@/lib/logger";

const checkoutSchema = z.object({
  planId: z.enum(["starter", "professional"]),
  billingPeriod: z.enum(["monthly", "annual"]).default("monthly"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkoutUrl = await createCheckoutSession({
      organizationId,
      planId: parsed.data.planId,
      billingPeriod: parsed.data.billingPeriod,
      successUrl: `${appUrl}/app/settings?tab=billing&checkout=success`,
      cancelUrl: `${appUrl}/app/settings?tab=billing&checkout=canceled`,
    });

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    log.error("Checkout session error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
