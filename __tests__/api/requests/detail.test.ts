/**
 * Tests for GET/PATCH/DELETE /api/requests/[id]
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
import {
  createMockSession,
  createMockRequest,
  createMockPatient,
  createMockPayer,
} from "../../helpers/factories";
import { GET, PATCH, DELETE } from "@/app/api/requests/[id]/route";

const params = createParams({ id: "req-1" });

describe("GET /api/requests/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/requests/req-1");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent request", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/requests/req-1");
    const res = await GET(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 404 for request from different org (cross-org isolation)", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/requests/other-org-req");
    const res = await GET(req, createParams({ id: "other-org-req" }));
    expect(res.status).toBe(404);

    // Verify org scoping in query
    const call = prismaMock.priorAuthRequest.findFirst.mock.calls[0][0];
    expect(call.where).toHaveProperty("organizationId", "org-1");
  });

  it("returns full request details with relations", async () => {
    const fullRequest = {
      ...createMockRequest({ id: "req-1" }),
      patient: {
        id: "p1",
        firstName: "John",
        lastName: "Doe",
        mrn: "MRN001",
        dob: new Date("1985-01-01"),
        gender: "male",
        phone: "555-0100",
        email: "john@test.com",
      },
      payer: { id: "py1", name: "Aetna", payerId: "AETNA", type: "commercial", rbmVendor: null },
      insurance: { id: "ins1", planName: "Gold", planType: "ppo", memberId: "M001", groupNumber: "G001", payerId: "py1" },
      createdBy: { firstName: "Test", lastName: "Admin" },
      assignedTo: null,
      orderingPhysician: null,
      documents: [],
      statusChanges: [],
      denials: [],
      appeals: [],
    };

    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(fullRequest);

    const req = createGetRequest("/api/requests/req-1");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.id).toBe("req-1");
    expect(data.patient.name).toBe("John Doe");
    expect(data).toHaveProperty("documents");
    expect(data).toHaveProperty("timeline");
    expect(data).toHaveProperty("denials");
    expect(data).toHaveProperty("appeals");
  });
});

describe("PATCH /api/requests/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPatchRequest("/api/requests/req-1", { urgency: "urgent" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("updates a draft request successfully", async () => {
    const existing = createMockRequest({ id: "req-1", status: "draft" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const updated = { ...existing, urgency: "urgent", updatedAt: new Date() };
    prismaMock.priorAuthRequest.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/requests/req-1", { urgency: "urgent" });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.id).toBe("req-1");
  });

  it("returns 400 when trying to edit non-draft request", async () => {
    const existing = createMockRequest({ id: "req-1", status: "submitted" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createPatchRequest("/api/requests/req-1", { urgency: "urgent" });
    const res = await PATCH(req, params);

    expect(res.status).toBe(400);
    const data = await parseResponse(res);
    expect(data.error).toContain("draft");
  });

  it("returns 404 for request from different org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/requests/req-1", { urgency: "urgent" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("validates update schema", async () => {
    const existing = createMockRequest({ id: "req-1", status: "draft" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createPatchRequest("/api/requests/req-1", { urgency: "invalid_urgency" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/requests/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createDeleteRequest("/api/requests/req-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(401);
  });

  it("deletes a draft request successfully", async () => {
    const existing = createMockRequest({ id: "req-1", status: "draft" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);
    prismaMock.authDocument.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.authStatusChange.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.priorAuthRequest.delete.mockResolvedValueOnce(existing);

    const req = createDeleteRequest("/api/requests/req-1");
    const res = await DELETE(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(true);
  });

  it("returns 400 when trying to delete non-draft request", async () => {
    const existing = createMockRequest({ id: "req-1", status: "submitted" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createDeleteRequest("/api/requests/req-1");
    const res = await DELETE(req, params);

    expect(res.status).toBe(400);
    const data = await parseResponse(res);
    expect(data.error).toContain("draft");
  });

  it("returns 404 for non-existent request", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/requests/req-1");
    const res = await DELETE(req, params);
    expect(res.status).toBe(404);
  });
});
