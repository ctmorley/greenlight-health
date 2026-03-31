/**
 * Tests for PATCH /api/requests/[id]/status
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createPatchRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockRequest } from "../../helpers/factories";
import { PATCH } from "@/app/api/requests/[id]/status/route";

const params = createParams({ id: "req-1" });

describe("PATCH /api/requests/[id]/status", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPatchRequest("/api/requests/req-1/status", { status: "approved" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createPatchRequest("/api/requests/req-1/status", { status: "approved" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(403);
  });

  it("returns 403 for physician role", async () => {
    mockSession(createMockSession({ role: "physician" }));
    const req = createPatchRequest("/api/requests/req-1/status", { status: "approved" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(403);
  });

  it("transitions submitted → pending_review", async () => {
    const existing = createMockRequest({ id: "req-1", status: "submitted" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const updated = { ...existing, status: "pending_review", updatedAt: new Date(), decidedAt: null, expiresAt: null };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce(updated);
      prismaMock.authStatusChange.create.mockResolvedValueOnce({ id: "sc1" });
      return fn(prismaMock);
    });

    const req = createPatchRequest("/api/requests/req-1/status", {
      status: "pending_review",
      note: "Received by payer",
    });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe("pending_review");
    expect(data.previousStatus).toBe("submitted");
  });

  it("returns 422 for invalid status transition (draft → approved)", async () => {
    const existing = createMockRequest({ id: "req-1", status: "draft" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createPatchRequest("/api/requests/req-1/status", { status: "approved" });
    const res = await PATCH(req, params);

    expect(res.status).toBe(422);
    const data = await parseResponse(res);
    expect(data.error).toContain("Invalid status transition");
    expect(data.allowedTransitions).toBeDefined();
  });

  it("returns 422 when setting status to 'appealed' directly", async () => {
    const existing = createMockRequest({ id: "req-1", status: "denied" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createPatchRequest("/api/requests/req-1/status", { status: "appealed" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(422);
  });

  it("requires denial reason when denying", async () => {
    const existing = createMockRequest({ id: "req-1", status: "pending_review" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createPatchRequest("/api/requests/req-1/status", {
      status: "denied",
      // missing denialReasonCategory, denialReasonCode, denialReasonDescription
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("creates denial record when denying with full reason", async () => {
    const existing = createMockRequest({ id: "req-1", status: "pending_review" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const updated = { ...existing, status: "denied", updatedAt: new Date(), decidedAt: new Date(), expiresAt: null, referenceNumber: existing.referenceNumber };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce(updated);
      prismaMock.authStatusChange.create.mockResolvedValueOnce({ id: "sc1" });
      prismaMock.denial.create.mockResolvedValueOnce({ id: "den-1" });
      return fn(prismaMock);
    });

    const req = createPatchRequest("/api/requests/req-1/status", {
      status: "denied",
      denialReasonCategory: "medical_necessity",
      denialReasonCode: "MN001",
      denialReasonDescription: "Does not meet medical necessity criteria",
      note: "Reviewed and denied",
    });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe("denied");

    // Verify denial.create was called within transaction
    expect(prismaMock.denial.create).toHaveBeenCalled();
  });

  it("returns 404 for request from different org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/requests/req-1/status", { status: "cancelled" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("allows pa_coordinator to change status", async () => {
    mockSession(createMockSession({ role: "pa_coordinator" }));

    const existing = createMockRequest({ id: "req-1", status: "submitted" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const updated = { ...existing, status: "pending_review", updatedAt: new Date(), decidedAt: null, expiresAt: null };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce(updated);
      prismaMock.authStatusChange.create.mockResolvedValueOnce({ id: "sc1" });
      return fn(prismaMock);
    });

    const req = createPatchRequest("/api/requests/req-1/status", { status: "pending_review" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
  });
});
