import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendResetEmail } from "@/lib/auth-email";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const schema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/forgot-password
 *
 * Always returns the same 200 response whether the email exists or not,
 * to prevent email enumeration. Rate-limited.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.auth);
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      // Still return 200 to prevent enumeration via validation errors
      return NextResponse.json({
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const email = parsed.data.email.trim().toLowerCase();

    // Look up user — but always return the same response
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, isActive: true },
    });

    if (user && user.isActive) {
      const token = await createAuthToken(user.id, "reset");
      // Best-effort email — don't leak success/failure
      sendResetEmail(email, user.firstName, token).catch(() => {});
    }

    return NextResponse.json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    // Even on error, return the same response to prevent information leakage
    return NextResponse.json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  }
}
