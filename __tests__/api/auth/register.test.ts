/**
 * Tests for POST /api/register
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import { createPostRequest, parseResponse } from "../../helpers/request";
import { createMockUser, createMockOrg } from "../../helpers/factories";
import { POST } from "@/app/api/register/route";

describe("POST /api/register", () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it("creates a new organization and admin user on success", async () => {
    const mockOrg = createMockOrg({ id: "new-org" });
    const mockUser = createMockUser({
      id: "new-user",
      organizationId: "new-org",
      email: "new@test.com",
      role: "admin",
    });

    // No existing user with this email
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    // Transaction creates org + user
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.organization.create.mockResolvedValueOnce(mockOrg);
      prismaMock.user.create.mockResolvedValueOnce(mockUser);
      return fn(prismaMock);
    });

    const req = createPostRequest("/api/register", {
      organizationName: "New Imaging Center",
      email: "new@test.com",
      password: "SecurePass123!",
      firstName: "Jane",
      lastName: "Admin",
    });

    const response = await POST(req);
    const data = await parseResponse(response);

    expect(response.status).toBe(201);
    expect(data).toHaveProperty("organizationId");
    expect(data).toHaveProperty("userId");
    expect(data).toHaveProperty("message", "Registration successful");
  });

  it("returns 409 when email already exists", async () => {
    const existingUser = createMockUser({ email: "existing@test.com" });
    prismaMock.user.findUnique.mockResolvedValueOnce(existingUser);

    const req = createPostRequest("/api/register", {
      organizationName: "Duplicate Org",
      email: "existing@test.com",
      password: "SecurePass123!",
    });

    const response = await POST(req);
    const data = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(data.error).toContain("already exists");
  });

  it("returns 400 for missing required fields", async () => {
    const req = createPostRequest("/api/register", {
      email: "test@test.com",
      // missing organizationName and password
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const req = createPostRequest("/api/register", {
      organizationName: "Test Org",
      email: "not-an-email",
      password: "SecurePass123!",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for password too short", async () => {
    const req = createPostRequest("/api/register", {
      organizationName: "Test Org",
      email: "test@test.com",
      password: "short",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for organization name too short", async () => {
    const req = createPostRequest("/api/register", {
      organizationName: "X",
      email: "test@test.com",
      password: "SecurePass123!",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 409 on P2002 unique constraint race condition", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    // Simulate a Prisma PrismaClientKnownRequestError with P2002 code
    // We need to use the actual Prisma error class for instanceof to work
    const { Prisma } = await import("@prisma/client");
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`email`)",
      { code: "P2002", clientVersion: "6.4.0" }
    );

    prismaMock.$transaction.mockRejectedValueOnce(p2002Error);

    const req = createPostRequest("/api/register", {
      organizationName: "Race Condition Org",
      email: "race@test.com",
      password: "SecurePass123!",
    });

    const response = await POST(req);
    expect(response.status).toBe(409);
    const data = await parseResponse(response);
    expect(data.error).toContain("already exists");
  });
});
