/**
 * Test helpers for creating NextRequest objects and invoking route handlers.
 */
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { auth } from "@/lib/auth";

const BASE_URL = "http://localhost:3000";

/**
 * Configure the auth() mock to return the given session.
 * Call with null to simulate unauthenticated requests.
 */
export function mockSession(session: {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId: string;
    organizationName: string;
  };
  expires?: string;
} | null) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue(session);
}

/**
 * Create a GET NextRequest.
 */
export function createGetRequest(
  path: string,
  queryParams?: Record<string, string>
): NextRequest {
  const url = new URL(path, BASE_URL);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
}

/**
 * Create a POST NextRequest with JSON body.
 */
export function createPostRequest(
  path: string,
  body?: unknown
): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Create a PATCH NextRequest with JSON body.
 */
export function createPatchRequest(
  path: string,
  body?: unknown
): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Create a PUT NextRequest with JSON body.
 */
export function createPutRequest(
  path: string,
  body?: unknown
): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Create a DELETE NextRequest.
 */
export function createDeleteRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });
}

/**
 * Helper to create params object for dynamic routes.
 * Next.js App Router passes params as a Promise.
 */
export function createParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

/**
 * Parse the JSON body from a Response.
 */
export async function parseResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
