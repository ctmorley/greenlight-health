/**
 * Transport Adapter Interfaces
 *
 * Defines the contract that all payer transport adapters must implement.
 * Each transport method (FHIR PAS, EDI 278, RPA, etc.) provides a concrete
 * implementation. The rest of the app stays transport-agnostic.
 */

import type {
  PayerTransport,
  PriorAuthRequest,
  TransportMethod,
} from "@prisma/client";
import type { PasSubmissionResult } from "@/lib/pas/claim-response-parser";

// ─── Adapter Contract ───────────────────────────────────────

export interface TransportAdapter {
  /** Check that this adapter can handle the request (config present, creds reachable, etc.) */
  validate(
    transport: PayerTransport,
    request: PriorAuthRequest
  ): Promise<ValidationResult>;

  /** Submit a PA bundle to the payer. Returns a normalized result. */
  submit(
    transport: PayerTransport,
    bundle: Record<string, unknown>,
    request: PriorAuthRequest
  ): Promise<SubmissionResult>;

  /** Check status of a previously submitted request via external ID. */
  checkStatus(
    transport: PayerTransport,
    externalSubmissionId: string
  ): Promise<StatusCheckResult>;
}

// ─── Result Types ───────────────────────────────────────────

export interface SubmissionResult {
  /** Whether the payer accepted the submission for processing */
  accepted: boolean;
  /** Payer's tracking ID (278 trace number, PAS claim ID, etc.) */
  externalSubmissionId: string | null;
  /** Normalized submission outcome */
  status: "accepted" | "rejected" | "pending" | "error";
  /** Parsed claim response (if transport returns FHIR ClaimResponse) */
  claimResponse: PasSubmissionResult | null;
  /** HTTP status code from the transport call */
  httpStatusCode: number | null;
  /** Payer response code (e.g., A1, A2 for 278) */
  responseCode: string | null;
  /** Human-readable summary */
  responseSummary: string | null;
  /** Failure category for operational triage */
  failureCategory: "network" | "auth" | "validation" | "payer_error" | "timeout" | null;
  /** Round-trip time in milliseconds */
  responseTimeMs: number;
  /** Raw response for audit storage */
  rawResponse: unknown;
}

export interface StatusCheckResult {
  /** Whether the external system found the submission */
  found: boolean;
  /** Current payer-side status */
  currentStatus: string | null;
  /** Payer response code */
  responseCode: string | null;
  /** Human-readable message from payer */
  message: string | null;
  /** Raw response for audit storage */
  rawResponse: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Adapter Registry Type ──────────────────────────────────

export type AdapterMap = Partial<Record<TransportMethod, TransportAdapter>>;
