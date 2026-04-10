/**
 * Tests for GET /api/health
 *
 * Public liveness probe (unauthenticated): returns status, version, timestamp only.
 * Authenticated callers: also get detailed checks (database, storage, secrets).
 *
 * Checks:
 * - Database connectivity (prisma.$queryRaw)
 * - Storage probe (upload + delete canary blob)
 * - Critical secret presence
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import { parseResponse, mockSession } from "../../helpers/request";
import { createMockSession } from "../../helpers/factories";
import { getStorageProvider } from "@/lib/storage";
import { GET } from "@/app/api/health/route";

// Cast the mocked storage provider for per-test control
const getStorageProviderMock = getStorageProvider as ReturnType<typeof vi.fn>;

describe("GET /api/health", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetPrismaMocks();
    // Save and set required env vars
    savedEnv.AUTH_SECRET = process.env.AUTH_SECRET;
    savedEnv.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY;
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;

    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.PHI_ENCRYPTION_KEY = "test-encryption-key";
    process.env.ANTHROPIC_API_KEY = "test-ai-key";
    process.env.RESEND_API_KEY = "test-resend-key";

    // Default: DB up, storage probe succeeds
    prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    getStorageProviderMock.mockReturnValue({
      upload: vi.fn().mockResolvedValue("__healthcheck__/probe.txt"),
      delete: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
      getSignedUrl: vi.fn(),
    });

    // Default: unauthenticated
    mockSession(null);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  // ─── Public (unauthenticated) behavior ─────────────────────

  it("returns 200 with healthy status when all checks pass", async () => {
    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.version).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  it("does not expose checks to unauthenticated callers", async () => {
    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.checks).toBeUndefined();
  });

  it("returns 200 with degraded status when non-critical secret missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.RESEND_API_KEY;

    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe("degraded");
  });

  it("returns 503 when database is down", async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("Connection refused"));

    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(503);
    expect(data.status).toBe("unhealthy");
  });

  it("returns 503 when storage probe fails", async () => {
    getStorageProviderMock.mockReturnValue({
      upload: vi.fn().mockRejectedValue(new Error("Azure auth failed")),
      delete: vi.fn(),
      download: vi.fn(),
      getSignedUrl: vi.fn(),
    });

    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(503);
    expect(data.status).toBe("unhealthy");
  });

  it("returns 503 when production has no Azure storage configured", async () => {
    const origNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(503);
    expect(data.status).toBe("unhealthy");

    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  it("returns 503 when critical secret is missing", async () => {
    delete process.env.AUTH_SECRET;

    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(503);
    expect(data.status).toBe("unhealthy");
  });

  it("does not require authentication", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("includes ISO timestamp", async () => {
    const res = await GET();
    const data = await parseResponse(res);

    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  // ─── Authenticated behavior ────────────────────────────────

  it("includes detailed checks for authenticated callers", async () => {
    mockSession(createMockSession());

    const res = await GET();
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.checks).toBeDefined();
    expect(data.checks.database.status).toBe("up");
    expect(data.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(data.checks.storage.status).toBe("up");
    expect(data.checks.secrets.authSecret).toBe(true);
    expect(data.checks.secrets.encryptionKey).toBe(true);
    expect(data.checks.secrets.anthropicKey).toBe(true);
    expect(data.checks.secrets.resendKey).toBe(true);
  });

  it("shows degraded details for authenticated callers", async () => {
    mockSession(createMockSession());
    delete process.env.ANTHROPIC_API_KEY;

    const res = await GET();
    const data = await parseResponse(res);

    expect(data.status).toBe("degraded");
    expect(data.checks.secrets.anthropicKey).toBe(false);
    expect(data.checks.secrets.authSecret).toBe(true);
  });
});
