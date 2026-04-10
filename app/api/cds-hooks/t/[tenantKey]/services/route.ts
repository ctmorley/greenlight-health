import { NextRequest, NextResponse } from "next/server";
import type { CdsService } from "@/lib/cds-hooks/types";
import { resolveOrgFromTenantKey } from "@/lib/cds-tenant-key";

/**
 * GET /api/cds-hooks/t/{tenantKey}/services
 *
 * Tenant-scoped CDS Hooks Discovery Endpoint (per CDS Hooks v2.0 spec).
 * Returns the catalog of CDS services scoped to the tenant's organization.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantKey: string }> }
) {
  const { tenantKey } = await params;

  // Validate tenant key exists (don't expose services for invalid tenants)
  const resolved = await resolveOrgFromTenantKey(tenantKey);
  if (!resolved) {
    return NextResponse.json(
      { services: [] },
      { headers: corsHeaders() }
    );
  }

  const basePath = `/api/cds-hooks/t/${tenantKey}/services`;

  const services: CdsService[] = [
    {
      hook: "order-sign",
      title: "GreenLight Prior Authorization Check",
      description:
        "Checks whether the signed order requires prior authorization based on payer rules, " +
        "ACR Appropriateness Criteria, and historical denial patterns. Returns PA requirement " +
        "status, clinical appropriateness rating, and documentation requirements.",
      id: "greenlight-pa-check",
      prefetch: {
        patient: "Patient/{{context.patientId}}",
        coverage: "Coverage?patient={{context.patientId}}&status=active",
        conditions: "Condition?patient={{context.patientId}}&clinical-status=active",
      },
      usageRequirements:
        "Requires patient context. Best results when Coverage (insurance) data is available.",
    },
    {
      hook: "appointment-book",
      title: "GreenLight Appointment PA Check",
      description:
        "Checks whether a scheduled procedure requires prior authorization before the " +
        "appointment is confirmed. Prevents scheduling denials by catching missing PAs early.",
      id: "greenlight-appointment-check",
      prefetch: {
        patient: "Patient/{{context.patientId}}",
        coverage: "Coverage?patient={{context.patientId}}&status=active",
      },
      usageRequirements:
        "Requires patient context and appointment details including service type.",
    },
  ];

  // The CDS Hooks spec doesn't include endpoint URLs in the service descriptor —
  // the EHR constructs them from the discovery URL + service id. Logging the
  // basePath here for operational visibility.
  void basePath;

  return NextResponse.json(
    { services },
    { headers: corsHeaders() }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
