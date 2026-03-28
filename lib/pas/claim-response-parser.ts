/**
 * FHIR ClaimResponse Parser
 *
 * Parses a FHIR ClaimResponse from a payer's $submit response
 * and maps it to GreenLight PA status fields.
 */

export interface PasSubmissionResult {
  /** GreenLight PA status */
  status: "approved" | "denied" | "pending_review" | "partially_approved";
  /** Payer-assigned authorization number */
  authorizationNumber: string | null;
  /** Approval expiration date */
  expiresAt: string | null;
  /** Approved service units (e.g., number of visits) */
  approvedUnits: number | null;
  /** Approved CPT codes (may differ from requested for partial approvals) */
  approvedCptCodes: string[];
  /** Denial reason code */
  denialReasonCode: string | null;
  /** Denial reason description */
  denialReasonDescription: string | null;
  /** Payer notes / additional information */
  payerNotes: string | null;
  /** Raw FHIR ClaimResponse for audit trail */
  rawResponse: Record<string, unknown>;
}

/**
 * Parses a FHIR ClaimResponse resource into GreenLight-readable fields.
 */
export function parseClaimResponse(response: Record<string, unknown>): PasSubmissionResult {
  const outcome = response.outcome as string | undefined;
  const disposition = response.disposition as string | undefined;
  const preAuthRef = response.preAuthRef as string | undefined;
  const preAuthPeriod = response.preAuthPeriod as { end?: string } | undefined;

  // Map FHIR outcome to GreenLight status
  const status = mapOutcomeToStatus(outcome, response);

  // Extract authorization number
  const authorizationNumber = preAuthRef || null;

  // Extract denial reason from error or adjudication
  const { denialReasonCode, denialReasonDescription } = extractDenialReason(response);

  // Extract approved items
  const { approvedUnits, approvedCptCodes } = extractApprovedItems(response);

  return {
    status,
    authorizationNumber,
    expiresAt: preAuthPeriod?.end || null,
    approvedUnits,
    approvedCptCodes,
    denialReasonCode,
    denialReasonDescription,
    payerNotes: disposition || null,
    rawResponse: response,
  };
}

function mapOutcomeToStatus(
  outcome: string | undefined,
  response: Record<string, unknown>
): PasSubmissionResult["status"] {
  switch (outcome) {
    case "complete": {
      // Check if any items were denied (partial approval)
      const items = response.item as Array<{ adjudication?: Array<{ category?: { coding?: Array<{ code?: string }> } }> }> | undefined;
      const hasDenied = items?.some((item) =>
        item.adjudication?.some((adj) =>
          adj.category?.coding?.some((c) => c.code === "denied")
        )
      );
      return hasDenied ? "partially_approved" : "approved";
    }
    case "error":
      return "denied";
    case "partial":
      return "partially_approved";
    case "queued":
      return "pending_review";
    default:
      return "pending_review";
  }
}

function extractDenialReason(response: Record<string, unknown>): {
  denialReasonCode: string | null;
  denialReasonDescription: string | null;
} {
  // Check response.error array
  const errors = response.error as Array<{
    code?: { coding?: Array<{ code?: string; display?: string }> };
  }> | undefined;

  if (errors && errors.length > 0) {
    const firstError = errors[0];
    const coding = firstError.code?.coding?.[0];
    return {
      denialReasonCode: coding?.code || null,
      denialReasonDescription: coding?.display || null,
    };
  }

  // Check processNote for denial explanation
  const processNotes = response.processNote as Array<{ text?: string }> | undefined;
  if (processNotes && processNotes.length > 0) {
    return {
      denialReasonCode: null,
      denialReasonDescription: processNotes.map((n) => n.text).filter(Boolean).join("; "),
    };
  }

  return { denialReasonCode: null, denialReasonDescription: null };
}

function extractApprovedItems(response: Record<string, unknown>): {
  approvedUnits: number | null;
  approvedCptCodes: string[];
} {
  const items = response.item as Array<{
    itemSequence?: number;
    adjudication?: Array<{
      category?: { coding?: Array<{ code?: string }> };
      value?: number;
    }>;
  }> | undefined;

  if (!items) return { approvedUnits: null, approvedCptCodes: [] };

  let totalUnits = 0;
  const approvedCodes: string[] = [];

  // Cross-reference with the original Claim items to get CPT codes
  const addItems = response.addItem as Array<{
    productOrService?: { coding?: Array<{ code?: string }> };
    adjudication?: Array<{
      category?: { coding?: Array<{ code?: string }> };
      value?: number;
    }>;
  }> | undefined;

  if (addItems) {
    for (const item of addItems) {
      const approved = item.adjudication?.some((adj) =>
        adj.category?.coding?.some((c) => c.code === "benefit" || c.code === "submitted")
      );
      if (approved) {
        const cpt = item.productOrService?.coding?.find(
          (c) => !c.code?.startsWith("http")
        )?.code;
        if (cpt) approvedCodes.push(cpt);

        const units = item.adjudication?.find((adj) =>
          adj.category?.coding?.some((c) => c.code === "benefit")
        )?.value;
        if (units) totalUnits += units;
      }
    }
  }

  return {
    approvedUnits: totalUnits > 0 ? totalUnits : null,
    approvedCptCodes: approvedCodes,
  };
}

/**
 * Generates a simulated ClaimResponse for development/testing.
 * In production, this comes from the payer's FHIR endpoint.
 */
export function simulateClaimResponse(
  urgency: string,
  acrRating: number | null
): Record<string, unknown> {
  // Simulate based on ACR rating and urgency
  const isApproved = acrRating === null || acrRating >= 7 || urgency === "emergent";
  const isPended = !isApproved && (acrRating === null || acrRating >= 4);

  if (isApproved) {
    return {
      resourceType: "ClaimResponse",
      status: "active",
      type: { coding: [{ code: "professional" }] },
      use: "preauthorization",
      outcome: "complete",
      disposition: "Prior authorization approved.",
      preAuthRef: `AUTH-${Date.now().toString(36).toUpperCase()}`,
      preAuthPeriod: {
        start: new Date().toISOString().split("T")[0],
        end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
    };
  }

  if (isPended) {
    return {
      resourceType: "ClaimResponse",
      status: "active",
      type: { coding: [{ code: "professional" }] },
      use: "preauthorization",
      outcome: "queued",
      disposition: "Request pended for clinical review. Additional documentation may be requested.",
      processNote: [
        { text: "Request requires peer-to-peer review. Please contact the reviewer within 5 business days." },
      ],
    };
  }

  return {
    resourceType: "ClaimResponse",
    status: "active",
    type: { coding: [{ code: "professional" }] },
    use: "preauthorization",
    outcome: "error",
    disposition: "Prior authorization denied.",
    error: [
      {
        code: {
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/adjudication-error",
            code: "medical-necessity",
            display: "Does not meet medical necessity criteria. ACR Appropriateness Criteria rating below payer threshold.",
          }],
        },
      },
    ],
    processNote: [
      { text: "The requested service does not meet medical necessity criteria based on the clinical information provided. You may appeal this decision within 30 days." },
    ],
  };
}
