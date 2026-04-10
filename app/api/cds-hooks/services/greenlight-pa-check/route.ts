import { NextRequest, NextResponse } from "next/server";
import type { CdsHookRequest, CdsHookResponse } from "@/lib/cds-hooks/types";
import { checkPaRequirement } from "@/lib/cds-hooks/pa-check";
import { buildPaCards } from "@/lib/cds-hooks/card-builder";
import { resolveOrgFromFhirServer } from "@/lib/cds-tenant-key";

/**
 * POST /api/cds-hooks/services/greenlight-pa-check
 *
 * LEGACY unscoped CDS Hooks order-sign endpoint.
 * Prefer the tenant-scoped path: /api/cds-hooks/t/{tenantKey}/services/greenlight-pa-check
 *
 * This endpoint attempts best-effort org resolution via fhirServer.
 * If no org resolves, it still returns results (backward compat) but
 * without org-scoped payer filtering.
 */

export async function POST(request: NextRequest) {
  try {
    const hookRequest: CdsHookRequest = await request.json();

    if (hookRequest.hook !== "order-sign") {
      return NextResponse.json(
        { cards: [], systemActions: [] },
        { status: 200, headers: corsHeaders() }
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
          "Migrate to /api/cds-hooks/t/{tenantKey}/services/greenlight-pa-check. " +
          `fhirServer=${hookRequest.fhirServer ?? "none"}`
      );
    }

    const { cptCodes, icd10Codes, payerName, serviceCategory } =
      extractOrderContext(hookRequest);

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
    console.error("CDS Hook order-sign error:", error);
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

interface OrderContext {
  cptCodes: string[];
  icd10Codes: string[];
  payerName: string | null;
  serviceCategory: string | null;
}

function extractOrderContext(hookRequest: CdsHookRequest): OrderContext {
  const cptCodes: string[] = [];
  const icd10Codes: string[] = [];
  let payerName: string | null = null;
  let serviceCategory: string | null = null;

  // Extract from context.draftOrders (FHIR Bundle of unsigned orders)
  const draftOrders = hookRequest.context?.draftOrders as
    | { entry?: Array<{ resource?: Record<string, unknown> }> }
    | undefined;

  if (draftOrders?.entry) {
    for (const entry of draftOrders.entry) {
      const resource = entry.resource;
      if (!resource) continue;

      if (resource.resourceType === "ServiceRequest") {
        // Extract CPT codes
        const code = resource.code as
          | { coding?: Array<{ system?: string; code?: string }> }
          | undefined;

        if (code?.coding) {
          for (const c of code.coding) {
            if (
              c.code &&
              (c.system === "http://www.ama-assn.org/go/cpt" ||
                c.system === "urn:oid:2.16.840.1.113883.6.12")
            ) {
              cptCodes.push(c.code);
            }
          }
        }

        // Extract ICD-10 from reasonCode
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
  }

  // Extract payer from prefetch.coverage
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

  // Detect service category from CPT codes
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
