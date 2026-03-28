import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { audit } from "@/lib/security/audit-log";

// In-memory rate limiter for login attempts (per email).
//
// Production note: For multi-instance deployments, replace with a
// Redis/Upstash-backed store using key TTLs to avoid cross-instance
// bypass and per-process memory overhead.
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_STORE_SIZE = 5000;

// Periodic cleanup of expired entries every 60 seconds to bound memory usage.
// This prevents unbounded growth even under sustained brute-force traffic.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, 60 * 1000);
// Allow Node to exit cleanly without waiting for the cleanup timer
if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
  cleanupTimer.unref();
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).trim().toLowerCase();
        const password = credentials.password as string;

        // Rate limiting: max 5 failed attempts per email per 15-minute window
        const now = Date.now();
        const windowMs = LOGIN_WINDOW_MS;
        const maxAttempts = 5;
        const key = email;
        const entry = loginAttempts.get(key);

        if (entry) {
          // Clean up expired entries
          if (now - entry.windowStart > windowMs) {
            loginAttempts.delete(key);
          } else if (entry.count >= maxAttempts) {
            return null;
          }
        }

        // Guard against unbounded store growth: evict expired entries first,
        // then if still over the cap, evict oldest entries by window start.
        if (loginAttempts.size > LOGIN_MAX_STORE_SIZE) {
          // First pass: remove all expired entries
          for (const [k, v] of loginAttempts) {
            if (now - v.windowStart > windowMs) loginAttempts.delete(k);
          }
          // Second pass: if still over cap, evict oldest half
          if (loginAttempts.size > LOGIN_MAX_STORE_SIZE) {
            const oldest = [...loginAttempts.entries()].sort(
              (a, b) => a[1].windowStart - b[1].windowStart
            );
            const evictCount = Math.ceil(oldest.length / 2);
            for (let i = 0; i < evictCount; i++) {
              loginAttempts.delete(oldest[i][0]);
            }
          }
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            include: { organization: true },
          });

          if (!user || !user.isActive) {
            recordFailedAttempt(key, now, windowMs);
            audit({
              action: "login_failed",
              resourceType: "User",
              userEmail: email,
              description: !user ? "Failed login attempt — user not found" : "Failed login attempt — inactive user",
            }).catch(() => {});
            return null;
          }

          const isPasswordValid = await compare(password, user.passwordHash);
          if (!isPasswordValid) {
            recordFailedAttempt(key, now, windowMs);
            audit({
              action: "login_failed",
              resourceType: "User",
              resourceId: user.id,
              userEmail: email,
              description: "Failed login attempt — wrong password",
            }).catch(() => {});
            return null;
          }

          // Clear rate limit on successful login
          loginAttempts.delete(key);

          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          audit({
            action: "login",
            resourceType: "User",
            resourceId: user.id,
            userEmail: email,
            description: "Successful login",
          }).catch(() => {});

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role,
            organizationId: user.organizationId,
            organizationName: user.organization.name,
          };
        } catch (error) {
          console.error("Authentication error (database may be unavailable):", error);
          throw new Error("SERVICE_UNAVAILABLE", { cause: error });
        }
      },
    }),
  ],
});

/** Record a failed login attempt for rate limiting. */
function recordFailedAttempt(key: string, now: number, windowMs: number) {
  const existing = loginAttempts.get(key);
  if (existing && now - existing.windowStart <= windowMs) {
    existing.count += 1;
  } else {
    loginAttempts.set(key, { count: 1, windowStart: now });
  }
}
