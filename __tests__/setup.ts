/**
 * Global test setup for Vitest.
 * Mocks external services and shared utilities to prevent real HTTP calls.
 */
import { vi, beforeAll, afterAll } from "vitest";

// ─── Network guard: prevent real HTTP requests in tests ─────
// Override global fetch to prevent any real HTTP calls from leaking out.
const originalFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].toString() : (args[0] as Request).url;
    throw new Error(`[TEST NETWORK GUARD] Real HTTP request blocked: ${url}. All external calls must be mocked.`);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ─── Mock @/lib/auth ─────────────────────────────────────────
// The default mock returns null (unauthenticated). Tests override via mockSession().
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// ─── Mock @/lib/security/phi-crypto ─────────────────────────
// In tests, encrypt/decrypt are identity functions and blindIndex returns a deterministic hash.
vi.mock("@/lib/security/phi-crypto", () => ({
  encryptField: vi.fn().mockImplementation((v: string) => `enc:${v}`),
  decryptField: vi.fn().mockImplementation((v: string) => v.startsWith("enc:") ? v.slice(4) : v),
  blindIndex: vi.fn().mockImplementation((v: string) => `hash:${v.toLowerCase().trim()}`),
  encryptPatientFields: vi.fn().mockImplementation(() => ({})),
  encryptInsuranceFields: vi.fn().mockImplementation(() => ({})),
  decryptPatientRecord: vi.fn().mockImplementation(<T extends Record<string, unknown>>(r: T) => r),
  decryptInsuranceRecord: vi.fn().mockImplementation(<T extends Record<string, unknown>>(r: T) => r),
  buildPatientHashSearch: vi.fn().mockImplementation(() => []),
  PATIENT_PHI_FIELDS: {},
  INSURANCE_PHI_FIELDS: {},
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

// ─── Mock @/lib/transport ───────────────────────────────────
vi.mock("@/lib/transport", () => ({
  resolveTransport: vi.fn().mockResolvedValue({
    id: "transport-sim-1",
    payerId: "payer-1",
    organizationId: null,
    method: "simulated",
    environment: "sandbox",
    isEnabled: true,
    priority: 99,
    endpointUrl: null,
    statusEndpointUrl: null,
    externalPayerId: null,
    clearinghousePayerId: null,
    credentialRef: null,
    supportsAttachments: false,
    supportsStatusCheck: false,
    requiresHumanReview: false,
    metadata: null,
  }),
  getAdapter: vi.fn().mockReturnValue({
    validate: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    submit: vi.fn().mockResolvedValue({
      accepted: true,
      externalSubmissionId: "AUTH-SIM-001",
      status: "accepted",
      claimResponse: {
        status: "approved",
        authorizationNumber: "AUTH-SIM-001",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        approvedUnits: null,
        approvedCptCodes: [],
        denialReasonCode: null,
        denialReasonDescription: null,
        payerNotes: null,
        rawResponse: { outcome: "complete" },
      },
      httpStatusCode: 200,
      responseCode: null,
      responseSummary: "Simulated: approved",
      failureCategory: null,
      responseTimeMs: 50,
      rawResponse: { outcome: "complete" },
    }),
    checkStatus: vi.fn().mockResolvedValue({
      found: false,
      currentStatus: null,
      responseCode: "SIMULATED_NO_OP",
      message: "Simulated",
      rawResponse: null,
    }),
  }),
  getTransportEnvironment: vi.fn().mockReturnValue("sandbox"),
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

// ─── Mock @/lib/storage ─────────────────────────────────────
const mockStorageProvider = {
  upload: vi.fn().mockResolvedValue("documents/org-1/req-1/uuid-file.pdf"),
  download: vi.fn().mockResolvedValue(Buffer.from("mock-file-content")),
  delete: vi.fn().mockResolvedValue(undefined),
  getSignedUrl: vi.fn().mockResolvedValue(null),
};

vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn().mockReturnValue(mockStorageProvider),
  buildBlobKey: vi.fn().mockImplementation(
    (orgId: string, requestId: string, fileName: string) =>
      `documents/${orgId}/${requestId}/mock-uuid-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
  ),
}));

// ─── Mock @/lib/document-path (legacy, no longer used by routes) ──
vi.mock("@/lib/document-path", () => ({
  resolveDocumentPath: vi.fn().mockImplementation((filePath: string) => `/mock/uploads/${filePath}`),
}));

// ─── Mock fs/promises ────────────────────────────────────────
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-file-content")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
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

// ─── Mock @/lib/auth-tokens ─────────────────────────────────
vi.mock("@/lib/auth-tokens", () => ({
  createAuthToken: vi.fn().mockResolvedValue("mock-token-value"),
  findValidToken: vi.fn().mockResolvedValue(null),
  consumeToken: vi.fn().mockResolvedValue(true),
  verifyAuthToken: vi.fn().mockResolvedValue(null),
  revokeAllTokens: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock @/lib/auth-email ──────────────────────────────────
vi.mock("@/lib/auth-email", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(true),
  sendResetEmail: vi.fn().mockResolvedValue(true),
}));

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
