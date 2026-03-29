/**
 * POST /api/billing/portal-session
 *
 * Creates a Stripe Customer Portal session for managing billing,
 * payment methods, invoices, and plan changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createPortalSession, isStripeConfigured } from "@/lib/billing";

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const portalUrl = await createPortalSession(
      organizationId,
      `${appUrl}/app/settings?tab=billing`
    );

    return NextResponse.json({ url: portalUrl });
  } catch (error) {
    console.error("Portal session error:", error);
    return NextResponse.json({ error: "Failed to create billing portal session" }, { status: 500 });
  }
}
