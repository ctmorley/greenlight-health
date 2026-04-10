/**
 * Auth Token Utilities
 *
 * Handles invite and password-reset tokens. Tokens are stored as SHA-256
 * hashes in the database — the plain token is only returned once at creation
 * time and sent to the user via email.
 *
 * Security properties:
 * - Token is 32 random bytes (256 bits of entropy), URL-safe base64 encoded
 * - DB stores SHA-256 hash only — DB compromise doesn't leak usable tokens
 * - Single-use: consumed atomically via updateMany (race-safe)
 * - Short-lived: 24h for invite, 1h for reset
 * - Issuing a new token invalidates all prior active tokens for that user+type
 * - Any successful password change revokes ALL active tokens for the user
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { AuthTokenType } from "@prisma/client";

const TOKEN_EXPIRY: Record<AuthTokenType, number> = {
  invite: 24 * 60 * 60 * 1000, // 24 hours
  reset: 60 * 60 * 1000, // 1 hour
};

function hashToken(plainToken: string): string {
  return crypto.createHash("sha256").update(plainToken).digest("hex");
}

/**
 * Create an auth token for the given user.
 * Invalidates all prior active tokens for the same user+type.
 * Returns the plain token (to be sent via email — never stored).
 */
export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
): Promise<string> {
  const plainToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY[type]);

  // Invalidate all prior active tokens for this user+type
  await prisma.authToken.updateMany({
    where: {
      userId,
      type,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  await prisma.authToken.create({
    data: {
      userId,
      tokenHash,
      type,
      expiresAt,
    },
  });

  return plainToken;
}

/**
 * Look up a token without consuming it. Returns the userId if valid, null otherwise.
 * Used to check validity before starting a transaction that will consume it.
 */
export async function findValidToken(
  plainToken: string,
  type: AuthTokenType,
): Promise<string | null> {
  const tokenHash = hashToken(plainToken);

  const token = await prisma.authToken.findFirst({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { userId: true },
  });

  return token?.userId ?? null;
}

/**
 * Consume a token inside a transaction. Atomically marks it as used via updateMany
 * so concurrent requests cannot both succeed. Returns true if consumed, false if
 * the token was already used or expired.
 *
 * Call this inside a $transaction alongside the password update so that if the
 * transaction rolls back, the token is not burned.
 */
export async function consumeToken(
  plainToken: string,
  type: AuthTokenType,
  tx: { authToken: typeof prisma.authToken },
): Promise<boolean> {
  const tokenHash = hashToken(plainToken);
  const now = new Date();

  const result = await tx.authToken.updateMany({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      usedAt: now,
    },
  });

  return result.count > 0;
}

/**
 * Verify and consume a token atomically (standalone, outside a transaction).
 * Returns the userId if valid, null otherwise.
 *
 * For password-change flows, prefer findValidToken + consumeToken inside a
 * $transaction to avoid burning the token if a subsequent write fails.
 */
export async function verifyAuthToken(
  plainToken: string,
  type: AuthTokenType,
): Promise<string | null> {
  const tokenHash = hashToken(plainToken);
  const now = new Date();

  const result = await prisma.authToken.updateMany({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      usedAt: now,
    },
  });

  if (result.count === 0) return null;

  const token = await prisma.authToken.findFirst({
    where: { tokenHash, type },
    select: { userId: true },
  });

  return token?.userId ?? null;
}

/**
 * Revoke ALL active auth tokens for a user (both invite and reset).
 * Call this after any successful password change to ensure no outstanding
 * tokens remain usable.
 *
 * Accepts an optional transaction client so it can be called inside a
 * $transaction alongside the password update — ensuring atomicity.
 */
export async function revokeAllTokens(
  userId: string,
  tx?: { authToken: typeof prisma.authToken },
): Promise<void> {
  const client = tx || prisma;
  await client.authToken.updateMany({
    where: {
      userId,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
}
