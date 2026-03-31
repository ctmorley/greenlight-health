/**
 * Tests for POST /api/requests/[id]/check-status
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createPostRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession } from "../../helpers/factories";
import { POST } from "@/app/api/requests/[id]/check-status/route";

const params = createParams({ id: "req-1" });

describe("POST /api/requests/[id]/check-status", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/requests/req-1/check-status");
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 for request from different org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createPostRequest("/api/requests/req-1/check-status");
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  it("runs status check and returns result", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({
      id: "req-1",
      referenceNumber: "GL-20260330-00001",
    });

    const req = createPostRequest("/api/requests/req-1/check-status");
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("statusCheck");
    expect(data.statusCheck).toHaveProperty("requestId");
    expect(data.statusCheck).toHaveProperty("checkType", "manual");
    expect(data.statusCheck).toHaveProperty("statusChanged");
  });

  it("verifies org scoping on the query", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createPostRequest("/api/requests/req-1/check-status");
    await POST(req, params);

    const call = prismaMock.priorAuthRequest.findFirst.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
  });
});
