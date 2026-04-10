import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Middleware handles:
 * 1. Auth + route protection for /app/* (via NextAuth authorized callback)
 * 2. Request ID injection for /api/* (x-request-id header for traceability)
 */
function injectRequestId(request: NextRequest): NextResponse {
  const requestId = request.headers.get("x-request-id")
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export default async function middleware(request: NextRequest) {
  // API routes: inject request ID only (no auth middleware needed)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return injectRequestId(request);
  }

  // App routes: auth + route protection
  // @ts-expect-error - NextAuth middleware typing doesn't match NextRequest exactly
  return auth(request);
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
