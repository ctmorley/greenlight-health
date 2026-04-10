/**
 * Tests for POST /api/requests/[id]/submit
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createPostRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import {
  createMockSession,
  createMockRequest,
  createMockPatient,
  createMockPayer,
  createMockInsurance,
  createMockDocument,
} from "../../helpers/factories";
import { POST } from "@/app/api/requests/[id]/submit/route";

const params = createParams({ id: "req-1" });

describe("POST /api/requests/[id]/submit", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/requests/req-1/submit");
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent request", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createPostRequest("/api/requests/req-1/submit");
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 400 when request is not in draft status", async () => {
    const existing = createMockRequest({
      id: "req-1",
      status: "submitted",
      patient: createMockPatient(),
      payer: createMockPayer(),
      insurance: createMockInsurance(),
      documents: [],
    });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(existing);

    const req = createPostRequest("/api/requests/req-1/submit");
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("submits a complete draft request successfully", async () => {
    const fullRequest = {
      ...createMockRequest({
        id: "req-1",
        status: "draft",
        serviceCategory: "imaging",
        serviceType: "mri",
        payerId: "py1",
        insuranceId: "ins1",
        cptCodes: ["70553"],
        icd10Codes: ["M54.5"],
        clinicalNotes: "Patient has chronic back pain.",
        procedureDescription: "MRI lumbar spine",
        scheduledDate: new Date("2026-04-15"),
        orderingPhysicianId: "doc-1",
      }),
      patient: createMockPatient(),
      payer: createMockPayer(),
      insurance: createMockInsurance(),
      documents: [createMockDocument()],
    };

    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(fullRequest);

    const updated = {
      ...fullRequest,
      status: "submitted",
      submittedAt: new Date(),
      referenceNumber: fullRequest.referenceNumber,
    };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce(updated);
      prismaMock.authStatusChange.create.mockResolvedValueOnce({ id: "sc1" });
      return fn(prismaMock);
    });

    const req = createPostRequest("/api/requests/req-1/submit");
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.submitted).toBe(true);
    expect(data.status).toBe("submitted");
    expect(data).toHaveProperty("auditResult");
    expect(data.auditResult.passed).toBe(true);
  });

  it("returns 400 when required fields are missing (no service category)", async () => {
    const incompleteRequest = {
      ...createMockRequest({
        id: "req-1",
        status: "draft",
        serviceCategory: null,
        serviceType: null,
        payerId: null,
        cptCodes: [],
      }),
      patient: createMockPatient(),
      payer: null,
      insurance: null,
      documents: [],
    };

    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(incompleteRequest);

    const req = createPostRequest("/api/requests/req-1/submit");
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(data.submitted).toBe(false);
    expect(data.auditResult.passed).toBe(false);
    expect(data.auditResult.issues.some((i: { severity: string }) => i.severity === "error")).toBe(true);
  });

  it("returns 400 when CPT codes are missing", async () => {
    const noCptRequest = {
      ...createMockRequest({
        id: "req-1",
        status: "draft",
        serviceCategory: "imaging",
        serviceType: "mri",
        payerId: "py1",
        cptCodes: [], // missing CPT codes
      }),
      patient: createMockPatient(),
      payer: createMockPayer(),
      insurance: null,
      documents: [],
    };

    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(noCptRequest);

    const req = createPostRequest("/api/requests/req-1/submit");
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(400);
    const cptIssue = data.auditResult.issues.find(
      (i: { field: string; severity: string }) => i.field === "cptCodes" && i.severity === "error"
    );
    expect(cptIssue).toBeDefined();
  });

  it("verifies org scoping on the findFirst call", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/requests/req-1/submit");
    await POST(req, params);

    const call = prismaMock.priorAuthRequest.findFirst.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
  });
});
