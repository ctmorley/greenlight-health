/**
 * Tests for GET/POST /api/requests/[id]/documents and GET/DELETE /api/requests/[id]/documents/[docId]
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  createDeleteRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockDocument } from "../../helpers/factories";
import { getStorageProvider } from "@/lib/storage";
import { GET, POST } from "@/app/api/requests/[id]/documents/route";
import { GET as GET_DOC, DELETE as DELETE_DOC } from "@/app/api/requests/[id]/documents/[docId]/route";

const params = createParams({ id: "req-1" });
const docParams = createParams({ id: "req-1", docId: "doc-1" });

// ─── GET /api/requests/[id]/documents ────────────────────────

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

// ─── POST /api/requests/[id]/documents (JSON download action) ─

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

// ─── GET /api/requests/[id]/documents/[docId] ────────────────

describe("GET /api/requests/[id]/documents/[docId]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/requests/req-1/documents/doc-1");
    const res = await GET_DOC(req, docParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when request not in org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/requests/req-1/documents/doc-1");
    const res = await GET_DOC(req, docParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when document not found", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(null);

    const req = createGetRequest("/api/requests/req-1/documents/doc-1");
    const res = await GET_DOC(req, docParams);
    expect(res.status).toBe(404);
  });

  it("downloads a document successfully", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "report.pdf", fileType: "application/pdf" })
    );

    const req = createGetRequest("/api/requests/req-1/documents/doc-1");
    const res = await GET_DOC(req, docParams);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("report.pdf");
  });
});

// ─── DELETE /api/requests/[id]/documents/[docId] ─────────────

describe("DELETE /api/requests/[id]/documents/[docId]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createDeleteRequest("/api/requests/req-1/documents/doc-1");
    const res = await DELETE_DOC(req, docParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when request not in org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createDeleteRequest("/api/requests/req-1/documents/doc-1");
    const res = await DELETE_DOC(req, docParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when document not found", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "draft" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/requests/req-1/documents/doc-1");
    const res = await DELETE_DOC(req, docParams);
    expect(res.status).toBe(404);
  });

  it("deletes a document successfully", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "draft" });
    const doc = createMockDocument({ id: "doc-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(doc);
    prismaMock.authDocument.delete.mockResolvedValueOnce(doc);

    const req = createDeleteRequest("/api/requests/req-1/documents/doc-1");
    const res = await DELETE_DOC(req, docParams);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.authDocument.delete).toHaveBeenCalledWith({ where: { id: "doc-1" } });
  });

  it("verifies org scoping on request lookup", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createDeleteRequest("/api/requests/req-1/documents/doc-1");
    await DELETE_DOC(req, docParams);

    const call = prismaMock.priorAuthRequest.findFirst.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
    expect(call.where.id).toBe("req-1");
  });
});

// ─── Azure signed-URL paths ─────────────────────────────────

describe("Azure signed-URL download paths", () => {
  const mockStorage = getStorageProvider();

  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
    // Reset to default (null = local proxy mode)
    vi.mocked(mockStorage.getSignedUrl).mockResolvedValue(null);
  });

  it("GET /documents/[docId] returns 302 redirect when signed URL is available", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "scan.pdf", fileType: "application/pdf", filePath: "documents/org-1/req-1/uuid-scan.pdf" })
    );
    vi.mocked(mockStorage.getSignedUrl).mockResolvedValueOnce(
      "https://storage.blob.core.windows.net/documents/org-1/req-1/uuid-scan.pdf?sv=2024&sig=abc"
    );

    const req = createGetRequest("/api/requests/req-1/documents/doc-1");
    const res = await GET_DOC(req, docParams);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("blob.core.windows.net");
  });

  it("GET /documents/[docId] passes disposition and fileName to getSignedUrl", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "image.png", fileType: "image/png", filePath: "documents/org-1/req-1/uuid-image.png" })
    );
    vi.mocked(mockStorage.getSignedUrl).mockResolvedValueOnce("https://example.com/signed");

    const req = createGetRequest("/api/requests/req-1/documents/doc-1", { disposition: "inline" });
    await GET_DOC(req, docParams);

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
      "documents/org-1/req-1/uuid-image.png",
      300,
      {
        disposition: "inline",
        fileName: "image.png",
        contentType: "image/png",
      },
    );
  });

  it("GET /documents/[docId] defaults to attachment disposition", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "report.pdf", fileType: "application/pdf", filePath: "documents/org-1/req-1/uuid-report.pdf" })
    );
    vi.mocked(mockStorage.getSignedUrl).mockResolvedValueOnce("https://example.com/signed");

    const req = createGetRequest("/api/requests/req-1/documents/doc-1");
    await GET_DOC(req, docParams);

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      300,
      expect.objectContaining({ disposition: "attachment" }),
    );
  });

  it("POST download action returns { url } when signed URL is available", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "notes.pdf", fileType: "application/pdf", filePath: "documents/org-1/req-1/uuid-notes.pdf" })
    );
    vi.mocked(mockStorage.getSignedUrl).mockResolvedValueOnce(
      "https://storage.blob.core.windows.net/documents/org-1/req-1/uuid-notes.pdf?sv=2024&sig=xyz"
    );

    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "download",
      documentId: "doc-1",
    });
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.url).toContain("blob.core.windows.net");
  });

  it("POST download action passes inline disposition to getSignedUrl", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "image.jpg", fileType: "image/jpeg", filePath: "documents/org-1/req-1/uuid-image.jpg" })
    );
    vi.mocked(mockStorage.getSignedUrl).mockResolvedValueOnce("https://example.com/signed");

    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "download",
      documentId: "doc-1",
      disposition: "inline",
    });
    await POST(req, params);

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
      "documents/org-1/req-1/uuid-image.jpg",
      300,
      {
        disposition: "inline",
        fileName: "image.jpg",
        contentType: "image/jpeg",
      },
    );
  });

  it("POST download falls back to proxied binary when getSignedUrl returns null", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });
    prismaMock.authDocument.findFirst.mockResolvedValueOnce(
      createMockDocument({ id: "doc-1", fileName: "report.pdf", fileType: "application/pdf", filePath: "documents/org-1/req-1/uuid-report.pdf" })
    );
    // getSignedUrl already defaults to null from beforeEach

    const req = createPostRequest("/api/requests/req-1/documents", {
      action: "download",
      documentId: "doc-1",
    });
    const res = await POST(req, params);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("report.pdf");
  });
});
