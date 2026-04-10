/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook endpoint. Verifies signature, then handles
 * subscription lifecycle events to keep org billing state in sync.
 *
 * IMPORTANT: This route must NOT use the standard auth middleware.
 * Stripe sends webhooks directly — no user session involved.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, syncSubscription, clearSubscription } from "@/lib/billing";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("[STRIPE WEBHOOK] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("[STRIPE WEBHOOK] Signature verification failed", { error: message });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed → activate subscription ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          // Merge org/plan metadata from checkout session into subscription
          if (session.metadata?.organizationId) {
            await stripe.subscriptions.update(subscription.id, {
              metadata: {
                organizationId: session.metadata.organizationId,
                planId: session.metadata.planId || "starter",
              },
            });
            subscription.metadata = {
              ...subscription.metadata,
              organizationId: session.metadata.organizationId,
              planId: session.metadata.planId || "starter",
            };
          }
          await syncSubscription(subscription);
        }
        break;
      }

      // ── Subscription updated (plan change, renewal, trial end) ──
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription);
        break;
      }

      // ── Subscription deleted ──
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await clearSubscription(subscription);
        break;
      }

      // ── Invoice paid → subscription renewed successfully ──
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subDetails = invoice.parent?.subscription_details;
        const paidSubId = subDetails
          ? typeof subDetails.subscription === "string"
            ? subDetails.subscription
            : subDetails.subscription?.id
          : null;
        if (paidSubId) {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(paidSubId);
          await syncSubscription(subscription);
        }
        break;
      }

      // ── Invoice payment failed → subscription at risk ──
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const failSubDetails = invoice.parent?.subscription_details;
        const failedSubId = failSubDetails
          ? typeof failSubDetails.subscription === "string"
            ? failSubDetails.subscription
            : failSubDetails.subscription?.id
          : null;
        if (failedSubId) {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(failedSubId);
          await syncSubscription(subscription);
        }
        break;
      }

      default:
        // Unhandled event type — safe to ignore
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    log.error("[STRIPE WEBHOOK] Handler error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
