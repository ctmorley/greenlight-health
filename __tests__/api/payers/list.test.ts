/**
 * Tests for GET/POST /api/payers
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPayer } from "../../helpers/factories";
import { GET, POST } from "@/app/api/payers/route";

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

  it("filters to active payers with org scoping by default", async () => {
    prismaMock.payer.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers");
    await GET(req);

    const call = prismaMock.payer.findMany.mock.calls[0][0];
    // Should filter by isActive and org scoping (own org + global)
    expect(call.where.isActive).toBe(true);
    expect(call.where.OR).toEqual([
      { organizationId: "org-1" },
      { organizationId: null },
    ]);
  });

  it("includes inactive payers when requested", async () => {
    prismaMock.payer.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers", { includeInactive: "true" });
    await GET(req);

    const call = prismaMock.payer.findMany.mock.calls[0][0];
    // isActive filter should be absent
    expect(call.where.isActive).toBeUndefined();
    // Org scoping should still be present
    expect(call.where.OR).toEqual([
      { organizationId: "org-1" },
      { organizationId: null },
    ]);
  });

  it("scopes payers to current organization", async () => {
    prismaMock.payer.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/payers");
    await GET(req);

    const call = prismaMock.payer.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toContainEqual({ organizationId: "org-1" });
    expect(call.where.OR).toContainEqual({ organizationId: null });
  });
});

describe("POST /api/payers", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/payers", {
      name: "New Payer",
      payerId: "NP001",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createPostRequest("/api/payers", {
      name: "New Payer",
      payerId: "NP001",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("creates a payer successfully", async () => {
    prismaMock.payer.findUnique.mockResolvedValueOnce(null); // no duplicate

    const created = {
      ...createMockPayer({ id: "new-payer", name: "New Payer", payerId: "NP001" }),
      _count: { rules: 0 },
    };
    prismaMock.payer.create.mockResolvedValueOnce(created);
    prismaMock.payerTransport.createMany.mockResolvedValueOnce({ count: 2 });

    const req = createPostRequest("/api/payers", {
      name: "New Payer",
      payerId: "NP001",
      type: "commercial",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.payer.name).toBe("New Payer");
    expect(data.payer.payerId).toBe("NP001");
  });

  it("atomically provisions simulated transports with payer creation", async () => {
    prismaMock.payer.findUnique.mockResolvedValueOnce(null);

    const created = {
      ...createMockPayer({ id: "py-new", name: "Atomic Payer", payerId: "AP001" }),
      _count: { rules: 0 },
    };
    prismaMock.payer.create.mockResolvedValueOnce(created);
    prismaMock.payerTransport.createMany.mockResolvedValueOnce({ count: 2 });

    const req = createPostRequest("/api/payers", {
      name: "Atomic Payer",
      payerId: "AP001",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Verify $transaction was used (payer + transports are atomic)
    expect(prismaMock.$transaction).toHaveBeenCalled();

    // Verify transport provisioning was called with both environments
    const transportCall = prismaMock.payerTransport.createMany.mock.calls[0][0];
    expect(transportCall.data).toHaveLength(2);
    expect(transportCall.data[0].method).toBe("simulated");
    expect(transportCall.data[0].environment).toBe("sandbox");
    expect(transportCall.data[1].method).toBe("simulated");
    expect(transportCall.data[1].environment).toBe("production");
    expect(transportCall.data[0].payerId).toBe("py-new");
    expect(transportCall.data[1].payerId).toBe("py-new");
  });

  it("scopes created payer to current organization", async () => {
    prismaMock.payer.findUnique.mockResolvedValueOnce(null);
    prismaMock.payer.create.mockResolvedValueOnce({
      ...createMockPayer({ organizationId: "org-1" }),
      _count: { rules: 0 },
    });
    prismaMock.payerTransport.createMany.mockResolvedValueOnce({ count: 2 });

    const req = createPostRequest("/api/payers", {
      name: "Org Payer",
      payerId: "OP001",
    });
    await POST(req);

    const createCall = prismaMock.payer.create.mock.calls[0][0];
    expect(createCall.data.organizationId).toBe("org-1");
  });

  it("returns 409 for duplicate payerId", async () => {
    const existing = createMockPayer({ payerId: "DUP001" });
    prismaMock.payer.findUnique.mockResolvedValueOnce(existing);

    const req = createPostRequest("/api/payers", {
      name: "Duplicate Payer",
      payerId: "DUP001",
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
  });

  it("returns 400 for missing required fields", async () => {
    const req = createPostRequest("/api/payers", {
      // missing name and payerId
      type: "commercial",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty name", async () => {
    const req = createPostRequest("/api/payers", {
      name: "",
      payerId: "NP001",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("validates payer type enum", async () => {
    const req = createPostRequest("/api/payers", {
      name: "Bad Type Payer",
      payerId: "BT001",
      type: "invalid_type",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});
