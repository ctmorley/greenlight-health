/**
 * Tests for POST /api/auth/reset-password
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import { createPostRequest, parseResponse } from "../../helpers/request";
import { findValidToken, consumeToken, revokeAllTokens } from "@/lib/auth-tokens";
import { POST } from "@/app/api/auth/reset-password/route";

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    resetPrismaMocks();
    vi.mocked(findValidToken).mockReset().mockResolvedValue(null);
    vi.mocked(consumeToken).mockReset().mockResolvedValue(true);
    vi.mocked(revokeAllTokens).mockReset().mockResolvedValue(undefined);
  });

  it("sets password with a valid reset token", async () => {
    vi.mocked(findValidToken).mockResolvedValueOnce("user-1"); // reset type matches
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/reset-password", {
      token: "valid-reset-token",
      password: "newpassword123",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.message).toContain("successfully");
    expect(findValidToken).toHaveBeenCalledWith("valid-reset-token", "reset");
  });

  it("sets password with a valid invite token (fallback)", async () => {
    vi.mocked(findValidToken)
      .mockResolvedValueOnce(null) // reset type doesn't match
      .mockResolvedValueOnce("user-2"); // invite type matches
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/reset-password", {
      token: "valid-invite-token",
      password: "newpassword123",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(findValidToken).toHaveBeenCalledWith("valid-invite-token", "reset");
    expect(findValidToken).toHaveBeenCalledWith("valid-invite-token", "invite");
  });

  it("returns 400 for invalid/expired token", async () => {
    // Default mock returns null for both types
    const req = createPostRequest("/api/auth/reset-password", {
      token: "expired-token",
      password: "newpassword123",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid or expired");
  });

  it("returns 400 for short password", async () => {
    const req = createPostRequest("/api/auth/reset-password", {
      token: "some-token",
      password: "short",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing token", async () => {
    const req = createPostRequest("/api/auth/reset-password", {
      password: "newpassword123",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("clears mustChangePassword on success", async () => {
    vi.mocked(findValidToken).mockResolvedValueOnce("user-1");
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/reset-password", {
      token: "valid-token",
      password: "newpassword123",
    });
    await POST(req);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: false }),
      }),
    );
  });

  it("consumes token and revokes all tokens inside the transaction", async () => {
    vi.mocked(findValidToken).mockResolvedValueOnce("user-1");
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const req = createPostRequest("/api/auth/reset-password", {
      token: "valid-token",
      password: "newpassword123",
    });
    await POST(req);

    // consumeToken called with the token, type, and transaction client
    expect(consumeToken).toHaveBeenCalledWith("valid-token", "reset", prismaMock);
    // revokeAllTokens called with userId and transaction client
    expect(revokeAllTokens).toHaveBeenCalledWith("user-1", prismaMock);
  });

  it("returns 400 when token is consumed by concurrent request", async () => {
    vi.mocked(findValidToken).mockResolvedValueOnce("user-1");
    vi.mocked(consumeToken).mockResolvedValueOnce(false); // concurrent consume
    prismaMock.$transaction.mockImplementationOnce(async (fn) => fn(prismaMock));

    const req = createPostRequest("/api/auth/reset-password", {
      token: "raced-token",
      password: "newpassword123",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(data.error).toContain("no longer valid");
  });
});
