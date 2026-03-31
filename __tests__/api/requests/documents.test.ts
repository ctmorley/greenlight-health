/**
 * Tests for GET/POST /api/requests/[id]/documents
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
import { createMockSession, createMockDocument } from "../../helpers/factories";
import { GET, POST } from "@/app/api/requests/[id]/documents/route";

const params = createParams({ id: "req-1" });

describe("GET /api/requests/[id]/documents", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/requests/req-1/documents");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 for request from different org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/requests/req-1/documents");
    const res = await GET(req, params);
    expect(res.status).toBe(404);
  });

  it("returns documents for a request", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });

    const docs = [
      {
        ...createMockDocument({ id: "doc-1", fileName: "clinical-notes.pdf" }),
        uploadedBy: { firstName: "Test", lastName: "Admin" },
      },
    ];
    prismaMock.authDocument.findMany.mockResolvedValueOnce(docs);

    const req = createGetRequest("/api/requests/req-1/documents");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].fileName).toBe("clinical-notes.pdf");
    expect(data.documents[0]).toHaveProperty("uploadedBy");
    expect(data.documents[0]).toHaveProperty("category");
  });

  it("returns empty array when no documents", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/requests/req-1/documents");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.documents).toHaveLength(0);
  });
});

describe("POST /api/requests/[id]/documents (JSON download action)", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "download",
      documentId: "doc-1",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when request not in org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "download",
      documentId: "doc-1",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON action", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });

    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "invalid",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 404 when document not found for download", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "download",
      documentId: "nonexistent-doc",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });
});
