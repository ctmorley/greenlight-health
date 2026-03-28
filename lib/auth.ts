import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { audit } from "@/lib/security/audit-log";

// In-memory rate limiter for login attempts (per email)
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

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
        const windowMs = 15 * 60 * 1000;
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
