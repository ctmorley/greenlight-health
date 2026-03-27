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
      }
      // When session.update() is called from the client, merge updated fields
      if (trigger === "update" && session) {
        if (session.organizationName) {
          token.organizationName = session.organizationName;
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
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth;

      // Login and register pages: redirect to dashboard if already authenticated
      if (pathname === "/app/login" || pathname === "/app/register") {
        if (isLoggedIn) {
          return Response.redirect(new URL("/app/dashboard", request.nextUrl.origin));
        }
        return true;
      }

      // All other /app/* routes require authentication
      // Returning false triggers the signIn page redirect configured above
      if (pathname.startsWith("/app")) {
        return isLoggedIn;
      }

      return true;
    },
  },
  providers: [], // Providers added in full auth.ts (Node.js only)
};
