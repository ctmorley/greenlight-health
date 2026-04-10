/**
 * Tests for GET/PATCH/DELETE /api/payers/[id]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPatchRequest,
  createDeleteRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPayer } from "../../helpers/factories";
import { GET, PATCH, DELETE } from "@/app/api/payers/[id]/route";

const params = createParams({ id: "payer-1" });

// ─── GET /api/payers/[id] ────────────────────────────────────

describe("GET /api/payers/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/payers/payer-1");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns payer detail", async () => {
    const payer = {
      ...createMockPayer({ id: "payer-1", name: "Aetna" }),
      _count: { rules: 3 },
    };
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const req = createGetRequest("/api/payers/payer-1");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.payer.name).toBe("Aetna");
    expect(data.payer._count.rules).toBe(3);
  });

  it("returns 404 for non-existent payer", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/payers/nonexistent");
    const res = await GET(req, createParams({ id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("scopes to org + global payers", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/payers/payer-1");
    await GET(req, params);

    const call = prismaMock.payer.findFirst.mock.calls[0][0];
    expect(call.where.id).toBe("payer-1");
    expect(call.where.OR).toEqual([
      { organizationId: "org-1" },
      { organizationId: null },
    ]);
  });
});

// ─── PATCH /api/payers/[id] ──────────────────────────────────

describe("PATCH /api/payers/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPatchRequest("/api/payers/payer-1", { name: "Updated" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createPatchRequest("/api/payers/payer-1", { name: "Updated" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(403);
  });

  it("updates payer details successfully", async () => {
    const payer = createMockPayer({ id: "payer-1", name: "Old Name" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const updated = { ...payer, name: "New Name", _count: { rules: 3 } };
    prismaMock.payer.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/payers/payer-1", { name: "New Name" });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.payer.name).toBe("New Name");
  });

  it("returns 404 for non-existent payer", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/payers/payer-1", { name: "Updated" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 400 when no valid fields provided", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const req = createPatchRequest("/api/payers/payer-1", { invalidField: "value" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("updates multiple fields at once", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const updated = {
      ...payer,
      phone: "800-555-1234",
      electronicSubmission: true,
      _count: { rules: 0 },
    };
    prismaMock.payer.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/payers/payer-1", {
      phone: "800-555-1234",
      electronicSubmission: true,
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/payers/[id] ─────────────────────────────────

describe("DELETE /api/payers/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createDeleteRequest("/api/payers/payer-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createDeleteRequest("/api/payers/payer-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(403);
  });

  it("deletes an org-scoped payer successfully", async () => {
    const payer = createMockPayer({ id: "payer-1", organizationId: "org-1" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);
    prismaMock.payer.delete.mockResolvedValueOnce(payer);

    const req = createDeleteRequest("/api/payers/payer-1");
    const res = await DELETE(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 404 for non-existent payer", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/payers/payer-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 404 for global payer (cannot delete)", async () => {
    // Global payers have organizationId=null, but DELETE only finds org-scoped ones
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/payers/global-payer");
    const res = await DELETE(req, createParams({ id: "global-payer" }));
    expect(res.status).toBe(404);
  });

  it("only deletes payers belonging to current org", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/payers/payer-1");
    await DELETE(req, params);

    const call = prismaMock.payer.findFirst.mock.calls[0][0];
    // DELETE only finds payers with org scope (not global)
    expect(call.where.id).toBe("payer-1");
    expect(call.where.organizationId).toBe("org-1");
  });
});
