/**
 * Tests for PATCH /api/payers/[id]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createPatchRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPayer } from "../../helpers/factories";
import { PATCH } from "@/app/api/payers/[id]/route";

const params = createParams({ id: "payer-1" });

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
    prismaMock.payer.findUnique.mockResolvedValueOnce(payer);

    const updated = { ...payer, name: "New Name", _count: { rules: 3 } };
    prismaMock.payer.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/payers/payer-1", { name: "New Name" });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.payer.name).toBe("New Name");
  });

  it("returns 404 for non-existent payer", async () => {
    prismaMock.payer.findUnique.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/payers/payer-1", { name: "Updated" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 400 when no valid fields provided", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findUnique.mockResolvedValueOnce(payer);

    const req = createPatchRequest("/api/payers/payer-1", { invalidField: "value" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("updates multiple fields at once", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findUnique.mockResolvedValueOnce(payer);

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
