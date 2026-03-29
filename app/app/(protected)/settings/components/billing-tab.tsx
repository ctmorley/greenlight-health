"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PLANS, formatPrice, FEATURE_LIST, type PlanDefinition } from "@/lib/billing/plans";

// ─── Types ──────────────────────────────────────────────────

interface BillingStatus {
  plan: {
    id: string;
    name: string;
    description: string;
    monthlyPrice: number;
  };
  subscription: {
    status: string;
    periodEnd: string | null;
    trialEndsAt: string | null;
    hasStripeCustomer: boolean;
  };
  usage: {
    users: number;
    paRequestsThisMonth: number;
    aiCallsThisMonth: number;
  };
  limits: {
    maxUsers: number;
    maxPaRequests: number;
    maxAiCalls: number;
    ehrIntegration: boolean;
    autonomyEngine: boolean;
    apiAccess: boolean;
    sso: boolean;
    dedicatedSupport: boolean;
  };
}

// ─── Usage Bar ──────────────────────────────────────────────

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isHigh = pct >= 80;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-mono text-text-muted">
          {used.toLocaleString()} / {isUnlimited ? "Unlimited" : limit.toLocaleString()}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isHigh ? "bg-amber-400" : "bg-emerald-400"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────

function SubscriptionBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "success" | "warning" | "danger" | "info" | "default"; label: string }> = {
    active: { variant: "success", label: "Active" },
    trialing: { variant: "info", label: "Trial" },
    past_due: { variant: "warning", label: "Past Due" },
    canceled: { variant: "danger", label: "Canceled" },
    unpaid: { variant: "danger", label: "Unpaid" },
    none: { variant: "default", label: "No Subscription" },
  };
  const c = config[status] || config.none;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// ─── Plan Card ──────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  onSelect,
  loading,
}: {
  plan: PlanDefinition;
  isCurrent: boolean;
  onSelect: (planId: string) => void;
  loading: boolean;
}) {
  const isEnterprise = plan.id === "enterprise";

  return (
    <div
      className={`relative p-5 rounded-xl border transition-all ${
        isCurrent
          ? "border-emerald-500/40 bg-emerald-500/5"
          : plan.popular
            ? "border-violet-500/30 bg-violet-500/5"
            : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {plan.popular && !isCurrent && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <Badge variant="info" size="sm">Most Popular</Badge>
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <Badge variant="success" size="sm">Current Plan</Badge>
        </div>
      )}

      <h3 className="text-lg font-semibold text-text-primary mb-1">{plan.name}</h3>
      <p className="text-xs text-text-muted mb-3">{plan.description}</p>

      <div className="mb-4">
        {isEnterprise ? (
          <span className="text-2xl font-bold text-text-primary">Custom</span>
        ) : (
          <>
            <span className="text-2xl font-bold text-text-primary">
              {formatPrice(plan.monthlyPrice)}
            </span>
            <span className="text-sm text-text-muted">/mo</span>
          </>
        )}
      </div>

      <ul className="space-y-1.5 mb-4">
        {FEATURE_LIST.map((feat) => {
          const value = plan.limits[feat.key as keyof typeof plan.limits];
          const display = feat.format(value as never);
          const isAvailable = display !== "—";

          return (
            <li key={feat.key} className="flex items-center gap-2 text-xs">
              <span className={isAvailable ? "text-emerald-400" : "text-text-muted"}>
                {isAvailable ? "+" : "-"}
              </span>
              <span className={isAvailable ? "text-text-secondary" : "text-text-muted"}>
                {feat.label}: {display}
              </span>
            </li>
          );
        })}
      </ul>

      {isCurrent ? (
        <Button variant="outline" size="sm" disabled className="w-full">
          Current Plan
        </Button>
      ) : isEnterprise ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => window.open("mailto:sales@greenlighthealth.com?subject=Enterprise%20Plan%20Inquiry", "_blank")}
        >
          Contact Sales
        </Button>
      ) : (
        <Button
          variant={plan.popular ? "primary" : "secondary"}
          size="sm"
          className="w-full"
          onClick={() => onSelect(plan.id)}
          isLoading={loading}
        >
          {isCurrent ? "Current" : "Subscribe"}
        </Button>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function BillingTab({ isAdmin }: { isAdmin: boolean }) {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch {
      // Billing may not be configured yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // Handle checkout success/cancel from URL params
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      addToast("Subscription activated successfully!", "success");
      fetchBilling(); // Refresh billing status
    } else if (checkout === "canceled") {
      addToast("Checkout was canceled", "error");
    }
  }, [searchParams, addToast, fetchBilling]);

  const handleSubscribe = async (planId: string) => {
    if (!isAdmin) {
      addToast("Only admins can manage billing", "error");
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingPeriod: "monthly" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start checkout");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Checkout failed", "error");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal-session", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to open billing portal");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Portal failed", "error");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" padding="md">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="h-24 bg-white/5 rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-white/5 rounded-xl" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  const currentPlanId = billing?.plan.id || "starter";
  const hasSubscription = billing?.subscription.status &&
    billing.subscription.status !== "none";

  return (
    <div className="space-y-6">
      {/* ── Current Plan & Usage ── */}
      <Card variant="glass" padding="md">
        <div className="flex items-center justify-between mb-4">
          <CardTitle>
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
              Billing & Subscription
            </span>
          </CardTitle>
          {hasSubscription && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageBilling}
              isLoading={portalLoading}
            >
              Manage Billing
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Plan info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">Plan:</span>
              <span className="text-sm font-semibold text-text-primary">
                {billing?.plan.name || "Starter"}
              </span>
              <SubscriptionBadge status={billing?.subscription.status || "none"} />
            </div>

            {billing?.subscription.trialEndsAt && (
              <p className="text-xs text-amber-400">
                Trial ends {new Date(billing.subscription.trialEndsAt).toLocaleDateString()}
              </p>
            )}

            {billing?.subscription.periodEnd && billing.subscription.status === "active" && (
              <p className="text-xs text-text-muted">
                Renews {new Date(billing.subscription.periodEnd).toLocaleDateString()}
              </p>
            )}

            {billing?.subscription.status === "past_due" && (
              <p className="text-xs text-red-400">
                Payment failed. Please update your payment method to avoid interruption.
              </p>
            )}
          </div>

          {/* Usage meters */}
          {billing && (
            <div className="space-y-3">
              <UsageBar
                label="Team Members"
                used={billing.usage.users}
                limit={billing.limits.maxUsers}
              />
              <UsageBar
                label="PA Requests (this month)"
                used={billing.usage.paRequestsThisMonth}
                limit={billing.limits.maxPaRequests}
              />
              <UsageBar
                label="AI Calls (this month)"
                used={billing.usage.aiCallsThisMonth}
                limit={billing.limits.maxAiCalls}
              />
            </div>
          )}
        </div>
      </Card>

      {/* ── Plans Comparison ── */}
      <Card variant="glass" padding="md">
        <CardTitle className="mb-5">
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
            </svg>
            Plans
          </span>
        </CardTitle>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={currentPlanId === plan.id}
              onSelect={handleSubscribe}
              loading={checkoutLoading}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
