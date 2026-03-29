/**
 * Plan Definitions
 *
 * Single source of truth for pricing tiers, feature limits,
 * and Stripe price IDs. When setting up Stripe products, create
 * prices matching these IDs and paste them here.
 */

export interface PlanLimit {
  maxUsers: number;
  maxPaRequests: number; // per month
  maxAiCalls: number; // per month
  ehrIntegration: boolean;
  autonomyEngine: boolean;
  customBranding: boolean;
  apiAccess: boolean;
  sso: boolean;
  dedicatedSupport: boolean;
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number; // cents
  annualPrice: number; // cents (per month, billed annually)
  trialDays: number;
  limits: PlanLimit;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
  popular?: boolean;
}

export const PLANS: Record<string, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "For solo practices and small groups getting started with AI-powered PA",
    monthlyPrice: 29900, // $299
    annualPrice: 24900, // $249/mo billed annually
    trialDays: 14,
    limits: {
      maxUsers: 3,
      maxPaRequests: 50,
      maxAiCalls: 100,
      ehrIntegration: false,
      autonomyEngine: false,
      customBranding: false,
      apiAccess: false,
      sso: false,
      dedicatedSupport: false,
    },
    stripePriceIdMonthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || "",
    stripePriceIdAnnual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || "",
  },
  professional: {
    id: "professional",
    name: "Professional",
    description: "For growing practices that want full AI autonomy and EHR integration",
    monthlyPrice: 79900, // $799
    annualPrice: 66900, // $669/mo billed annually
    trialDays: 14,
    popular: true,
    limits: {
      maxUsers: 15,
      maxPaRequests: -1, // unlimited
      maxAiCalls: -1, // unlimited
      ehrIntegration: true,
      autonomyEngine: true,
      customBranding: false,
      apiAccess: true,
      sso: false,
      dedicatedSupport: false,
    },
    stripePriceIdMonthly: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || "",
    stripePriceIdAnnual: process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID || "",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "For health systems with dedicated EHR integration, SSO, and support",
    monthlyPrice: 0, // custom pricing
    annualPrice: 0,
    trialDays: 30,
    limits: {
      maxUsers: -1, // unlimited
      maxPaRequests: -1,
      maxAiCalls: -1,
      ehrIntegration: true,
      autonomyEngine: true,
      customBranding: true,
      apiAccess: true,
      sso: true,
      dedicatedSupport: true,
    },
    stripePriceIdMonthly: "",
    stripePriceIdAnnual: "",
  },
};

export const PLAN_IDS = Object.keys(PLANS) as Array<keyof typeof PLANS>;

/**
 * Get plan definition by ID. Returns starter as fallback.
 */
export function getPlan(planId: string): PlanDefinition {
  return PLANS[planId] || PLANS.starter;
}

/**
 * Format cents to dollar string.
 */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Custom";
  return `$${(cents / 100).toLocaleString()}`;
}

/**
 * Feature labels for comparison tables.
 */
export const FEATURE_LIST = [
  { key: "maxUsers", label: "Team members", format: (v: number) => (v === -1 ? "Unlimited" : `Up to ${v}`) },
  { key: "maxPaRequests", label: "PA requests / month", format: (v: number) => (v === -1 ? "Unlimited" : `${v}`) },
  { key: "maxAiCalls", label: "AI calls / month", format: (v: number) => (v === -1 ? "Unlimited" : `${v}`) },
  { key: "ehrIntegration", label: "EHR integration", format: (v: boolean) => (v ? "Yes" : "—") },
  { key: "autonomyEngine", label: "AI autonomy engine", format: (v: boolean) => (v ? "Yes" : "—") },
  { key: "apiAccess", label: "API access", format: (v: boolean) => (v ? "Yes" : "—") },
  { key: "sso", label: "SSO (SAML/OIDC)", format: (v: boolean) => (v ? "Yes" : "—") },
  { key: "dedicatedSupport", label: "Dedicated support", format: (v: boolean) => (v ? "Yes" : "—") },
] as const;
