import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { findValidToken, consumeToken, revokeAllTokens } from "@/lib/auth-tokens";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * POST /api/auth/reset-password
 *
 * Accepts a token (from invite or reset email) and a new password.
 * Verifies the token, sets the password, and clears mustChangePassword.
 * Works for both invite tokens (first-time setup) and reset tokens.
 *
 * Token consume, password update, and token revocation all happen inside
 * a single transaction — if any step fails, nothing is committed and the
 * token is not burned.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.auth);
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Quick check: does a valid token exist? (non-consuming lookup)
    let tokenType: "reset" | "invite" | null = null;
    let userId = await findValidToken(token, "reset");
    if (userId) {
      tokenType = "reset";
    } else {
      userId = await findValidToken(token, "invite");
      if (userId) tokenType = "invite";
    }

    if (!userId || !tokenType) {
      return NextResponse.json(
        { error: "Invalid or expired token. Please request a new link." },
        { status: 400 }
      );
    }

    // Hash password before the transaction (CPU-bound, not a DB op)
    const passwordHash = await hash(password, 12);

    // Atomic: consume token + update password + revoke all other tokens
    await prisma.$transaction(async (tx) => {
      const consumed = await consumeToken(token, tokenType!, tx);
      if (!consumed) {
        throw new Error("TOKEN_ALREADY_CONSUMED");
      }

      await tx.user.update({
        where: { id: userId! },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
      });

      await revokeAllTokens(userId!, tx);
    });

    return NextResponse.json({ message: "Password set successfully." });
  } catch (error) {
    if (error instanceof Error && error.message === "TOKEN_ALREADY_CONSUMED") {
      return NextResponse.json(
        { error: "This link is no longer valid. It may have been used or expired. Please request a new one." },
        { status: 400 }
      );
    }
    log.error("Reset password error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
