import { NextResponse } from "next/server";
import type { CdsService } from "@/lib/cds-hooks/types";

/**
 * GET /api/cds-hooks/services
 *
 * CDS Hooks Discovery Endpoint (per CDS Hooks v2.0 spec).
 * Returns the catalog of CDS services that GreenLight offers.
 *
 * EHR systems call this endpoint to discover what hooks are available.
 */

const SERVICES: CdsService[] = [
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

export async function GET() {
  // CDS Hooks spec requires the response to have a "services" key
  return NextResponse.json(
    { services: SERVICES },
    {
      headers: {
        "Content-Type": "application/json",
        // CORS headers required for cross-origin EHR calls
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
