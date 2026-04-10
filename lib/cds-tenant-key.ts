/**
 * CDS Hooks Tenant Key Utilities
 *
 * Resolves organization identity for CDS Hooks endpoints.
 *
 * Primary: opaque cdsTenantKey embedded in the endpoint URL.
 * Fallback: fhirServer → EhrConnection lookup (accepted only when
 *   exactly one active org matches).
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Generate an opaque, URL-safe tenant key (16 random bytes → 22 chars).
 * Long-lived routing key, not a secret — stored as plaintext.
 */
export function generateCdsTenantKey(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * Resolve organization from a cdsTenantKey.
 * Returns the organizationId or null if no match.
 */
export async function resolveOrgFromTenantKey(
  tenantKey: string
): Promise<{ organizationId: string } | null> {
  const org = await prisma.organization.findUnique({
    where: { cdsTenantKey: tenantKey },
    select: { id: true },
  });

  return org ? { organizationId: org.id } : null;
}

/**
 * Fallback: resolve organization from the CDS Hook request's fhirServer field.
 * Queries EhrConnection where fhirBaseUrl matches and connection is active.
 *
 * Accepts ONLY if exactly one organization matches — if zero or multiple
 * orgs share the same fhirBaseUrl, returns null (ambiguous).
 */
export async function resolveOrgFromFhirServer(
  fhirServer: string
): Promise<{ organizationId: string } | null> {
  const connections = await prisma.ehrConnection.findMany({
    where: {
      fhirBaseUrl: fhirServer,
      isActive: true,
    },
    select: { organizationId: true },
    distinct: ["organizationId"],
    take: 2, // Only need to know if there's more than one
  });

  if (connections.length !== 1) {
    return null;
  }

  return { organizationId: connections[0].organizationId };
}

/**
 * Combined resolution: try tenantKey first, then fhirServer fallback.
 * Returns organizationId and which method resolved it, or null.
 */
export async function resolveCdsOrganization(
  tenantKey: string | null,
  fhirServer: string | null | undefined
): Promise<{ organizationId: string; resolvedVia: "tenantKey" | "fhirServer" } | null> {
  if (tenantKey) {
    const result = await resolveOrgFromTenantKey(tenantKey);
    if (result) {
      return { ...result, resolvedVia: "tenantKey" };
    }
  }

  if (fhirServer) {
    const result = await resolveOrgFromFhirServer(fhirServer);
    if (result) {
      return { ...result, resolvedVia: "fhirServer" };
    }
  }

  return null;
}
