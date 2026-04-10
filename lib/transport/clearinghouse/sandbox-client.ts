/**
 * Sandbox Clearinghouse Client
 *
 * Simulates clearinghouse behavior for dev/testing without a live account.
 * Intentionally stricter than a real clearinghouse — validates required fields
 * aggressively to catch integration bugs early.
 *
 * Response determination is deterministic (based on CPT code hash), not random,
 * so tests are repeatable.
 */

import type {
  ClearinghouseClient,
  ClearinghouseSubmitRequest,
  ClearinghouseSubmitResponse,
  ClearinghouseStatusRequest,
  ClearinghouseStatusResponse,
} from "./types";

// In-memory tracking for status checks within the same process
const submissionStore = new Map<
  string,
  { status: string; authNumber?: string; expiresAt?: string }
>();

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function determinePayout(
  request: ClearinghouseSubmitRequest
): "approved" | "denied" | "pending" {
  // Emergent → always approved
  if (request.service.urgency === "emergent") return "approved";

  // No CPT codes → pending (needs manual review)
  if (request.service.cptCodes.length === 0) return "pending";

  // Deterministic based on first CPT code
  const cpt = request.service.cptCodes[0];
  const hash = hashCode(cpt) % 10;

  // Imaging CPTs (start with "7"): 80% approved, 10% pended, 10% denied
  if (cpt.startsWith("7")) {
    if (hash < 8) return "approved";
    if (hash < 9) return "pending";
    return "denied";
  }

  // Other CPTs: 60% approved, 30% pending, 10% denied
  if (hash < 6) return "approved";
  if (hash < 9) return "pending";
  return "denied";
}

function validateRequest(request: ClearinghouseSubmitRequest): string[] {
  const errors: string[] = [];

  if (!request.clearinghousePayerId) {
    errors.push("clearinghousePayerId is required");
  }
  if (!request.patient.firstName) {
    errors.push("patient.firstName is required");
  }
  if (!request.patient.lastName) {
    errors.push("patient.lastName is required");
  }
  if (!request.patient.dateOfBirth) {
    errors.push("patient.dateOfBirth is required");
  }
  if (!request.patient.memberId) {
    errors.push("patient.memberId is required");
  }
  if (!request.provider.npi) {
    errors.push("provider.npi is required");
  }
  if (request.service.cptCodes.length === 0) {
    errors.push("At least one CPT code is required");
  }
  if (!request.referenceNumber) {
    errors.push("referenceNumber is required");
  }

  return errors;
}

export class SandboxClearinghouseClient implements ClearinghouseClient {
  async submit(
    request: ClearinghouseSubmitRequest
  ): Promise<ClearinghouseSubmitResponse> {
    // Simulate network latency (100-300ms, deterministic)
    const delay = 100 + (hashCode(request.referenceNumber) % 200);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Strict validation
    const validationErrors = validateRequest(request);
    if (validationErrors.length > 0) {
      return {
        accepted: false,
        trackingId: null,
        payerResponse: null,
        httpStatus: 400,
        responseCode: "VALIDATION_ERROR",
        message: `Validation failed: ${validationErrors.join("; ")}`,
        rawResponse: { errors: validationErrors },
      };
    }

    // Generate tracking ID
    const trackingId = `SBX-${Date.now().toString(36).toUpperCase()}-${hashCode(request.referenceNumber).toString(36).toUpperCase()}`;

    // Determine payer response
    const outcome = determinePayout(request);

    const expiresAt =
      outcome === "approved"
        ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0]
        : undefined;

    const authNumber =
      outcome === "approved"
        ? `AUTH-${trackingId.slice(4)}`
        : undefined;

    const payerResponse = {
      status: outcome,
      authorizationNumber: authNumber,
      responseCode: outcome === "approved" ? "A1" : outcome === "denied" ? "A2" : "A3",
      message:
        outcome === "approved"
          ? "Prior authorization approved."
          : outcome === "denied"
            ? "Does not meet medical necessity criteria."
            : "Request pended for clinical review.",
      expiresAt,
      denialReason:
        outcome === "denied"
          ? "Does not meet medical necessity criteria based on clinical information provided."
          : undefined,
    };

    // Store for status checks
    submissionStore.set(trackingId, {
      status: outcome,
      authNumber,
      expiresAt,
    });

    return {
      accepted: true,
      trackingId,
      payerResponse,
      httpStatus: 200,
      responseCode: "ACCEPTED",
      message: `Sandbox: submission ${outcome}`,
      rawResponse: {
        sandbox: true,
        trackingId,
        payerResponse,
        submittedAt: new Date().toISOString(),
      },
    };
  }

  async checkStatus(
    request: ClearinghouseStatusRequest
  ): Promise<ClearinghouseStatusResponse> {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stored = submissionStore.get(request.trackingId);
    if (!stored) {
      return {
        found: false,
        status: null,
        responseCode: null,
        message: "Tracking ID not found",
        payerResponse: null,
        rawResponse: { sandbox: true, found: false },
      };
    }

    return {
      found: true,
      status: stored.status,
      responseCode: stored.status === "approved" ? "A1" : stored.status === "denied" ? "A2" : "A3",
      message: `Sandbox status: ${stored.status}`,
      payerResponse: {
        status: stored.status as "approved" | "denied" | "pending",
        authorizationNumber: stored.authNumber,
        expiresAt: stored.expiresAt,
      },
      rawResponse: { sandbox: true, ...stored },
    };
  }
}
