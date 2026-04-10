/**
 * Tests for GET/POST /api/payers/[id]/rules
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import {
  createMockSession,
  createMockPayer,
  createMockPayerRule,
} from "../../helpers/factories";
import { GET, POST } from "@/app/api/payers/[id]/rules/route";

const params = createParams({ id: "payer-1" });

describe("GET /api/payers/[id]/rules", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/payers/payer-1/rules");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns rules for a payer", async () => {
    const payer = {
      id: "payer-1",
      name: "Aetna",
      rbmVendor: null,
      avgResponseDays: 5,
      electronicSubmission: true,
    };
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const rule = createMockPayerRule({ id: "rule-1", payerId: "payer-1" });
    prismaMock.payerRule.findMany.mockResolvedValueOnce([rule]);

    const req = createGetRequest("/api/payers/payer-1/rules");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("payer");
    expect(data).toHaveProperty("requiresPA");
    expect(data).toHaveProperty("rules");
    expect(data.rules).toHaveLength(1);
    expect(data.totalRules).toBe(1);
  });

  it("returns 404 for non-existent payer", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);

    const req = createGetRequest("/api/payers/nonexistent/rules");
    const res = await GET(req, createParams({ id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("filters rules by service category", async () => {
    const payer = {
      id: "payer-1",
      name: "Aetna",
      rbmVendor: null,
      avgResponseDays: 5,
      electronicSubmission: true,
    };
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);
    prismaMock.payerRule.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers/payer-1/rules", { serviceCategory: "imaging" });
    await GET(req, params);

    const call = prismaMock.payerRule.findMany.mock.calls[0][0];
    const andConditions = call.where.AND;
    const hasCategoryFilter = andConditions.some(
      (c: Record<string, unknown>) => c.serviceCategory === "imaging"
    );
    expect(hasCategoryFilter).toBe(true);
  });

  it("determines requiresPA correctly", async () => {
    const payer = {
      id: "payer-1",
      name: "Aetna",
      rbmVendor: null,
      avgResponseDays: 5,
      electronicSubmission: true,
    };
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const rule = createMockPayerRule({ requiresPA: true });
    prismaMock.payerRule.findMany.mockResolvedValueOnce([rule]);

    const req = createGetRequest("/api/payers/payer-1/rules", { cptCode: "70553" });
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(data.requiresPA).toBe(true);
  });
});

describe("POST /api/payers/[id]/rules", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/payers/payer-1/rules", {
      serviceCategory: "imaging",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createPostRequest("/api/payers/payer-1/rules", {
      serviceCategory: "imaging",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(403);
  });

  it("creates a new rule successfully", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const rule = createMockPayerRule({ id: "new-rule", payerId: "payer-1" });
    prismaMock.payerRule.create.mockResolvedValueOnce(rule);

    const req = createPostRequest("/api/payers/payer-1/rules", {
      serviceCategory: "imaging",
      cptCode: "70553",
      requiresPA: true,
    });
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.rule).toBeDefined();
  });

  it("returns 404 when payer does not exist", async () => {
    prismaMock.payer.findFirst.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/payers/payer-1/rules", {
      serviceCategory: "imaging",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing serviceCategory", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const req = createPostRequest("/api/payers/payer-1/rules", {
      cptCode: "70553",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid serviceCategory", async () => {
    const payer = createMockPayer({ id: "payer-1" });
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const req = createPostRequest("/api/payers/payer-1/rules", {
      serviceCategory: "invalid_category",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });
});
