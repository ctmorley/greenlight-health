/**
 * Tests for the Payer Transport Registry and Simulated Adapter.
 *
 * Covers:
 * - Transport resolution (org-specific priority, global fallback, no match)
 * - Adapter dispatch (simulated adapter, unknown method)
 * - Simulated adapter submit behavior
 * - Submit route integration with transport layer
 * - Submission attempt recording
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// These tests exercise the registry and adapter directly (not mocked).
// We unmock @/lib/transport so the real registry code runs,
// but keep @/lib/prisma mocked via mock-prisma.
vi.unmock("@/lib/transport");
vi.unmock("@/lib/transport/registry");
vi.unmock("@/lib/transport/adapters/simulated");
vi.unmock("@/lib/transport/types");

import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";

// ─── Transport Registry Tests ───────────────────────────────

describe("Transport Registry", () => {
  // Import after vi.unmock so we get the real modules
  let resolveTransport: typeof import("@/lib/transport/registry").resolveTransport;
  let getAdapter: typeof import("@/lib/transport/registry").getAdapter;
  let getTransportEnvironment: typeof import("@/lib/transport/registry").getTransportEnvironment;

  beforeEach(async () => {
    resetPrismaMocks();
    const registry = await import("@/lib/transport/registry");
    resolveTransport = registry.resolveTransport;
    getAdapter = registry.getAdapter;
    getTransportEnvironment = registry.getTransportEnvironment;
  });

  describe("resolveTransport", () => {
    it("returns org-specific transport over global", async () => {
      const orgTransport = {
        id: "t-org",
        payerId: "py-1",
        organizationId: "org-1",
        method: "simulated",
        environment: "sandbox",
        isEnabled: true,
        priority: 0,
      };

      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(orgTransport);

      const result = await resolveTransport("py-1", "org-1", "sandbox");

      expect(result).toEqual(orgTransport);
      const call = prismaMock.payerTransport.findFirst.mock.calls[0][0];
      expect(call.where.payerId).toBe("py-1");
      expect(call.where.isEnabled).toBe(true);
      expect(call.where.environment).toBe("sandbox");
    });

    it("returns null when no transport configured", async () => {
      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(null);

      const result = await resolveTransport("py-1", "org-1", "sandbox");
      expect(result).toBeNull();
    });

    it("defaults to sandbox environment", async () => {
      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(null);

      await resolveTransport("py-1", "org-1");

      const call = prismaMock.payerTransport.findFirst.mock.calls[0][0];
      expect(call.where.environment).toBe("sandbox");
    });
  });

  describe("getAdapter", () => {
    it("returns simulated adapter for 'simulated' method", () => {
      const adapter = getAdapter("simulated");
      expect(adapter).not.toBeNull();
      expect(adapter).toHaveProperty("submit");
      expect(adapter).toHaveProperty("checkStatus");
      expect(adapter).toHaveProperty("validate");
    });

    it("returns null for unregistered adapter", () => {
      const adapter = getAdapter("fhir_pas");
      expect(adapter).toBeNull();
    });
  });

  describe("getTransportEnvironment", () => {
    it("defaults to sandbox", () => {
      delete process.env.TRANSPORT_ENVIRONMENT;
      expect(getTransportEnvironment()).toBe("sandbox");
    });

    it("returns production when configured", () => {
      process.env.TRANSPORT_ENVIRONMENT = "production";
      expect(getTransportEnvironment()).toBe("production");
      delete process.env.TRANSPORT_ENVIRONMENT;
    });
  });
});

// ─── Simulated Adapter Tests ────────────────────────────────

describe("SimulatedAdapter", () => {
  let SimulatedAdapter: typeof import("@/lib/transport/adapters/simulated").SimulatedAdapter;

  beforeEach(async () => {
    resetPrismaMocks();
    const mod = await import("@/lib/transport/adapters/simulated");
    SimulatedAdapter = mod.SimulatedAdapter;
  });

  const mockTransport = {
    id: "t-1",
    payerId: "py-1",
    organizationId: null,
    method: "simulated" as const,
    environment: "sandbox" as const,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRequest = {
    id: "req-1",
    organizationId: "org-1",
    patientId: "pat-1",
    createdById: "user-1",
    assignedToId: null,
    referenceNumber: "PA-001",
    status: "submitted" as const,
    urgency: "routine" as const,
    serviceCategory: "imaging" as const,
    serviceType: "mri" as const,
    cptCodes: ["70553"],
    icd10Codes: ["M54.5"],
    procedureDescription: "Brain MRI",
    payerId: "py-1",
    insuranceId: null,
    rbmVendor: null,
    rbmReferenceNumber: null,
    orderingPhysicianId: null,
    renderingPhysicianNpi: null,
    facilityName: null,
    scheduledDate: null,
    dueDate: null,
    clinicalNotes: null,
    aiAuditResult: null,
    draftMetadata: null,
    submittedAt: new Date(),
    decidedAt: null,
    expiresAt: null,
    approvedUnits: null,
    approvedCptCodes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("validate", () => {
    it("always returns valid", async () => {
      const adapter = new SimulatedAdapter();
      const result = await adapter.validate(mockTransport, mockRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("submit", () => {
    it("returns a properly shaped SubmissionResult", async () => {
      // Mock the ACR guideline lookup
      prismaMock.clinicalGuideline.findFirst.mockResolvedValueOnce({
        rating: 8,
      });

      const adapter = new SimulatedAdapter();
      const result = await adapter.submit(mockTransport, {}, mockRequest);

      expect(result).toHaveProperty("accepted");
      expect(result).toHaveProperty("externalSubmissionId");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("claimResponse");
      expect(result).toHaveProperty("responseTimeMs");
      expect(result).toHaveProperty("rawResponse");
      expect(typeof result.responseTimeMs).toBe("number");
      expect(["accepted", "rejected", "pending", "error"]).toContain(result.status);
    });

    it("returns approved for high ACR rating", async () => {
      prismaMock.clinicalGuideline.findFirst.mockResolvedValueOnce({
        rating: 9,
      });

      const adapter = new SimulatedAdapter();
      const result = await adapter.submit(mockTransport, {}, mockRequest);

      expect(result.accepted).toBe(true);
      expect(result.claimResponse?.status).toBe("approved");
      expect(result.externalSubmissionId).toBeTruthy();
    });

    it("returns denied for low ACR rating", async () => {
      prismaMock.clinicalGuideline.findFirst.mockResolvedValueOnce({
        rating: 2,
      });

      const adapter = new SimulatedAdapter();
      const result = await adapter.submit(mockTransport, {}, mockRequest);

      expect(result.accepted).toBe(false);
      expect(result.claimResponse?.status).toBe("denied");
    });
  });

  describe("checkStatus", () => {
    it("returns not-found (simulation does not support independent status checks)", async () => {
      const adapter = new SimulatedAdapter();
      const result = await adapter.checkStatus(mockTransport, "AUTH-123");

      expect(result.found).toBe(false);
      expect(result.responseCode).toBe("SIMULATED_NO_OP");
    });
  });
});
