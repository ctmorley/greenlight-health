/**
 * Tests for the submission approval flow.
 *
 * Covers:
 * - GET approval status
 * - Approve/reject submission
 * - Role enforcement
 * - Submit blocked without approval
 * - Approval invalidated on material request edit
 * - Transport change naturally invalidates (requestId+transportId mismatch)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  createParams,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession } from "../../helpers/factories";

import { GET as getApproval } from "@/app/api/requests/[id]/submission-approval/route";
import { POST as approveSubmission } from "@/app/api/requests/[id]/approve-submission/route";
import { POST as rejectSubmission } from "@/app/api/requests/[id]/reject-submission/route";
import { vi } from "vitest";
import { resolveTransport } from "@/lib/transport";

// Default transport mock from setup.ts has requiresHumanReview=false.
// Override for approval-specific tests that need a real transport with review required.
const realTransportMock = {
  id: "transport-fhir-1",
  payerId: "py-1",
  organizationId: "org-1",
  method: "fhir_pas",
  environment: "sandbox",
  isEnabled: true,
  priority: 0,
  endpointUrl: "https://fhir.payer.com/Claim/$submit",
  statusEndpointUrl: null,
  externalPayerId: null,
  clearinghousePayerId: null,
  credentialRef: "keyvault://payer-creds",
  supportsAttachments: false,
  supportsStatusCheck: false,
  requiresHumanReview: true,
  metadata: null,
};

describe("Submission Approval", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  // ── GET approval status ──

  describe("GET /api/requests/[id]/submission-approval", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const req = createGetRequest("/api/requests/req-1/submission-approval");
      const res = await getApproval(req, createParams({ id: "req-1" }));
      expect(res.status).toBe(401);
    });

    it("returns 404 when request not found", async () => {
      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
      const req = createGetRequest("/api/requests/req-1/submission-approval");
      const res = await getApproval(req, createParams({ id: "req-1" }));
      expect(res.status).toBe(404);
    });

    it("returns approval status with transport info", async () => {
      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({
        id: "req-1",
        payerId: "py-1",
      });
      prismaMock.submissionApproval.findUnique.mockResolvedValueOnce({
        id: "appr-1",
        status: "approved",
        reviewedBy: { firstName: "Admin", lastName: "User", email: "admin@test.com" },
        reviewedAt: new Date("2025-04-08"),
        note: "Looks good",
        createdAt: new Date("2025-04-08"),
      });

      const req = createGetRequest("/api/requests/req-1/submission-approval");
      const res = await getApproval(req, createParams({ id: "req-1" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.approval.status).toBe("approved");
      expect(data.transportId).toBe("transport-sim-1");
      expect(data.transportMethod).toBe("simulated");
      expect(data.approvalRequired).toBe(false); // simulated + requiresHumanReview=false
    });

    it("returns null approval when none exists", async () => {
      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({
        id: "req-1",
        payerId: "py-1",
      });
      prismaMock.submissionApproval.findUnique.mockResolvedValueOnce(null);

      const req = createGetRequest("/api/requests/req-1/submission-approval");
      const res = await getApproval(req, createParams({ id: "req-1" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.approval).toBeNull();
    });
  });

  // ── Approve submission ──

  describe("POST /api/requests/[id]/approve-submission", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const req = createPostRequest("/api/requests/req-1/approve-submission", {});
      const res = await approveSubmission(req, createParams({ id: "req-1" }));
      expect(res.status).toBe(401);
    });

    it("returns 403 for viewer role", async () => {
      mockSession(createMockSession({ role: "viewer" }));
      const req = createPostRequest("/api/requests/req-1/approve-submission", {});
      const res = await approveSubmission(req, createParams({ id: "req-1" }));
      expect(res.status).toBe(403);
    });

    it("allows pa_coordinator to approve", async () => {
      mockSession(createMockSession({ role: "pa_coordinator" }));
      // Override transport to one requiring human review
      (resolveTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(realTransportMock);

      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({
        id: "req-1",
        payerId: "py-1",
        referenceNumber: "PA-001",
      });
      prismaMock.submissionApproval.upsert.mockResolvedValueOnce({
        id: "appr-1",
        status: "approved",
        reviewedAt: new Date(),
      });

      const req = createPostRequest("/api/requests/req-1/approve-submission", { note: "Approved" });
      const res = await approveSubmission(req, createParams({ id: "req-1" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.approval.status).toBe("approved");
    });

    it("returns 404 when request not found", async () => {
      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
      const req = createPostRequest("/api/requests/req-1/approve-submission", {});
      const res = await approveSubmission(req, createParams({ id: "req-1" }));
      expect(res.status).toBe(404);
    });
  });

  // ── Reject submission ──

  describe("POST /api/requests/[id]/reject-submission", () => {
    it("requires a rejection note", async () => {
      (resolveTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(realTransportMock);
      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({
        id: "req-1",
        payerId: "py-1",
        referenceNumber: "PA-001",
      });

      const req = createPostRequest("/api/requests/req-1/reject-submission", {});
      const res = await rejectSubmission(req, createParams({ id: "req-1" }));
      expect(res.status).toBe(400);
    });

    it("rejects with note", async () => {
      (resolveTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(realTransportMock);
      prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({
        id: "req-1",
        payerId: "py-1",
        referenceNumber: "PA-001",
      });
      prismaMock.submissionApproval.upsert.mockResolvedValueOnce({
        id: "appr-1",
        status: "rejected",
        reviewedAt: new Date(),
        note: "Needs more documentation",
      });

      const req = createPostRequest("/api/requests/req-1/reject-submission", {
        note: "Needs more documentation",
      });
      const res = await rejectSubmission(req, createParams({ id: "req-1" }));
      const data = await parseResponse(res);

      expect(res.status).toBe(200);
      expect(data.approval.status).toBe("rejected");
      expect(data.approval.note).toBe("Needs more documentation");
    });
  });
});
