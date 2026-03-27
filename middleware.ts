import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Route protection is handled entirely by the `authorized` callback in auth.config.ts.
// The middleware matcher ensures it only runs on /app/* routes.
export default auth;

export const config = {
  matcher: ["/app/:path*"],
};
