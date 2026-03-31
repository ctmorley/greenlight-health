/**
 * Tests for GET/POST /api/requests/[id]/timeline
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
import {
  createMockSession,
  createMockStatusChange,
} from "../../helpers/factories";
import { GET, POST } from "@/app/api/requests/[id]/timeline/route";

const params = createParams({ id: "req-1" });

describe("GET /api/requests/[id]/timeline", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/requests/req-1/timeline");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 for request from different org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/requests/req-1/timeline");
    const res = await GET(req, params);
    expect(res.status).toBe(404);
  });

  it("returns timeline entries for a request", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1" });

    const changes = [
      {
        ...createMockStatusChange({ fromStatus: "draft", toStatus: "submitted" }),
        changedBy: { firstName: "Test", lastName: "Admin" },
      },
      {
        ...createMockStatusChange({ fromStatus: "draft", toStatus: "draft", note: "Created" }),
        changedBy: { firstName: "Test", lastName: "Admin" },
      },
    ];
    prismaMock.authStatusChange.findMany.mockResolvedValueOnce(changes);

    const req = createGetRequest("/api/requests/req-1/timeline");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.timeline).toHaveLength(2);
    expect(data.timeline[0]).toHaveProperty("fromStatus");
    expect(data.timeline[0]).toHaveProperty("toStatus");
    expect(data.timeline[0]).toHaveProperty("changedBy");
  });
});

describe("POST /api/requests/[id]/timeline", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession({ role: "admin" }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/requests/req-1/timeline", { note: "Test note" });
    const res = await POST(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockSession(createMockSession({ role: "viewer" }));
    const req = createPostRequest("/api/requests/req-1/timeline", { note: "Test note" });
    const res = await POST(req, params);
    expect(res.status).toBe(403);
  });

  it("adds a note to the timeline", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "submitted" });

    const newEntry = {
      ...createMockStatusChange({
        fromStatus: "submitted",
        toStatus: "submitted",
        note: "Called payer for update",
      }),
      changedBy: { firstName: "Test", lastName: "Admin" },
    };
    prismaMock.authStatusChange.create.mockResolvedValueOnce(newEntry);

    const req = createPostRequest("/api/requests/req-1/timeline", {
      note: "Called payer for update",
    });
    const res = await POST(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.note).toBe("Called payer for update");
    expect(data.fromStatus).toBe("submitted");
    expect(data.toStatus).toBe("submitted"); // Same — note-only entry
  });

  it("allows physician to add notes", async () => {
    mockSession(createMockSession({ role: "physician" }));
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "draft" });

    const newEntry = {
      ...createMockStatusChange({ note: "Clinical update" }),
      changedBy: { firstName: "Dr", lastName: "Smith" },
    };
    prismaMock.authStatusChange.create.mockResolvedValueOnce(newEntry);

    const req = createPostRequest("/api/requests/req-1/timeline", { note: "Clinical update" });
    const res = await POST(req, params);
    expect(res.status).toBe(201);
  });

  it("returns 404 for request from different org", async () => {
    prismaMock.priorAuthRequest.findFirst.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/requests/req-1/timeline", { note: "Test note" });
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });
});
