/**
 * Request-Level Logging
 *
 * Logs structured JSON for every API request with context:
 * request ID, user ID, org ID, route, method, status, and duration.
 *
 * Usage: wrap an API route handler with `withRequestLogging`:
 *
 *   export const GET = withRequestLogging(async (request) => {
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * Or call `logRequest` manually for routes that need custom handling.
 */

import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { auth } from "@/lib/auth";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Generate a compact request ID (timestamp + random suffix).
 */
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract route path from request URL, stripping query params.
 */
function getRoute(request: NextRequest): string {
  const url = new URL(request.url);
  return url.pathname;
}

/**
 * Log a completed API request with timing and context.
 */
export function logRequest(
  request: NextRequest,
  response: NextResponse,
  durationMs: number,
  context?: { userId?: string; organizationId?: string; requestId?: string }
): void {
  const route = getRoute(request);
  const status = response.status;
  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  log[level]("API request", {
    requestId: context?.requestId,
    method: request.method,
    route,
    status,
    durationMs,
    userId: context?.userId,
    organizationId: context?.organizationId,
    userAgent: request.headers.get("user-agent") || undefined,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
  });
}

/**
 * Higher-order function that wraps an API route handler with request logging.
 * Adds a request ID header to the response and logs timing + user context.
 */
export function withRequestLogging(
  handler: (request: NextRequest, context?: unknown) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: unknown): Promise<NextResponse> => {
    const requestId = request.headers.get(REQUEST_ID_HEADER) || generateRequestId();
    const start = Date.now();

    let response: NextResponse;
    try {
      response = await handler(request, context);
    } catch (err) {
      const durationMs = Date.now() - start;
      log.error("API request failed", {
        requestId,
        method: request.method,
        route: getRoute(request),
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const durationMs = Date.now() - start;

    // Try to extract user context from session (non-blocking)
    let userId: string | undefined;
    let organizationId: string | undefined;
    try {
      const session = await auth();
      userId = session?.user?.id;
      organizationId = session?.user?.organizationId;
    } catch {
      // Session extraction is best-effort for logging
    }

    logRequest(request, response, durationMs, {
      requestId,
      userId,
      organizationId,
    });

    // Add request ID to response headers for traceability
    response.headers.set(REQUEST_ID_HEADER, requestId);

    return response;
  };
}
