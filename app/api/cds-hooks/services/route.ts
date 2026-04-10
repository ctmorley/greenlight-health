import { NextResponse } from "next/server";

/**
 * GET /api/cds-hooks/services
 *
 * DEPRECATED — Legacy unscoped CDS Hooks Discovery Endpoint.
 *
 * New integrations MUST use the tenant-scoped path:
 *   GET /api/cds-hooks/t/{tenantKey}/services
 *
 * This endpoint returns an empty service list to prevent new EHR
 * configurations from onboarding onto the unscoped (tenantless) path.
 * Existing integrations using the legacy hook POST endpoints will
 * continue to work with best-effort fhirServer resolution until
 * they are migrated.
 */

export async function GET() {
  console.warn(
    "[CDS Hooks] Discovery request to deprecated unscoped endpoint. " +
      "New integrations must use /api/cds-hooks/t/{tenantKey}/services."
  );

  return NextResponse.json(
    {
      services: [],
      _deprecated:
        "This endpoint is deprecated. Use /api/cds-hooks/t/{tenantKey}/services for tenant-scoped discovery.",
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "X-GreenLight-Deprecated": "Use /api/cds-hooks/t/{tenantKey}/services",
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
