/**
 * Enhanced Rate Limiting
 *
 * In-memory rate limiter for API endpoints. Tracks requests by IP + path.
 * Required for: HIPAA brute-force protection, SOC 2 CC6.1, HITRUST 09.ab
 *
 * Production note: Replace with Azure API Management or Redis-based
 * rate limiting for multi-instance deployments.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 15 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

/** Preset configurations for different endpoint types */
export const RATE_LIMITS = {
  /** Login/auth endpoints: 10 req / 15 min */
  auth: { limit: 10, windowSeconds: 900 } as RateLimitConfig,
  /** Standard API endpoints: 100 req / min */
  api: { limit: 100, windowSeconds: 60 } as RateLimitConfig,
  /** FHIR/EHR endpoints: 30 req / min */
  fhir: { limit: 30, windowSeconds: 60 } as RateLimitConfig,
  /** CDS Hooks (external EHR calls): 60 req / min */
  cdsHooks: { limit: 60, windowSeconds: 60 } as RateLimitConfig,
  /** PA submission: 5 req / min */
  submit: { limit: 5, windowSeconds: 60 } as RateLimitConfig,
};

/**
 * Checks rate limit for a request. Returns null if allowed,
 * or a Response object if rate limited.
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig
): Response | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  let path: string;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = "unknown";
  }

  const key = `${ip}:${path}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;

  if (entry.count > config.limit) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil((entry.windowStart + windowMs) / 1000)),
        },
      }
    );
  }

  return null;
}
