/**
 * Tests for POST /api/requests/[id]/appeal
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
  createMockDenial,
  createMockAppeal,
} from "../../helpers/factories";
import { POST } from "@/app/api/requests/[id]/appeal/route";

const params = createParams({ id: "req-1" });

describe("POST /api/requests/[id]/appeal", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(403);
  });

  it("returns 403 for physician role", async () => {
    mockSession(createMockSession({ role: "physician" }));
    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(403);
  });

  it("files an appeal for a denied request", async () => {
    const deniedRequest = createMockRequest({ id: "req-1", status: "denied", referenceNumber: "GL-20260101-00001" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(deniedRequest);

    const denial = createMockDenial({ id: "den-1", priorAuthId: "req-1" });
    prismaMock.denial.findFirst.mockResolvedValueOnce(denial);

    // No existing active appeal
    prismaMock.appeal.findFirst.mockResolvedValueOnce(null);

    const newAppeal = {
      ...createMockAppeal({ id: "appeal-1", priorAuthId: "req-1", denialId: "den-1" }),
      filedBy: { firstName: "Test", lastName: "Admin" },
    };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.appeal.create.mockResolvedValueOnce(newAppeal);
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce({ ...deniedRequest, status: "appealed" });
      prismaMock.authStatusChange.create.mockResolvedValueOnce({ id: "sc1" });
      return fn(prismaMock);
    });

    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity for this procedure.",
    });
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.appeal).toBeDefined();
    expect(data.appeal.status).toBe("filed");
    expect(data.appeal.appealLevel).toBe("first");
  });

  it("returns 422 when request is not in denied status", async () => {
    const draftRequest = createMockRequest({ id: "req-1", status: "draft" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(draftRequest);

    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity.",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(422);
  });

  it("returns 409 when active appeal already exists", async () => {
    const deniedRequest = createMockRequest({ id: "req-1", status: "denied" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(deniedRequest);

    const denial = createMockDenial({ id: "den-1", priorAuthId: "req-1" });
    prismaMock.denial.findFirst.mockResolvedValueOnce(denial);

    // Active appeal already exists
    prismaMock.appeal.findFirst.mockResolvedValueOnce(
      createMockAppeal({ id: "existing-appeal", status: "filed" })
    );

    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity.",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(409);
  });

  it("returns 400 when appeal reason is too short", async () => {
    const deniedRequest = createMockRequest({ id: "req-1", status: "denied" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(deniedRequest);

    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "Short", // less than 10 chars
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("defaults to most recent denial when denialId not provided", async () => {
    const deniedRequest = createMockRequest({ id: "req-1", status: "denied" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(deniedRequest);

    const latestDenial = createMockDenial({ id: "latest-den" });
    prismaMock.denial.findFirst.mockResolvedValueOnce(latestDenial);

    prismaMock.appeal.findFirst.mockResolvedValueOnce(null);

    const newAppeal = {
      ...createMockAppeal({ id: "appeal-1", denialId: "latest-den" }),
      filedBy: { firstName: "Test", lastName: "Admin" },
    };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.appeal.create.mockResolvedValueOnce(newAppeal);
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce({});
      prismaMock.authStatusChange.create.mockResolvedValueOnce({});
      return fn(prismaMock);
    });

    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity.",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(201);
  });

  it("allows pa_coordinator to file appeal", async () => {
    mockSession(createMockSession({ role: "pa_coordinator" }));

    const deniedRequest = createMockRequest({ id: "req-1", status: "denied" });
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(deniedRequest);

    const denial = createMockDenial({ id: "den-1" });
    prismaMock.denial.findFirst.mockResolvedValueOnce(denial);
    prismaMock.appeal.findFirst.mockResolvedValueOnce(null);

    const newAppeal = {
      ...createMockAppeal(),
      filedBy: { firstName: "Test", lastName: "Coordinator" },
    };

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.appeal.create.mockResolvedValueOnce(newAppeal);
      prismaMock.priorAuthRequest.update.mockResolvedValueOnce({});
      prismaMock.authStatusChange.create.mockResolvedValueOnce({});
      return fn(prismaMock);
    });

    const req = createPostRequest("/api/requests/req-1/appeal", {
      appealLevel: "first",
      appealReason: "The clinical documentation supports medical necessity.",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(201);
  });
});
