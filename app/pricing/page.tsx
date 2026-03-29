"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, formatPrice, FEATURE_LIST, type PlanDefinition } from "@/lib/billing/plans";

// ─── Toggle ───���─────────────────────────────────────────────

function BillingToggle({
  period,
  onChange,
}: {
  period: "monthly" | "annual";
  onChange: (p: "monthly" | "annual") => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 mb-10">
      <span
        className={`text-sm cursor-pointer transition-colors ${
          period === "monthly" ? "text-white font-semibold" : "text-white/40"
        }`}
        onClick={() => onChange("monthly")}
      >
        Monthly
      </span>
      <button
        onClick={() => onChange(period === "monthly" ? "annual" : "monthly")}
        className="relative w-12 h-6 rounded-full bg-white/10 border border-white/10 transition-colors"
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-emerald-500 transition-all duration-200 ${
            period === "annual" ? "left-[26px]" : "left-0.5"
          }`}
        />
      </button>
      <span
        className={`text-sm cursor-pointer transition-colors ${
          period === "annual" ? "text-white font-semibold" : "text-white/40"
        }`}
        onClick={() => onChange("annual")}
      >
        Annual
        <span className="ml-1.5 text-xs text-emerald-400 font-medium">Save 17%</span>
      </span>
    </div>
  );
}

// ─── Plan Card ──────────────────────────────────────────────

function PricingCard({
  plan,
  period,
}: {
  plan: PlanDefinition;
  period: "monthly" | "annual";
}) {
  const isEnterprise = plan.id === "enterprise";
  const price = period === "annual" ? plan.annualPrice : plan.monthlyPrice;

  return (
    <div
      className={`relative flex flex-col p-8 rounded-2xl border transition-all ${
        plan.popular
          ? "border-emerald-500/40 bg-emerald-500/5 shadow-lg shadow-emerald-900/10 scale-[1.02]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 rounded-full bg-emerald-500 text-white text-xs font-semibold">
            Most Popular
          </span>
        </div>
      )}

      <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
      <p className="text-sm text-white/50 mb-6 min-h-[40px]">{plan.description}</p>

      <div className="mb-8">
        {isEnterprise ? (
          <span className="text-4xl font-bold text-white">Custom</span>
        ) : (
          <>
            <span className="text-4xl font-bold text-white">{formatPrice(price)}</span>
            <span className="text-white/40 ml-1">/mo</span>
            {period === "annual" && (
              <p className="text-xs text-emerald-400 mt-1">
                Billed annually ({formatPrice(price * 12)}/yr)
              </p>
            )}
          </>
        )}
      </div>

      {isEnterprise ? (
        <a
          href="mailto:sales@greenlighthealth.com?subject=Enterprise%20Plan%20Inquiry"
          className="block w-full text-center px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 transition-colors mb-8"
        >
          Contact Sales
        </a>
      ) : (
        <Link
          href={`/app/register?plan=${plan.id}`}
          className={`block w-full text-center px-6 py-3 rounded-xl font-semibold text-sm transition-colors mb-8 ${
            plan.popular
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
              : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
          }`}
        >
          Start {plan.trialDays}-day free trial
        </Link>
      )}

      <ul className="space-y-3 flex-1">
        {FEATURE_LIST.map((feat) => {
          const value = plan.limits[feat.key as keyof typeof plan.limits];
          const display = feat.format(value as never);
          const isAvailable = display !== "—";

          return (
            <li key={feat.key} className="flex items-center gap-3 text-sm">
              {isAvailable ? (
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              )}
              <span className={isAvailable ? "text-white/80" : "text-white/30"}>
                {feat.label}: <span className="font-medium">{display}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default function PricingPage() {
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="min-h-screen bg-[#080C14] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <span className="text-emerald-400">Green</span>Light
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/app/login"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/app/register"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto text-center pt-16 pb-8 px-4">
        <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto">
          Start with a free trial. No credit card required. Upgrade when you're ready to
          automate your prior authorization workflow.
        </p>
      </div>

      <BillingToggle period={period} onChange={setPeriod} />

      {/* Plans grid */}
      <div className="max-w-6xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.values(PLANS).map((plan) => (
            <PricingCard key={plan.id} plan={plan} period={period} />
          ))}
        </div>

        {/* Trust signals */}
        <div className="mt-16 text-center">
          <p className="text-sm text-white/30 mb-6">Trusted by healthcare organizations</p>
          <div className="flex flex-wrap items-center justify-center gap-8 text-white/20 text-sm">
            <span>HIPAA Compliant</span>
            <span className="text-white/10">|</span>
            <span>SOC 2 Controls</span>
            <span className="text-white/10">|</span>
            <span>AES-256 Encryption</span>
            <span className="text-white/10">|</span>
            <span>FHIR R4 / Da Vinci IG</span>
            <span className="text-white/10">|</span>
            <span>BAA Available</span>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "What happens after my free trial?",
                a: "Your trial includes full access to all features in your selected plan. After the trial ends, you'll be prompted to add a payment method to continue. No charges during the trial period.",
              },
              {
                q: "Can I change plans later?",
                a: "Yes, you can upgrade or downgrade at any time from Settings > Billing. Changes take effect immediately, with prorated billing.",
              },
              {
                q: "Do you sign BAAs?",
                a: "Yes. We provide Business Associate Agreements for all paid plans. Enterprise plans include a custom BAA review process.",
              },
              {
                q: "What EHR systems do you integrate with?",
                a: "GreenLight supports Epic, Oracle Health (Cerner), MEDITECH, athenahealth, Veradigm, and eClinicalWorks via SMART on FHIR. EHR integration is available on Professional and Enterprise plans.",
              },
              {
                q: "How does AI autonomy work?",
                a: "Our AI engine can predict approval probability, generate Letters of Medical Necessity, summarize clinical justification, and draft appeal letters automatically. Professional plans unlock the full autonomy engine for hands-free workflows.",
              },
            ].map((faq, i) => (
              <div key={i} className="border-b border-white/5 pb-5">
                <h3 className="text-sm font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
