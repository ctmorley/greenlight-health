import { NextRequest, NextResponse } from "next/server";
import type { CdsHookRequest, CdsHookResponse } from "@/lib/cds-hooks/types";
import { checkPaRequirement } from "@/lib/cds-hooks/pa-check";
import { buildPaCards } from "@/lib/cds-hooks/card-builder";
import { resolveOrgFromFhirServer } from "@/lib/cds-tenant-key";

/**
 * POST /api/cds-hooks/services/greenlight-appointment-check
 *
 * LEGACY unscoped CDS Hooks appointment-book endpoint.
 * Prefer the tenant-scoped path: /api/cds-hooks/t/{tenantKey}/services/greenlight-appointment-check
 *
 * This endpoint attempts best-effort org resolution via fhirServer.
 * If no org resolves, it still returns results (backward compat) but
 * without org-scoped payer filtering.
 */

export async function POST(request: NextRequest) {
  try {
    const hookRequest: CdsHookRequest = await request.json();

    if (hookRequest.hook !== "appointment-book") {
      return NextResponse.json(
        { cards: [] } satisfies CdsHookResponse,
        { headers: corsHeaders() }
      );
    }

    // Best-effort org resolution via fhirServer
    let organizationId: string | undefined;
    if (hookRequest.fhirServer) {
      const resolved = await resolveOrgFromFhirServer(hookRequest.fhirServer);
      if (resolved) {
        organizationId = resolved.organizationId;
      }
    }

    if (!organizationId) {
      console.warn(
        "[CDS Hooks] Unscoped request to legacy endpoint. " +
          "Migrate to /api/cds-hooks/t/{tenantKey}/services/greenlight-appointment-check. " +
          `fhirServer=${hookRequest.fhirServer ?? "none"}`
      );
    }

    const { cptCodes, icd10Codes, payerName, serviceCategory } =
      extractAppointmentContext(hookRequest);

    if (cptCodes.length === 0) {
      return NextResponse.json(
        { cards: [] } satisfies CdsHookResponse,
        { headers: corsHeaders() }
      );
    }

    const result = await checkPaRequirement({
      cptCodes,
      icd10Codes,
      payerName,
      serviceCategory,
      organizationId,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenlight-health.vercel.app";
    const cards = buildPaCards(result, `${appUrl}/launch`, organizationId);

    const headers: Record<string, string> = corsHeaders();
    if (!organizationId) {
      headers["X-GreenLight-Tenant"] = "unresolved";
    }

    return NextResponse.json(
      { cards } satisfies CdsHookResponse,
      { headers }
    );
  } catch (error) {
    console.error("CDS Hook appointment-book error:", error);
    return NextResponse.json(
      { cards: [] } satisfies CdsHookResponse,
      { headers: corsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ─── Context Extraction ──────────────────────────────────────

interface AppointmentContext {
  cptCodes: string[];
  icd10Codes: string[];
  payerName: string | null;
  serviceCategory: string | null;
}

function extractAppointmentContext(hookRequest: CdsHookRequest): AppointmentContext {
  const cptCodes: string[] = [];
  const icd10Codes: string[] = [];
  let payerName: string | null = null;
  let serviceCategory: string | null = null;

  // Extract from context.appointments (FHIR Bundle of draft appointments)
  const appointments = hookRequest.context?.appointments as
    | { entry?: Array<{ resource?: Record<string, unknown> }> }
    | undefined;

  if (appointments?.entry) {
    for (const entry of appointments.entry) {
      const resource = entry.resource;
      if (!resource || resource.resourceType !== "Appointment") continue;

      // Extract service type from Appointment.serviceType
      const serviceTypes = resource.serviceType as
        | Array<{ coding?: Array<{ system?: string; code?: string }> }>
        | undefined;

      if (serviceTypes) {
        for (const st of serviceTypes) {
          if (st.coding) {
            for (const c of st.coding) {
              if (
                c.code &&
                (c.system === "http://www.ama-assn.org/go/cpt" ||
                  c.system === "urn:oid:2.16.840.1.113883.6.12")
              ) {
                cptCodes.push(c.code);
              }
            }
          }
        }
      }

      // Extract reason codes
      const reasonCodes = resource.reasonCode as
        | Array<{ coding?: Array<{ system?: string; code?: string }> }>
        | undefined;

      if (reasonCodes) {
        for (const rc of reasonCodes) {
          if (rc.coding) {
            for (const c of rc.coding) {
              if (
                c.code &&
                (c.system === "http://hl7.org/fhir/sid/icd-10-cm" ||
                  c.system === "http://hl7.org/fhir/sid/icd-10")
              ) {
                icd10Codes.push(c.code);
              }
            }
          }
        }
      }
    }
  }

  // Also check context for ServiceRequest references
  const serviceRequest = hookRequest.context?.serviceRequest as
    | {
        code?: { coding?: Array<{ system?: string; code?: string }> };
        reasonCode?: Array<{ coding?: Array<{ system?: string; code?: string }> }>;
      }
    | undefined;

  if (serviceRequest?.code?.coding) {
    for (const c of serviceRequest.code.coding) {
      if (
        c.code &&
        (c.system === "http://www.ama-assn.org/go/cpt" ||
          c.system === "urn:oid:2.16.840.1.113883.6.12") &&
        !cptCodes.includes(c.code)
      ) {
        cptCodes.push(c.code);
      }
    }
  }

  // Extract payer from prefetch
  const coverage = hookRequest.prefetch?.coverage as
    | {
        entry?: Array<{
          resource?: { payor?: Array<{ display?: string }> };
        }>;
      }
    | undefined;

  if (coverage?.entry?.[0]?.resource?.payor?.[0]?.display) {
    payerName = coverage.entry[0].resource.payor[0].display;
  }

  // Detect service category
  if (cptCodes.length > 0) {
    const num = parseInt(cptCodes[0], 10);
    if (!isNaN(num)) {
      if (num >= 70010 && num <= 79999) serviceCategory = "imaging";
      else if (num >= 10004 && num <= 69990) serviceCategory = "surgical";
    }
  }

  return { cptCodes, icd10Codes, payerName, serviceCategory };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
