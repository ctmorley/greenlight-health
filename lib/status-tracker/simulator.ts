/**
 * Payer Response Simulator
 *
 * Simulates payer decision-making for status check polling.
 * In production, this would be replaced with actual payer API
 * integrations (X12 278 response parsing, portal scraping, etc.).
 *
 * The simulator uses time-since-submission and clinical factors
 * to produce realistic response patterns.
 */

export interface SimulatedPayerResponse {
  responseCode: string;
  message: string;
  newStatus: string | null; // null = no change
  responseTimeMs: number;
}

interface RequestContext {
  status: string;
  submittedAt: Date | null;
  urgency: string;
  cptCodes: string[];
  serviceCategory: string | null;
  acrRating?: number | null;
}

/**
 * Simulates a payer response based on the PA request context.
 *
 * Decision logic:
 * - Requests in non-pending states get a "no change" response
 * - Time-based progression: most decisions arrive within 5-14 days
 * - Higher ACR ratings increase approval probability
 * - Urgent requests are decided faster
 * - Simulated response time: 200-2000ms
 */
export function simulatePayerResponse(
  request: RequestContext
): SimulatedPayerResponse {
  const responseTimeMs = 200 + Math.floor(Math.random() * 1800);

  // Only pending/submitted requests can receive payer decisions
  if (!["submitted", "pending_review"].includes(request.status)) {
    return {
      responseCode: "NO_CHANGE",
      message: `Request is in '${request.status}' status — no payer action expected.`,
      newStatus: null,
      responseTimeMs,
    };
  }

  // If not yet submitted, no response
  if (!request.submittedAt) {
    return {
      responseCode: "NOT_SUBMITTED",
      message: "Request has not been submitted to payer.",
      newStatus: null,
      responseTimeMs,
    };
  }

  // Calculate days since submission
  const daysSinceSubmission = Math.floor(
    (Date.now() - request.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Determine response window based on urgency
  const responseWindowDays =
    request.urgency === "emergent"
      ? 1
      : request.urgency === "urgent"
        ? 3
        : 7;

  // Before response window: still pending
  if (daysSinceSubmission < responseWindowDays) {
    // Small chance (10%) of early transition to pending_review
    if (
      request.status === "submitted" &&
      Math.random() < 0.1
    ) {
      return {
        responseCode: "PEND_REVIEW",
        message: "Request received by payer and is under clinical review.",
        newStatus: "pending_review",
        responseTimeMs,
      };
    }

    return {
      responseCode: "PENDING",
      message: `Request is being processed. Expected response in ${responseWindowDays - daysSinceSubmission} day(s).`,
      newStatus: null,
      responseTimeMs,
    };
  }

  // Within or past response window: determine outcome
  // Base approval probability: 70%
  let approvalProbability = 0.7;

  // ACR rating adjustments
  if (request.acrRating !== undefined && request.acrRating !== null) {
    if (request.acrRating >= 7) {
      approvalProbability += 0.15; // Usually appropriate
    } else if (request.acrRating >= 4) {
      approvalProbability -= 0.1; // May be appropriate
    } else {
      approvalProbability -= 0.3; // Usually not appropriate
    }
  }

  // Time penalty: the longer it takes, slightly higher denial risk
  if (daysSinceSubmission > 14) {
    approvalProbability -= 0.05;
  }

  // Clamp to [0.1, 0.95]
  approvalProbability = Math.max(0.1, Math.min(0.95, approvalProbability));

  // Roll the dice
  const roll = Math.random();

  if (roll < approvalProbability) {
    return {
      responseCode: "APPROVED",
      message: "Prior authorization approved by payer.",
      newStatus: "approved",
      responseTimeMs,
    };
  }

  // 60% of denials are pended first (if not already pending_review)
  if (
    request.status === "submitted" &&
    roll < approvalProbability + (1 - approvalProbability) * 0.6
  ) {
    return {
      responseCode: "PENDED",
      message: "Additional clinical review required. Request pended by payer.",
      newStatus: "pending_review",
      responseTimeMs,
    };
  }

  return {
    responseCode: "DENIED",
    message: "Prior authorization denied by payer. Review denial reason and consider filing an appeal.",
    newStatus: "denied",
    responseTimeMs,
  };
}
