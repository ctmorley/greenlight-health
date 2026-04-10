import { NextRequest, NextResponse } from "next/server";
import type { CdsHookRequest, CdsHookResponse } from "@/lib/cds-hooks/types";
import { checkPaRequirement } from "@/lib/cds-hooks/pa-check";
import { buildPaCards } from "@/lib/cds-hooks/card-builder";
import { resolveOrgFromTenantKey } from "@/lib/cds-tenant-key";
import { log } from "@/lib/logger";

/**
 * POST /api/cds-hooks/t/{tenantKey}/services/greenlight-appointment-check
 *
 * Tenant-scoped CDS Hooks appointment-book service endpoint.
 * Requires a valid tenantKey — no fallback. Rotating the key
 * deterministically invalidates all previously configured URLs.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantKey: string }> }
) {
  try {
    const { tenantKey } = await params;
    const hookRequest: CdsHookRequest = await request.json();

    if (hookRequest.hook !== "appointment-book") {
      return NextResponse.json(
        { cards: [] } satisfies CdsHookResponse,
        { headers: corsHeaders() }
      );
    }

    // Resolve organization — tenantKey only, no fallback
    const resolved = await resolveOrgFromTenantKey(tenantKey);

    if (!resolved) {
      log.warn("[CDS Hooks] Invalid tenant key", { tenantKey });
      return NextResponse.json(
        { cards: [] } satisfies CdsHookResponse,
        { headers: corsHeaders() }
      );
    }

    const { organizationId } = resolved;

    // Extract appointment context
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

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://greenlight-health.vercel.app";
    const cards = buildPaCards(result, `${appUrl}/launch`, organizationId);

    return NextResponse.json(
      { cards } satisfies CdsHookResponse,
      { headers: corsHeaders() }
    );
  } catch (error) {
    log.error("CDS Hook appointment-book error", { error: error instanceof Error ? error.message : String(error) });
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

function extractAppointmentContext(
  hookRequest: CdsHookRequest
): AppointmentContext {
  const cptCodes: string[] = [];
  const icd10Codes: string[] = [];
  let payerName: string | null = null;
  let serviceCategory: string | null = null;

  const appointments = hookRequest.context?.appointments as
    | { entry?: Array<{ resource?: Record<string, unknown> }> }
    | undefined;

  if (appointments?.entry) {
    for (const entry of appointments.entry) {
      const resource = entry.resource;
      if (!resource || resource.resourceType !== "Appointment") continue;

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

  const serviceRequest = hookRequest.context?.serviceRequest as
    | {
        code?: { coding?: Array<{ system?: string; code?: string }> };
        reasonCode?: Array<{
          coding?: Array<{ system?: string; code?: string }>;
        }>;
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
