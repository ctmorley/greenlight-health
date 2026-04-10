/**
 * Tests for POST /api/auth/change-password
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import { createPostRequest, mockSession, parseResponse } from "../../helpers/request";
import { createMockSession } from "../../helpers/factories";
import { revokeAllTokens } from "@/lib/auth-tokens";
import { POST } from "@/app/api/auth/change-password/route";

// bcryptjs is globally mocked: compare returns true, hash returns "$2a$12$hashedpassword"

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
    vi.mocked(revokeAllTokens).mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/auth/change-password", {
      currentPassword: "old",
      newPassword: "newpassword123",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("changes password with correct current password", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      passwordHash: "$2a$12$existinghash",
    });
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/change-password", {
      currentPassword: "correctpassword",
      newPassword: "newpassword123",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.message).toContain("successfully");
  });

  it("returns 400 for wrong current password", async () => {
    // Override bcryptjs compare to return false for this test
    const bcrypt = await import("bcryptjs");
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    prismaMock.user.findUnique.mockResolvedValueOnce({
      passwordHash: "$2a$12$existinghash",
    });

    const req = createPostRequest("/api/auth/change-password", {
      currentPassword: "wrongpassword",
      newPassword: "newpassword123",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(data.error).toContain("incorrect");
  });

  it("returns 400 for short new password", async () => {
    const req = createPostRequest("/api/auth/change-password", {
      currentPassword: "old",
      newPassword: "short",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("clears mustChangePassword on success", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      passwordHash: "$2a$12$existinghash",
    });
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/change-password", {
      currentPassword: "correct",
      newPassword: "newpassword123",
    });
    await POST(req);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: false }),
      }),
    );
  });

  it("revokes all tokens in same transaction on success", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      passwordHash: "$2a$12$existinghash",
    });
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/change-password", {
      currentPassword: "correct",
      newPassword: "newpassword123",
    });
    await POST(req);

    expect(revokeAllTokens).toHaveBeenCalledWith("user-1", prismaMock);
  });
});
