/**
 * Tests for GET/PATCH/DELETE /api/payers/[id]/rules/[ruleId]
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
import { createMockSession, createMockPayer, createMockPayerRule } from "../../helpers/factories";
import { GET, PATCH, DELETE } from "@/app/api/payers/[id]/rules/[ruleId]/route";

const params = createParams({ id: "payer-1", ruleId: "rule-1" });

// ─── GET /api/payers/[id]/rules/[ruleId] ─────────────────────

describe("GET /api/payers/[id]/rules/[ruleId]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/payers/payer-1/rules/rule-1");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns a single rule", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    const rule = createMockPayerRule({ id: "rule-1", payerId: "payer-1" });
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(rule);

    const req = createGetRequest("/api/payers/payer-1/rules/rule-1");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.rule).toBeDefined();
    expect(data.rule.id).toBe("rule-1");
    expect(data.rule.payerId).toBe("payer-1");
    expect(data.rule.serviceCategory).toBe("imaging");
  });

  it("returns 404 when rule not found", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(null);

    const req = createGetRequest("/api/payers/payer-1/rules/nonexistent");
    const res = await GET(req, createParams({ id: "payer-1", ruleId: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("verifies rule belongs to the specified payer", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(null);

    const req = createGetRequest("/api/payers/payer-1/rules/rule-1");
    await GET(req, params);

    const call = prismaMock.payerRule.findFirst.mock.calls[0][0];
    expect(call.where.payerId).toBe("payer-1");
    expect(call.where.id).toBe("rule-1");
  });
});

// ─── PATCH /api/payers/[id]/rules/[ruleId] ───────────────────

describe("PATCH /api/payers/[id]/rules/[ruleId]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPatchRequest("/api/payers/payer-1/rules/rule-1", { requiresPA: false });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession(createMockSession({ role: "pa_coordinator" }));
    const req = createPatchRequest("/api/payers/payer-1/rules/rule-1", { requiresPA: false });
    const res = await PATCH(req, params);
    expect(res.status).toBe(403);
  });

  it("updates a rule successfully", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    const rule = createMockPayerRule({ id: "rule-1", payerId: "payer-1" });
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(rule);

    const updated = { ...rule, requiresPA: false };
    prismaMock.payerRule.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/payers/payer-1/rules/rule-1", { requiresPA: false });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.rule.requiresPA).toBe(false);
  });

  it("returns 404 when rule not found", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/payers/payer-1/rules/rule-1", { requiresPA: false });
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("verifies rule belongs to the specified payer", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/payers/payer-1/rules/rule-1", { requiresPA: false });
    await PATCH(req, params);

    const call = prismaMock.payerRule.findFirst.mock.calls[0][0];
    expect(call.where.payerId).toBe("payer-1");
    expect(call.where.id).toBe("rule-1");
  });
});

// ─── DELETE /api/payers/[id]/rules/[ruleId] ──────────────────

describe("DELETE /api/payers/[id]/rules/[ruleId]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createDeleteRequest("/api/payers/payer-1/rules/rule-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createDeleteRequest("/api/payers/payer-1/rules/rule-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(403);
  });

  it("deletes a rule successfully", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    const rule = createMockPayerRule({ id: "rule-1", payerId: "payer-1" });
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(rule);
    prismaMock.payerRule.delete.mockResolvedValueOnce(rule);

    const req = createDeleteRequest("/api/payers/payer-1/rules/rule-1");
    const res = await DELETE(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 404 when rule not found", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(createMockPayer({ id: "payer-1" }));
    prismaMock.payerRule.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/payers/payer-1/rules/rule-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(404);
  });
});
