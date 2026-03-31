/**
 * Tests for GET /api/payers
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPayer } from "../../helpers/factories";
import { GET } from "@/app/api/payers/route";

describe("GET /api/payers", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/payers");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns active payers list", async () => {
    const payer = {
      ...createMockPayer({ id: "py1", name: "Aetna" }),
      _count: { rules: 5 },
    };
    prismaMock.payer.findMany.mockResolvedValueOnce([payer]);

    const req = createGetRequest("/api/payers");
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.payers).toHaveLength(1);
    expect(data.payers[0].name).toBe("Aetna");
    expect(data.payers[0]._count.rules).toBe(5);
  });

  it("returns empty list when no payers exist", async () => {
    prismaMock.payer.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers");
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.payers).toHaveLength(0);
  });

  it("filters to active payers by default", async () => {
    prismaMock.payer.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers");
    await GET(req);

    const call = prismaMock.payer.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ isActive: true });
  });

  it("includes inactive payers when requested", async () => {
    prismaMock.payer.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers", { includeInactive: "true" });
    await GET(req);

    const call = prismaMock.payer.findMany.mock.calls[0][0];
    expect(call.where).toEqual({});
  });
});
