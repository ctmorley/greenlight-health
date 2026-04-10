/**
 * Stripe Client + Helpers
 *
 * Singleton Stripe client and helper functions for creating
 * checkout sessions, customer portal sessions, and managing
 * subscriptions.
 */

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getPlan } from "./plans";

// ─── Stripe Client ──────────────────────────────────────────

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripeInstance = new Stripe(key);
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ─── Customer Management ────────────────────────────────────

/**
 * Get or create a Stripe customer for an organization.
 */
export async function getOrCreateCustomer(
  organizationId: string
): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { stripeCustomerId: true, name: true, email: true },
  });

  if (org.stripeCustomerId) {
    return org.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    email: org.email || undefined,
    metadata: { organizationId },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// ─── Checkout Session ───────────────────────────────────────

/**
 * Create a Stripe Checkout session for subscribing to a plan.
 */
export async function createCheckoutSession(params: {
  organizationId: string;
  planId: string;
  billingPeriod: "monthly" | "annual";
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const plan = getPlan(params.planId);

  const priceId =
    params.billingPeriod === "annual"
      ? plan.stripePriceIdAnnual
      : plan.stripePriceIdMonthly;

  if (!priceId) {
    throw new Error(`No Stripe price configured for ${params.planId} (${params.billingPeriod})`);
  }

  const customerId = await getOrCreateCustomer(params.organizationId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: plan.trialDays,
      metadata: {
        organizationId: params.organizationId,
        planId: params.planId,
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      organizationId: params.organizationId,
      planId: params.planId,
    },
  });

  return session.url!;
}

// ─── Customer Portal ────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session for managing billing.
 */
export async function createPortalSession(
  organizationId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateCustomer(organizationId);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

// ─── Subscription Sync ──────────────────────────────────────

/**
 * Sync subscription state from Stripe to the database.
 * Called by webhook handlers after subscription events.
 */
export async function syncSubscription(
  subscription: Stripe.Subscription
): Promise<void> {
  const organizationId =
    subscription.metadata?.organizationId ||
    (typeof subscription.customer === "string"
      ? await resolveOrgFromCustomer(subscription.customer)
      : null);

  if (!organizationId) {
    console.error("[BILLING] Cannot resolve org for subscription", subscription.id);
    return;
  }

  const planId = subscription.metadata?.planId || "starter";

  // Compute next billing date from billing_cycle_anchor
  // In the latest Stripe API, current_period_end is removed;
  // we derive the next period from the anchor + monthly interval.
  const anchorMs = subscription.billing_cycle_anchor * 1000;
  const now = Date.now();
  const periodEnd = new Date(anchorMs);
  // Advance to the next future billing anchor
  while (periodEnd.getTime() <= now) {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      planId,
      planPeriodEnd: periodEnd,
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
  });
}

/**
 * Clear subscription fields when a subscription is fully deleted.
 */
export async function clearSubscription(
  subscription: Stripe.Subscription
): Promise<void> {
  const organizationId =
    subscription.metadata?.organizationId ||
    (typeof subscription.customer === "string"
      ? await resolveOrgFromCustomer(subscription.customer)
      : null);

  if (!organizationId) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      subscriptionStatus: "canceled",
      planPeriodEnd: null,
      trialEndsAt: null,
    },
  });
}

/**
 * Resolve organization ID from a Stripe customer ID.
 */
async function resolveOrgFromCustomer(
  customerId: string
): Promise<string | null> {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return org?.id || null;
}
