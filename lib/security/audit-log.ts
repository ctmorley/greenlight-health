import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

/**
 * HIPAA-compliant audit logging.
 *
 * Logs all access to Protected Health Information (PHI) per
 * 45 CFR § 164.312(b) — Audit controls.
 *
 * Every API route that reads, creates, modifies, or deletes PHI
 * must call this function. The audit log is immutable (append-only)
 * and retained for a minimum of 6 years per HIPAA requirements.
 */

interface AuditEntry {
  organizationId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  description?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestPath?: string | null;
  metadata?: Record<string, unknown> | null;
  phiAccessed?: boolean;
}

/**
 * Records an audit log entry. Non-blocking — failures are logged
 * to console but never throw (must not break user-facing operations).
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId || null,
        userId: entry.userId || null,
        userEmail: entry.userEmail || null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId || null,
        description: entry.description || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        requestPath: entry.requestPath || null,
        metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : undefined,
        phiAccessed: entry.phiAccessed ?? false,
      },
    });
  } catch (err) {
    // Audit failures must not break user operations, but must be logged
    console.error("[AUDIT LOG FAILURE]", err, entry);
  }
}

/**
 * Extracts client IP and user agent from a Request object.
 */
export function extractRequestInfo(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
  requestPath: string | null;
} {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  const userAgent = request.headers.get("user-agent") || null;

  let requestPath: string | null = null;
  try {
    requestPath = new URL(request.url).pathname;
  } catch { /* ignore */ }

  return { ipAddress, userAgent, requestPath };
}

/**
 * Convenience: audit a PHI access event with request context.
 */
export async function auditPhiAccess(
  request: Request,
  session: { user: { id: string; email?: string; organizationId?: string } },
  action: AuditAction,
  resourceType: string,
  resourceId?: string | null,
  description?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  const { ipAddress, userAgent, requestPath } = extractRequestInfo(request);

  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    userEmail: session.user.email,
    action,
    resourceType,
    resourceId,
    description,
    ipAddress,
    userAgent,
    requestPath,
    metadata,
    phiAccessed: true,
  });
}
