import type { NextAuthConfig } from "next-auth";
import "@/lib/auth-types";

/**
 * Auth configuration shared between middleware (Edge) and server (Node.js).
 * Does NOT import Prisma or bcryptjs to stay Edge-compatible.
 */
export const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/app/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role ?? "";
        token.organizationId = user.organizationId ?? "";
        token.organizationName = user.organizationName ?? "";
        token.mustChangePassword = user.mustChangePassword ?? false;
      }
      // When session.update() is called from the client, merge updated fields
      if (trigger === "update" && session) {
        if (session.organizationName) {
          token.organizationName = session.organizationName;
        }
        if (session.mustChangePassword !== undefined) {
          token.mustChangePassword = session.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId;
        session.user.organizationName = token.organizationName;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth;

      // Auth pages: redirect to dashboard if already authenticated
      if (pathname === "/app/login" || pathname === "/app/register") {
        if (isLoggedIn) {
          return Response.redirect(new URL("/app/dashboard", request.nextUrl.origin));
        }
        return true;
      }

      // Public auth pages (no login required)
      if (pathname === "/app/set-password" || pathname === "/app/forgot-password") {
        return true;
      }

      // The change-password page is allowed even with mustChangePassword
      if (pathname === "/app/change-password") {
        return isLoggedIn;
      }

      // All other /app/* routes require authentication
      if (pathname.startsWith("/app")) {
        if (!isLoggedIn) return false;

        // Enforce password change — redirect to change-password page
        if (auth?.user?.mustChangePassword) {
          return Response.redirect(new URL("/app/change-password", request.nextUrl.origin));
        }

        return true;
      }

      return true;
    },
  },
  providers: [], // Providers added in full auth.ts (Node.js only)
};
