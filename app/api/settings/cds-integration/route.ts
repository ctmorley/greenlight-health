import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateCdsTenantKey } from "@/lib/cds-tenant-key";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * GET /api/settings/cds-integration
 *
 * Returns the current CDS Hooks tenant key and constructed endpoint URLs
 * for the organization. Admin only.
 */
export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage CDS integration" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { cdsTenantKey: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenlight-health.vercel.app";
  const tenantKey = org?.cdsTenantKey;

  return NextResponse.json({
    cdsTenantKey: tenantKey,
    endpoints: tenantKey
      ? {
          discovery: `${appUrl}/api/cds-hooks/t/${tenantKey}/services`,
          orderSign: `${appUrl}/api/cds-hooks/t/${tenantKey}/services/greenlight-pa-check`,
          appointmentBook: `${appUrl}/api/cds-hooks/t/${tenantKey}/services/greenlight-appointment-check`,
        }
      : null,
  });
}

/**
 * POST /api/settings/cds-integration
 *
 * Generate (or rotate) the CDS Hooks tenant key for the organization.
 * Rotating the key invalidates all previously configured EHR CDS Hook URLs.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage CDS integration" }, { status: 403 });
  }

  const newKey = generateCdsTenantKey();

  await prisma.organization.update({
    where: { id: organizationId },
    data: { cdsTenantKey: newKey },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenlight-health.vercel.app";

  return NextResponse.json({
    cdsTenantKey: newKey,
    endpoints: {
      discovery: `${appUrl}/api/cds-hooks/t/${newKey}/services`,
      orderSign: `${appUrl}/api/cds-hooks/t/${newKey}/services/greenlight-pa-check`,
      appointmentBook: `${appUrl}/api/cds-hooks/t/${newKey}/services/greenlight-appointment-check`,
    },
  });
}
