/**
 * Tests for POST /api/auth/forgot-password
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import { createPostRequest, parseResponse } from "../../helpers/request";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendResetEmail } from "@/lib/auth-email";
import { POST } from "@/app/api/auth/forgot-password/route";

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    resetPrismaMocks();
    vi.mocked(createAuthToken).mockClear();
    vi.mocked(sendResetEmail).mockClear();
    vi.mocked(createAuthToken).mockResolvedValue("mock-reset-token");
    vi.mocked(sendResetEmail).mockResolvedValue(true);
  });

  it("returns success message for existing active user", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      firstName: "Sarah",
      isActive: true,
    });

    const req = createPostRequest("/api/auth/forgot-password", {
      email: "sarah@example.com",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.message).toContain("password reset link");
    expect(createAuthToken).toHaveBeenCalledWith("user-1", "reset");
    expect(sendResetEmail).toHaveBeenCalledWith(
      "sarah@example.com",
      "Sarah",
      "mock-reset-token",
    );
  });

  it("returns same success message for nonexistent email (no enumeration)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const req = createPostRequest("/api/auth/forgot-password", {
      email: "nobody@example.com",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.message).toContain("password reset link");
    expect(createAuthToken).not.toHaveBeenCalled();
    expect(sendResetEmail).not.toHaveBeenCalled();
  });

  it("returns same success message for inactive user", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-2",
      firstName: "Inactive",
      isActive: false,
    });

    const req = createPostRequest("/api/auth/forgot-password", {
      email: "inactive@example.com",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(createAuthToken).not.toHaveBeenCalled();
  });

  it("returns success even with invalid email format (no enumeration via validation)", async () => {
    const req = createPostRequest("/api/auth/forgot-password", {
      email: "not-an-email",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});
