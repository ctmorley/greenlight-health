/**
 * Tests for GET/POST /api/requests
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import {
  createMockSession,
  createMockRequest,
  createMockPatient,
  createMockPayer,
} from "../../helpers/factories";
import { GET, POST } from "@/app/api/requests/route";

describe("GET /api/requests", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/requests");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no organization context", async () => {
    mockSession(createMockSession({ organizationId: "" }));
    const req = createGetRequest("/api/requests");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns paginated requests scoped to organization", async () => {
    const mockReq = createMockRequest();
    const requestWithRelations = {
      ...mockReq,
      patient: { id: "p1", firstName: "John", lastName: "Doe", mrn: "MRN001" },
      payer: { id: "py1", name: "Aetna" },
      createdBy: { firstName: "Test", lastName: "Admin" },
    };

    prismaMock.priorAuthRequest.findMany.mockResolvedValueOnce([requestWithRelations]);
    prismaMock.priorAuthRequest.count.mockResolvedValueOnce(1);
    prismaMock.priorAuthRequest.groupBy.mockResolvedValueOnce([
      { status: "draft", _count: { _all: 1 } },
    ]);

    const req = createGetRequest("/api/requests");
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("requests");
    expect(data).toHaveProperty("pagination");
    expect(data).toHaveProperty("statusCounts");
    expect(Array.isArray(data.requests)).toBe(true);
    expect(data.pagination.totalCount).toBe(1);
  });

  it("returns only own-org requests (verified by Prisma where clause)", async () => {
    prismaMock.priorAuthRequest.findMany.mockResolvedValueOnce([]);
    prismaMock.priorAuthRequest.count.mockResolvedValueOnce(0);
    prismaMock.priorAuthRequest.groupBy.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/requests");
    await GET(req);

    // Verify the findMany call includes organizationId filter
    const findManyCall = prismaMock.priorAuthRequest.findMany.mock.calls[0][0];
    expect(findManyCall.where).toHaveProperty("organizationId", "org-1");
  });

  it("supports pagination parameters", async () => {
    prismaMock.priorAuthRequest.findMany.mockResolvedValueOnce([]);
    prismaMock.priorAuthRequest.count.mockResolvedValueOnce(0);
    prismaMock.priorAuthRequest.groupBy.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/requests", { page: "2", pageSize: "10" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.pagination.page).toBe(2);
    expect(data.pagination.pageSize).toBe(10);
  });

  it("supports status filtering", async () => {
    prismaMock.priorAuthRequest.findMany.mockResolvedValueOnce([]);
    prismaMock.priorAuthRequest.count.mockResolvedValueOnce(0);
    prismaMock.priorAuthRequest.groupBy.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/requests", { status: "draft,submitted" });
    await GET(req);

    const findManyCall = prismaMock.priorAuthRequest.findMany.mock.calls[0][0];
    expect(findManyCall.where.status).toEqual({ in: ["draft", "submitted"] });
  });
});

describe("POST /api/requests", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/requests", { patientId: "p1" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates a draft PA request successfully", async () => {
    const patient = createMockPatient({ id: "p1", organizationId: "org-1" });
    const payer = createMockPayer({ id: "py1" });

    prismaMock.patient.findFirst.mockResolvedValueOnce(patient);
    prismaMock.payer.findFirst.mockResolvedValueOnce(payer);

    const created = createMockRequest({ id: "new-req", patientId: "p1", payerId: "py1" });
    const statusChange = { id: "sc1" };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.priorAuthRequest.create.mockResolvedValueOnce(created);
      prismaMock.authStatusChange.create.mockResolvedValueOnce(statusChange);
      return fn(prismaMock);
    });

    // Mock reference number generation
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/requests", {
      patientId: "p1",
      serviceCategory: "imaging",
      serviceType: "mri",
      cptCodes: ["70553"],
      icd10Codes: ["M54.5"],
      payerId: "py1",
      urgency: "routine",
    });

    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("referenceNumber");
    expect(data.status).toBe("draft");
  });

  it("returns 400 when patientId is missing", async () => {
    const req = createPostRequest("/api/requests", {
      serviceCategory: "imaging",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when patient belongs to different org", async () => {
    prismaMock.patient.findFirst.mockResolvedValueOnce(null); // not found in this org

    const req = createPostRequest("/api/requests", {
      patientId: "other-org-patient",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 404 when payer does not exist", async () => {
    const patient = createMockPatient({ id: "p1", organizationId: "org-1" });
    prismaMock.patient.findFirst.mockResolvedValueOnce(patient);
    prismaMock.payer.findUnique.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/requests", {
      patientId: "p1",
      payerId: "nonexistent-payer",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("validates required fields with Zod schema", async () => {
    const req = createPostRequest("/api/requests", {
      patientId: "", // empty string fails min(1)
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await parseResponse(res);
    expect(data).toHaveProperty("error");
  });
});
