/**
 * EDI 278 Clearinghouse Transport Adapter
 *
 * Implements TransportAdapter for clearinghouse-based PA submission via EDI 278.
 * Delegates all clearinghouse-specific communication to a ClearinghouseClient,
 * making this adapter clearinghouse-agnostic.
 *
 * The adapter:
 * 1. Validates transport config (credentials, endpoint, payer ID)
 * 2. Maps the FHIR PAS Bundle to a clearinghouse request
 * 3. Submits via the appropriate ClearinghouseClient
 * 4. Constructs a synthetic FHIR ClaimResponse so the existing
 *    parseClaimResponse() pipeline works unchanged
 */

import type { PayerTransport, PriorAuthRequest } from "@prisma/client";
import type {
  TransportAdapter,
  SubmissionResult,
  StatusCheckResult,
  ValidationResult,
} from "../types";
import type { Edi278Metadata, ClearinghouseSubmitResponse } from "../clearinghouse/types";
import { resolveCredentials, CredentialResolutionError } from "../clearinghouse/credentials";
import { mapBundleToClearinghouseRequest } from "../clearinghouse/mapper";
import { getClearinghouseClient } from "../clearinghouse";
import { parseClaimResponse } from "@/lib/pas/claim-response-parser";

// ─── Error Classification ──────────────────────────────────

type FailureCategory = "network" | "auth" | "validation" | "payer_error" | "timeout";

function classifyError(error: unknown): { category: FailureCategory; message: string } {
  if (error instanceof CredentialResolutionError) {
    return { category: "auth", message: error.message };
  }

  if (error instanceof TypeError && String(error.message).includes("fetch")) {
    return { category: "network", message: `Network error: ${error.message}` };
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return { category: "timeout", message: "Request timed out" };
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND") || message.includes("DNS")) {
    return { category: "network", message: `Network error: ${message}` };
  }

  return { category: "payer_error", message };
}

// ─── Synthetic ClaimResponse Builder ───────────────────────

function buildClaimResponseFromClearinghouse(
  chResponse: ClearinghouseSubmitResponse
): Record<string, unknown> {
  const payerStatus = chResponse.payerResponse?.status;

  const outcomeMap: Record<string, string> = {
    approved: "complete",
    denied: "error",
    pending: "queued",
    error: "error",
  };

  const dispositionMap: Record<string, string> = {
    approved: "Prior authorization approved.",
    denied: chResponse.payerResponse?.denialReason || "Prior authorization denied.",
    pending: "Request pended for clinical review.",
    error: "Error processing request.",
  };

  const response: Record<string, unknown> = {
    resourceType: "ClaimResponse",
    status: "active",
    type: { coding: [{ code: "professional" }] },
    use: "preauthorization",
    outcome: payerStatus ? outcomeMap[payerStatus] || "queued" : "queued",
    disposition: payerStatus
      ? dispositionMap[payerStatus] || chResponse.message
      : chResponse.message,
  };

  // Auth number
  if (chResponse.payerResponse?.authorizationNumber) {
    response.preAuthRef = chResponse.payerResponse.authorizationNumber;
  }

  // Expiration
  if (chResponse.payerResponse?.expiresAt) {
    response.preAuthPeriod = { end: chResponse.payerResponse.expiresAt };
  }

  // Denial details
  if (payerStatus === "denied") {
    response.error = [
      {
        code: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/adjudication-error",
              code: chResponse.payerResponse?.responseCode || "payer-denied",
              display:
                chResponse.payerResponse?.denialReason ||
                chResponse.payerResponse?.message ||
                "Prior authorization denied.",
            },
          ],
        },
      },
    ];
  }

  return response;
}

// ─── Adapter Implementation ────────────────────────────────

export class Edi278Adapter implements TransportAdapter {
  async validate(
    transport: PayerTransport,
    _request: PriorAuthRequest
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    // Required: clearinghouse payer ID
    if (!transport.clearinghousePayerId) {
      errors.push("clearinghousePayerId is required for EDI 278 transports");
    }

    // Required: metadata with clearinghouse name
    const metadata = transport.metadata as Edi278Metadata | null;
    if (!metadata?.clearinghouse) {
      errors.push("metadata.clearinghouse is required (e.g., 'availity', 'sandbox')");
    }

    // Sandbox mode: skip credential and endpoint validation
    const isSandbox =
      transport.environment === "sandbox" ||
      metadata?.clearinghouse === "sandbox" ||
      metadata?.sandboxMode === true;

    if (!isSandbox) {
      // Production: require endpoint URL
      if (!transport.endpointUrl) {
        errors.push("endpointUrl is required for production EDI 278 transports");
      }

      // Production: require valid credentials
      if (!transport.credentialRef) {
        errors.push("credentialRef is required for production EDI 278 transports");
      } else {
        try {
          resolveCredentials(transport.credentialRef);
        } catch (err) {
          errors.push(
            `Credential resolution failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async submit(
    transport: PayerTransport,
    bundle: Record<string, unknown>,
    request: PriorAuthRequest
  ): Promise<SubmissionResult> {
    const startTime = Date.now();

    try {
      // Resolve credentials (sandbox client ignores them but we still pass them)
      const metadata = transport.metadata as Edi278Metadata | null;
      const isSandbox =
        transport.environment === "sandbox" ||
        metadata?.clearinghouse === "sandbox" ||
        metadata?.sandboxMode === true;

      const credentials = isSandbox
        ? { apiKey: "sandbox", apiSecret: "sandbox" }
        : resolveCredentials(transport.credentialRef!);

      // Map FHIR Bundle to clearinghouse request
      const submitRequest = mapBundleToClearinghouseRequest(
        bundle,
        transport,
        request,
        credentials
      );

      // Get clearinghouse client and submit
      const client = getClearinghouseClient(transport);
      const chResponse = await client.submit(submitRequest);
      const responseTimeMs = Date.now() - startTime;

      // If clearinghouse rejected the transaction itself
      if (!chResponse.accepted) {
        let failureCategory: FailureCategory;
        if (chResponse.httpStatus === 401 || chResponse.httpStatus === 403) {
          failureCategory = "auth";
        } else if (chResponse.httpStatus === 400 || chResponse.responseCode === "VALIDATION_ERROR") {
          failureCategory = "validation";
        } else if (chResponse.responseCode === "TIMEOUT" || chResponse.responseCode === "POLL_ERROR") {
          failureCategory = "timeout";
        } else if (chResponse.responseCode === "NETWORK_ERROR" || chResponse.httpStatus === 0) {
          failureCategory = "network";
        } else {
          failureCategory = "payer_error";
        }

        return {
          accepted: false,
          externalSubmissionId: chResponse.trackingId,
          status: "error",
          claimResponse: null,
          httpStatusCode: chResponse.httpStatus,
          responseCode: chResponse.responseCode,
          responseSummary: chResponse.message,
          failureCategory,
          responseTimeMs,
          rawResponse: chResponse.rawResponse,
        };
      }

      // Build synthetic ClaimResponse for the existing parser pipeline
      const claimResponse = buildClaimResponseFromClearinghouse(chResponse);
      const parsedResult = parseClaimResponse(claimResponse);

      // Map clearinghouse status to adapter status
      const payerStatus = chResponse.payerResponse?.status;
      const adapterStatus: SubmissionResult["status"] =
        payerStatus === "denied"
          ? "rejected"
          : payerStatus === "approved"
            ? "accepted"
            : "pending";

      return {
        accepted: adapterStatus !== "rejected",
        externalSubmissionId: chResponse.trackingId,
        status: adapterStatus,
        claimResponse: parsedResult,
        httpStatusCode: chResponse.httpStatus,
        responseCode: chResponse.payerResponse?.responseCode || chResponse.responseCode,
        responseSummary: chResponse.message,
        failureCategory: null,
        responseTimeMs,
        rawResponse: chResponse.rawResponse,
      };
    } catch (error) {
      const { category, message } = classifyError(error);
      return {
        accepted: false,
        externalSubmissionId: null,
        status: "error",
        claimResponse: null,
        httpStatusCode: null,
        responseCode: null,
        responseSummary: message,
        failureCategory: category,
        responseTimeMs: Date.now() - startTime,
        rawResponse: { error: String(error) },
      };
    }
  }

  async checkStatus(
    transport: PayerTransport,
    externalSubmissionId: string
  ): Promise<StatusCheckResult> {
    try {
      const metadata = transport.metadata as Edi278Metadata | null;
      const isSandbox =
        transport.environment === "sandbox" ||
        metadata?.clearinghouse === "sandbox" ||
        metadata?.sandboxMode === true;

      const credentials = isSandbox
        ? { apiKey: "sandbox", apiSecret: "sandbox" }
        : resolveCredentials(transport.credentialRef!);

      const client = getClearinghouseClient(transport);
      const chResponse = await client.checkStatus({
        trackingId: externalSubmissionId,
        clearinghousePayerId: transport.clearinghousePayerId || "",
        credentials,
      });

      return {
        found: chResponse.found,
        currentStatus: chResponse.status,
        responseCode: chResponse.responseCode,
        message: chResponse.message,
        rawResponse: chResponse.rawResponse,
      };
    } catch (error) {
      return {
        found: false,
        currentStatus: null,
        responseCode: "ERROR",
        message: error instanceof Error ? error.message : String(error),
        rawResponse: { error: String(error) },
      };
    }
  }
}
