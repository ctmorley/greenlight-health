/**
 * Tests for PayerTransport CRUD operations.
 *
 * Covers:
 * - List transports for a payer
 * - Create transport (validation, org scoping, 409 on duplicate)
 * - Update transport (partial update, global immutability)
 * - Delete transport (global immutability)
 * - Auth/role enforcement
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  createPutRequest,
  createDeleteRequest,
  createParams,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPayer } from "../../helpers/factories";

import { GET as listTransports, POST as createTransport } from "@/app/api/payers/[id]/transports/route";
import { GET as getTransport, PATCH as updateTransport, DELETE as deleteTransport } from "@/app/api/payers/[id]/transports/[transportId]/route";

const mockOrgTransport = {
  id: "t-org-1",
  payerId: "py-1",
  organizationId: "org-1",
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockGlobalTransport = {
  ...mockOrgTransport,
  id: "t-global-1",
  organizationId: null,
};

describe("PayerTransport CRUD", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  // ── GET list ──

  describe("GET /api/payers/[id]/transports", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const req = createGetRequest("/api/payers/py-1/transports");
      const res = await listTransports(req, createParams({ id: "py-1" }));
      expect(res.status).toBe(401);
    });

    it("returns 404 when payer not found", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce(null);
      const req = createGetRequest("/api/payers/py-1/transports");
      const res = await listTransports(req, createParams({ id: "py-1" }));
      expect(res.status).toBe(404);
    });

    it("returns transports for a payer", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      prismaMock.payerTransport.findMany.mockResolvedValueOnce([mockOrgTransport]);

      const req = createGetRequest("/api/payers/py-1/transports");
      const res = await listTransports(req, createParams({ id: "py-1" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.transports).toHaveLength(1);
      expect(data.transports[0].method).toBe("simulated");
    });
  });

  // ── POST create ──

  describe("POST /api/payers/[id]/transports", () => {
    beforeEach(() => {
      mockSession(createMockSession({ role: "admin" }));
    });

    it("returns 403 for non-admin", async () => {
      mockSession(createMockSession({ role: "viewer" }));
      const req = createPostRequest("/api/payers/py-1/transports", {
        method: "fhir_pas",
      });
      const res = await createTransport(req, createParams({ id: "py-1" }));
      expect(res.status).toBe(403);
    });

    it("creates an org-scoped transport", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      prismaMock.payerTransport.create.mockResolvedValueOnce({
        ...mockOrgTransport,
        method: "fhir_pas",
        endpointUrl: "https://fhir.payer.com/Claim/$submit",
      });

      const req = createPostRequest("/api/payers/py-1/transports", {
        method: "fhir_pas",
        environment: "sandbox",
        endpointUrl: "https://fhir.payer.com/Claim/$submit",
      });
      const res = await createTransport(req, createParams({ id: "py-1" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(201);

      // Verify org-scoped (organizationId set from session)
      const createCall = prismaMock.payerTransport.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe("org-1");
    });

    it("returns 400 for invalid method", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      const req = createPostRequest("/api/payers/py-1/transports", {
        method: "invalid_method",
      });
      const res = await createTransport(req, createParams({ id: "py-1" }));
      expect(res.status).toBe(400);
    });

    it("returns 409 on duplicate method+environment", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      const prismaError = new Error("Unique constraint failed") as Error & { code: string };
      prismaError.code = "P2002";
      prismaMock.payerTransport.create.mockRejectedValueOnce(prismaError);

      const req = createPostRequest("/api/payers/py-1/transports", {
        method: "simulated",
        environment: "sandbox",
      });
      const res = await createTransport(req, createParams({ id: "py-1" }));
      expect(res.status).toBe(409);
    });
  });

  // ── PATCH update ──

  describe("PATCH /api/payers/[id]/transports/[transportId]", () => {
    beforeEach(() => {
      mockSession(createMockSession({ role: "admin" }));
    });

    it("updates an org-scoped transport", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(mockOrgTransport);
      prismaMock.payerTransport.update.mockResolvedValueOnce({
        ...mockOrgTransport,
        priority: 5,
      });

      const req = createPutRequest("/api/payers/py-1/transports/t-org-1", {
        priority: 5,
      });
      // PATCH uses PUT helper (same body format)
      const res = await updateTransport(
        req,
        createParams({ id: "py-1", transportId: "t-org-1" })
      );
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
    });

    it("rejects PATCH on global transport", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(mockGlobalTransport);

      const req = createPutRequest("/api/payers/py-1/transports/t-global-1", {
        priority: 1,
      });
      const res = await updateTransport(
        req,
        createParams({ id: "py-1", transportId: "t-global-1" })
      );

      expect(res.status).toBe(403);
      const data = await parseResponse(res);
      expect(data.error).toContain("Global transports cannot be modified");
    });
  });

  // ── DELETE ──

  describe("DELETE /api/payers/[id]/transports/[transportId]", () => {
    beforeEach(() => {
      mockSession(createMockSession({ role: "admin" }));
    });

    it("deletes an org-scoped transport", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(mockOrgTransport);
      prismaMock.payerTransport.delete.mockResolvedValueOnce(mockOrgTransport);

      const req = createDeleteRequest("/api/payers/py-1/transports/t-org-1");
      const res = await deleteTransport(
        req,
        createParams({ id: "py-1", transportId: "t-org-1" })
      );

      expect(res.status).toBe(200);
      const data = await parseResponse(res);
      expect(data.success).toBe(true);
    });

    it("rejects DELETE on global transport", async () => {
      prismaMock.payer.findFirst.mockResolvedValueOnce({ id: "py-1" });
      prismaMock.payerTransport.findFirst.mockResolvedValueOnce(mockGlobalTransport);

      const req = createDeleteRequest("/api/payers/py-1/transports/t-global-1");
      const res = await deleteTransport(
        req,
        createParams({ id: "py-1", transportId: "t-global-1" })
      );

      expect(res.status).toBe(403);
      const data = await parseResponse(res);
      expect(data.error).toContain("Global transports cannot be deleted");
    });
  });
});
