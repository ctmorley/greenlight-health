import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { revokeAllTokens } from "@/lib/auth-tokens";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

/**
 * POST /api/auth/change-password
 *
 * Authenticated endpoint for changing the current user's password.
 * Also clears mustChangePassword flag.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.auth);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isValid = await compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const passwordHash = await hash(newPassword, 12);

    // Atomic: update password + revoke all tokens in one transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
      });
      await revokeAllTokens(session.user.id, tx);
    });

    return NextResponse.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
