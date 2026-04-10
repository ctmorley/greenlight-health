/**
 * Simulated Transport Adapter
 *
 * Wraps the existing simulation functions behind the TransportAdapter
 * interface. No behavior change from the current simulation logic —
 * same functions, new contract.
 *
 * This adapter is used when no real payer transport is configured,
 * and serves as the reference implementation for the adapter interface.
 */

import type { PayerTransport, PriorAuthRequest } from "@prisma/client";
import type {
  TransportAdapter,
  SubmissionResult,
  StatusCheckResult,
  ValidationResult,
} from "../types";
import {
  simulateClaimResponse,
  parseClaimResponse,
} from "@/lib/pas/claim-response-parser";
import { simulatePayerResponse } from "@/lib/status-tracker/simulator";
import { prisma } from "@/lib/prisma";

export class SimulatedAdapter implements TransportAdapter {
  async validate(
    _transport: PayerTransport,
    _request: PriorAuthRequest
  ): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async submit(
    _transport: PayerTransport,
    _bundle: Record<string, unknown>,
    request: PriorAuthRequest
  ): Promise<SubmissionResult> {
    const startTime = Date.now();

    // Look up ACR rating for simulation quality (same as current logic)
    let acrRating: number | null = null;
    if (request.cptCodes.length > 0) {
      const guideline = await prisma.clinicalGuideline.findFirst({
        where: { cptCodes: { hasSome: request.cptCodes } },
        orderBy: { rating: "desc" },
        select: { rating: true },
      });
      acrRating = guideline?.rating ?? null;
    }

    const rawResponse = simulateClaimResponse(request.urgency, acrRating);
    const claimResponse = parseClaimResponse(rawResponse);
    const responseTimeMs = Date.now() - startTime;

    const accepted = claimResponse.status !== "denied";

    return {
      accepted,
      externalSubmissionId: claimResponse.authorizationNumber,
      status: accepted ? "accepted" : "rejected",
      claimResponse,
      httpStatusCode: 200,
      responseCode: null,
      responseSummary: `Simulated: ${claimResponse.status}`,
      failureCategory: null,
      responseTimeMs,
      rawResponse,
    };
  }

  async checkStatus(
    _transport: PayerTransport,
    _externalSubmissionId: string
  ): Promise<StatusCheckResult> {
    // The simulated status check needs request context, which isn't
    // available through the standard interface. Return a no-op result.
    // The status checker falls back to the legacy simulatePayerResponse()
    // path for simulated transports.
    return {
      found: false,
      currentStatus: null,
      responseCode: "SIMULATED_NO_OP",
      message: "Simulated adapter does not support independent status checks",
      rawResponse: null,
    };
  }
}
