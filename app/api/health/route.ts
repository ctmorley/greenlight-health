import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAiConfigured } from "@/lib/ai/client";
import { log } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage";

/**
 * GET /api/health
 *
 * Public liveness probe for load balancers, Docker HEALTHCHECK, and Azure
 * App Service probes. Returns only status, version, and timestamp — no
 * internal config details.
 *
 * Authenticated callers with an active session also receive detailed
 * check results (database latency, storage probe, secret presence).
 */

const APP_VERSION = process.env.npm_package_version || "1.0.0";

interface CheckResult {
  status: "up" | "down" | "unconfigured";
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

async function checkStorage(): Promise<CheckResult> {
  // In production, local filesystem storage is not valid — Azure must be configured.
  if (process.env.NODE_ENV === "production" && !process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return { status: "down", error: "Cloud storage not configured (AZURE_STORAGE_CONNECTION_STRING missing)" };
  }

  const start = Date.now();
  try {
    const provider = getStorageProvider();
    const canaryKey = "__healthcheck__/probe.txt";
    await provider.upload(canaryKey, Buffer.from("ok"), "text/plain");
    await provider.delete(canaryKey);
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown storage error",
    };
  }
}

function checkSecrets() {
  return {
    authSecret: !!process.env.AUTH_SECRET,
    encryptionKey: !!process.env.PHI_ENCRYPTION_KEY,
    anthropicKey: isAiConfigured(),
    resendKey: !!process.env.RESEND_API_KEY,
  };
}

function computeStatus(
  dbCheck: CheckResult,
  storageCheck: CheckResult,
  secrets: ReturnType<typeof checkSecrets>
): "healthy" | "degraded" | "unhealthy" {
  // Hard failures
  if (dbCheck.status === "down") return "unhealthy";
  if (!secrets.authSecret || !secrets.encryptionKey) return "unhealthy";
  if (storageCheck.status === "down") return "unhealthy";

  // Soft failures
  if (!secrets.anthropicKey || !secrets.resendKey) return "degraded";

  return "healthy";
}

export async function GET() {
  const dbCheck = await checkDatabase();
  const storageCheck = await checkStorage();
  const secrets = checkSecrets();
  const status = computeStatus(dbCheck, storageCheck, secrets);

  if (status === "unhealthy") {
    log.error("Health check unhealthy", {
      route: "/api/health",
      dbStatus: dbCheck.status,
      dbError: dbCheck.error,
      storageStatus: storageCheck.status,
      storageError: storageCheck.error,
    });
  }

  // Check if caller is authenticated — if so, include detailed checks
  const session = await auth();
  const isAuthenticated = !!session?.user;

  const body = isAuthenticated
    ? {
        status,
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: dbCheck.status, latencyMs: dbCheck.latencyMs },
          storage: { status: storageCheck.status, latencyMs: storageCheck.latencyMs },
          secrets,
        },
      }
    : {
        status,
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
      };

  return NextResponse.json(body, {
    status: status === "unhealthy" ? 503 : 200,
  });
}
