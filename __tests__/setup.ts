/**
 * Global test setup for Vitest.
 * Mocks external services and shared utilities to prevent real HTTP calls.
 */
import { vi } from "vitest";

// ─── Mock @/lib/auth ─────────────────────────────────────────
// The default mock returns null (unauthenticated). Tests override via mockSession().
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// ─── Mock @/lib/security/audit-log ───────────────────────────
vi.mock("@/lib/security/audit-log", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
  auditPhiAccess: vi.fn().mockResolvedValue(undefined),
  extractRequestInfo: vi.fn().mockReturnValue({
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
    requestPath: "/api/test",
  }),
}));

// ─── Mock @/lib/security/rate-limit ──────────────────────────
// Never rate-limit in tests.
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
  RATE_LIMITS: {
    auth: { limit: 10, windowSeconds: 900 },
    api: { limit: 100, windowSeconds: 60 },
    fhir: { limit: 30, windowSeconds: 60 },
    cdsHooks: { limit: 60, windowSeconds: 60 },
    submit: { limit: 5, windowSeconds: 60 },
    ai: { limit: 10, windowSeconds: 60 },
  },
}));

// ─── Mock @/lib/billing ──────────────────────────────────────
vi.mock("@/lib/billing", () => ({
  guardSubscription: vi.fn().mockResolvedValue(null),
  checkSubscriptionLimits: vi.fn().mockResolvedValue({
    allowed: true,
    usage: { users: 1, paRequestsThisMonth: 0, aiCallsThisMonth: 0 },
    limits: { maxUsers: 3, maxPaRequests: 50, maxAiCalls: 100 },
    planId: "starter",
    subscriptionStatus: "active",
  }),
  isStripeConfigured: vi.fn().mockReturnValue(false),
  createCheckoutSession: vi.fn().mockResolvedValue(null),
  getOrCreateCustomer: vi.fn().mockResolvedValue("cus_test"),
  syncSubscription: vi.fn().mockResolvedValue(undefined),
  getUsageCounts: vi.fn().mockResolvedValue({ users: 1, paRequestsThisMonth: 0, aiCallsThisMonth: 0 }),
  getPlan: vi.fn().mockReturnValue({
    id: "starter",
    name: "Starter",
    limits: { maxUsers: 3, maxPaRequests: 50, maxAiCalls: 100 },
  }),
  PLANS: {},
  formatPrice: vi.fn().mockReturnValue("$299"),
}));

// ─── Mock @/lib/notifications/service ────────────────────────
vi.mock("@/lib/notifications/service", () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_EVENTS: ["pa_submitted", "pa_approved", "pa_denied", "pa_pended", "appeal_filed", "appeal_decided"],
  getNotificationEvents: vi.fn().mockReturnValue([]),
}));

// ─── Mock @/lib/status-tracker/checker ───────────────────────
vi.mock("@/lib/status-tracker/checker", () => ({
  checkPaStatus: vi.fn().mockResolvedValue({
    id: "check-1",
    requestId: "req-1",
    checkType: "manual",
    payerResponseCode: "A1",
    payerMessage: "Approved",
    previousStatus: "submitted",
    newStatus: "approved",
    statusChanged: true,
    responseTimeMs: 150,
    createdAt: new Date().toISOString(),
  }),
}));

// ─── Mock Stripe SDK ─────────────────────────────────────────
vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      customers: { create: vi.fn(), retrieve: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
      subscriptions: { retrieve: vi.fn() },
    })),
  };
});

// ─── Mock @anthropic-ai/sdk ─────────────────────────────────
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Mock AI response" }],
        }),
      },
    })),
  };
});

// ─── Mock resend ─────────────────────────────────────────────
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "email-1" }),
    },
  })),
}));

// ─── Mock bcryptjs ───────────────────────────────────────────
// Use fast hashing in tests.
vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
  compare: vi.fn().mockResolvedValue(true),
}));
