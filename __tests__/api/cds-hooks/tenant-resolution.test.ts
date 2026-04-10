/**
 * Tests for CDS Hooks tenant resolution and org-scoped behavior.
 *
 * Covers:
 * - Tenant key resolution (valid, invalid/stale, missing)
 * - fhirServer fallback (single org, ambiguous, no match)
 * - Legacy discovery deprecation
 * - Tenant-scoped PA check with org-scoped payer lookup
 * - Admin CDS integration management
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  createParams,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession } from "../../helpers/factories";

// ─── Import route handlers ──────────────────────────────────

import { POST as tenantPaCheck } from "@/app/api/cds-hooks/t/[tenantKey]/services/greenlight-pa-check/route";
import { POST as tenantApptCheck } from "@/app/api/cds-hooks/t/[tenantKey]/services/greenlight-appointment-check/route";
import { GET as tenantDiscovery } from "@/app/api/cds-hooks/t/[tenantKey]/services/route";
import { GET as legacyDiscovery } from "@/app/api/cds-hooks/services/route";
import { POST as legacyPaCheck } from "@/app/api/cds-hooks/services/greenlight-pa-check/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/settings/cds-integration/route";

// ─── Helpers ────────────────────────────────────────────────

function orderSignRequest(overrides: Record<string, unknown> = {}) {
  return {
    hook: "order-sign",
    hookInstance: "test-instance",
    context: {
      draftOrders: {
        entry: [
          {
            resource: {
              resourceType: "ServiceRequest",
              code: {
                coding: [
                  { system: "http://www.ama-assn.org/go/cpt", code: "70553" },
                ],
              },
            },
          },
        ],
      },
    },
    prefetch: {
      coverage: {
        entry: [
          {
            resource: {
              payor: [{ display: "UnitedHealthcare" }],
            },
          },
        ],
      },
    },
    ...overrides,
  };
}

function appointmentBookRequest(overrides: Record<string, unknown> = {}) {
  return {
    hook: "appointment-book",
    hookInstance: "test-instance",
    context: {
      appointments: {
        entry: [
          {
            resource: {
              resourceType: "Appointment",
              serviceType: [
                {
                  coding: [
                    { system: "http://www.ama-assn.org/go/cpt", code: "70553" },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    prefetch: {
      coverage: {
        entry: [
          {
            resource: {
              payor: [{ display: "UnitedHealthcare" }],
            },
          },
        ],
      },
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("CDS Hooks Tenant Resolution", () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  // ── Tenant-scoped routes: tenantKey validation ──

  describe("tenant-scoped pa-check", () => {
    it("returns cards when tenantKey is valid", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce({ id: "org-1" });
      prismaMock.payer.findFirst.mockResolvedValueOnce({
        id: "py-1",
        name: "UnitedHealthcare",
        rbmVendor: null,
        avgResponseDays: 5,
      });
      prismaMock.payerRule.findMany.mockResolvedValueOnce([
        { cptCode: "70553", requiresPA: true },
      ]);
      prismaMock.clinicalGuideline.findMany.mockResolvedValueOnce([]);
      prismaMock.documentationRequirement.findMany.mockResolvedValueOnce([]);
      prismaMock.denialPattern.findMany.mockResolvedValueOnce([]);

      const req = createPostRequest(
        "/api/cds-hooks/t/valid-key/services/greenlight-pa-check",
        orderSignRequest()
      );
      const res = await tenantPaCheck(req, createParams({ tenantKey: "valid-key" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cards.length).toBeGreaterThan(0);
      expect(data.cards[0].summary).toContain("Prior Authorization Required");
    });

    it("returns empty cards when tenantKey is invalid (stale/rotated)", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce(null);

      const req = createPostRequest(
        "/api/cds-hooks/t/stale-key/services/greenlight-pa-check",
        orderSignRequest({ fhirServer: "https://fhir.hospital.org/R4" })
      );
      const res = await tenantPaCheck(req, createParams({ tenantKey: "stale-key" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cards).toEqual([]);
    });

    it("does NOT fall back to fhirServer when tenantKey is invalid", async () => {
      // Even though fhirServer could resolve, tenant-scoped route rejects stale key
      prismaMock.organization.findUnique.mockResolvedValueOnce(null);

      const req = createPostRequest(
        "/api/cds-hooks/t/stale-key/services/greenlight-pa-check",
        orderSignRequest({ fhirServer: "https://fhir.hospital.org/R4" })
      );
      const res = await tenantPaCheck(req, createParams({ tenantKey: "stale-key" }));
      const data = await parseResponse(res);

      expect(data.cards).toEqual([]);
      // ehrConnection should NOT have been queried
      expect(prismaMock.ehrConnection.findMany).not.toHaveBeenCalled();
    });
  });

  describe("tenant-scoped appointment-check", () => {
    it("returns empty cards when tenantKey is invalid", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce(null);

      const req = createPostRequest(
        "/api/cds-hooks/t/stale-key/services/greenlight-appointment-check",
        appointmentBookRequest()
      );
      const res = await tenantApptCheck(req, createParams({ tenantKey: "stale-key" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cards).toEqual([]);
    });
  });

  // ── Tenant-scoped discovery ──

  describe("tenant-scoped discovery", () => {
    it("returns services for valid tenantKey", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce({ id: "org-1" });

      const req = createGetRequest("/api/cds-hooks/t/valid-key/services");
      const res = await tenantDiscovery(req, createParams({ tenantKey: "valid-key" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.services).toHaveLength(2);
      expect(data.services[0].id).toBe("greenlight-pa-check");
      expect(data.services[1].id).toBe("greenlight-appointment-check");
    });

    it("returns empty services for invalid tenantKey", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce(null);

      const req = createGetRequest("/api/cds-hooks/t/bad-key/services");
      const res = await tenantDiscovery(req, createParams({ tenantKey: "bad-key" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.services).toEqual([]);
    });
  });

  // ── Legacy discovery deprecation ──

  describe("legacy discovery (deprecated)", () => {
    it("returns empty services with deprecation notice", async () => {
      const req = createGetRequest("/api/cds-hooks/services");
      const res = await legacyDiscovery();
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.services).toEqual([]);
      expect(data._deprecated).toContain("deprecated");
      expect(res.headers.get("X-GreenLight-Deprecated")).toBeTruthy();
    });
  });

  // ── Legacy PA check: fhirServer fallback ──

  describe("legacy pa-check fhirServer fallback", () => {
    it("resolves org from fhirServer when exactly one match", async () => {
      prismaMock.ehrConnection.findMany.mockResolvedValueOnce([
        { organizationId: "org-1" },
      ]);
      prismaMock.payer.findFirst.mockResolvedValueOnce({
        id: "py-1",
        name: "UnitedHealthcare",
        rbmVendor: null,
        avgResponseDays: 5,
      });
      prismaMock.payerRule.findMany.mockResolvedValueOnce([
        { cptCode: "70553", requiresPA: true },
      ]);
      prismaMock.clinicalGuideline.findMany.mockResolvedValueOnce([]);
      prismaMock.documentationRequirement.findMany.mockResolvedValueOnce([]);
      prismaMock.denialPattern.findMany.mockResolvedValueOnce([]);

      const req = createPostRequest(
        "/api/cds-hooks/services/greenlight-pa-check",
        orderSignRequest({ fhirServer: "https://fhir.hospital.org/R4" })
      );
      const res = await legacyPaCheck(req);
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cards.length).toBeGreaterThan(0);
      // Tenant was resolved — no unresolved header
      expect(res.headers.get("X-GreenLight-Tenant")).toBeNull();
    });

    it("rejects ambiguous fhirServer (multiple orgs)", async () => {
      prismaMock.ehrConnection.findMany.mockResolvedValueOnce([
        { organizationId: "org-1" },
        { organizationId: "org-2" },
      ]);
      // With no org resolved, payer lookup is global
      prismaMock.payer.findFirst.mockResolvedValueOnce(null);
      prismaMock.clinicalGuideline.findMany.mockResolvedValueOnce([]);

      const req = createPostRequest(
        "/api/cds-hooks/services/greenlight-pa-check",
        orderSignRequest({ fhirServer: "https://shared-ehr.org/R4" })
      );
      const res = await legacyPaCheck(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("X-GreenLight-Tenant")).toBe("unresolved");
    });

    it("marks tenant as unresolved when no fhirServer provided", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce(null);
      prismaMock.clinicalGuideline.findMany.mockResolvedValueOnce([]);

      const req = createPostRequest(
        "/api/cds-hooks/services/greenlight-pa-check",
        orderSignRequest()
      );
      const res = await legacyPaCheck(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("X-GreenLight-Tenant")).toBe("unresolved");
    });
  });

  // ── Org-scoped payer lookup ──

  describe("org-scoped payer lookup in PA check", () => {
    it("scopes payer query to org + global when organizationId is present", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce({ id: "org-1" });
      prismaMock.payer.findFirst.mockResolvedValueOnce(null);
      prismaMock.clinicalGuideline.findMany.mockResolvedValueOnce([]);

      const req = createPostRequest(
        "/api/cds-hooks/t/valid-key/services/greenlight-pa-check",
        orderSignRequest()
      );
      await tenantPaCheck(req, createParams({ tenantKey: "valid-key" }));

      const payerCall = prismaMock.payer.findFirst.mock.calls[0][0];
      // Should have AND with org visibility filter
      expect(payerCall.where.AND).toBeDefined();
      const orgFilter = payerCall.where.AND[0];
      expect(orgFilter.OR).toEqual([
        { organizationId: "org-1" },
        { organizationId: null },
      ]);
    });
  });

  // ── Admin API ──

  describe("admin CDS integration management", () => {
    beforeEach(() => {
      mockSession(createMockSession());
    });

    it("GET returns null key when not yet generated", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce({
        cdsTenantKey: null,
      });

      const req = createGetRequest("/api/settings/cds-integration");
      const res = await adminGet(req);
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cdsTenantKey).toBeNull();
      expect(data.endpoints).toBeNull();
    });

    it("GET returns key and endpoint URLs when generated", async () => {
      prismaMock.organization.findUnique.mockResolvedValueOnce({
        cdsTenantKey: "existing-key-abc",
      });

      const req = createGetRequest("/api/settings/cds-integration");
      const res = await adminGet(req);
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cdsTenantKey).toBe("existing-key-abc");
      expect(data.endpoints.discovery).toContain("/t/existing-key-abc/services");
      expect(data.endpoints.orderSign).toContain("/t/existing-key-abc/services/greenlight-pa-check");
    });

    it("POST generates a new tenant key", async () => {
      prismaMock.organization.update.mockResolvedValueOnce({ id: "org-1" });

      const req = createPostRequest("/api/settings/cds-integration");
      const res = await adminPost(req);
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.cdsTenantKey).toBeTruthy();
      expect(typeof data.cdsTenantKey).toBe("string");
      expect(data.cdsTenantKey.length).toBeGreaterThan(10);
      expect(data.endpoints.discovery).toContain(`/t/${data.cdsTenantKey}/services`);
    });

    it("POST requires admin role", async () => {
      mockSession(createMockSession({ role: "viewer" }));

      const req = createPostRequest("/api/settings/cds-integration");
      const res = await adminPost(req);

      expect(res.status).toBe(403);
    });

    it("GET requires admin role", async () => {
      mockSession(createMockSession({ role: "pa_coordinator" }));

      const req = createGetRequest("/api/settings/cds-integration");
      const res = await adminGet(req);

      expect(res.status).toBe(403);
    });

    it("returns 401 when unauthenticated", async () => {
      mockSession(null);

      const req = createGetRequest("/api/settings/cds-integration");
      const res = await adminGet(req);

      expect(res.status).toBe(401);
    });
  });
});
