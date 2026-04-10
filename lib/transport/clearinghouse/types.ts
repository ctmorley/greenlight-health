/**
 * Clearinghouse Client Interfaces
 *
 * Defines the contract for clearinghouse integrations. Each clearinghouse
 * (Availity, Change Healthcare, Waystar, etc.) provides a concrete
 * implementation. The EDI 278 adapter stays clearinghouse-agnostic.
 */

// ─── Client Contract ───────────────────────────────────────

export interface ClearinghouseClient {
  /** Submit a prior auth request to the clearinghouse for routing to the payer */
  submit(request: ClearinghouseSubmitRequest): Promise<ClearinghouseSubmitResponse>;

  /** Check status of a previously submitted request via tracking ID */
  checkStatus(request: ClearinghouseStatusRequest): Promise<ClearinghouseStatusResponse>;
}

// ─── Credentials ───────────────────────────────────────────

export interface ClearinghouseCredentials {
  apiKey: string;
  apiSecret: string;
  /** Some clearinghouses require a separate submitter/sender ID */
  submitterId?: string;
}

// ─── Submit Request / Response ─────────────────────────────

export interface ClearinghouseSubmitRequest {
  /** Clearinghouse-specific payer identifier */
  clearinghousePayerId: string;

  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD
    gender: string;
    memberId: string;
    groupNumber?: string;
  };

  provider: {
    organizationName: string;
    npi: string;
    orderingProviderName?: string;
    orderingProviderNpi?: string;
    renderingProviderNpi?: string;
  };

  service: {
    serviceType: string;
    cptCodes: string[];
    icd10Codes: string[];
    procedureDescription: string;
    urgency: "routine" | "urgent" | "emergent";
    scheduledDate?: string; // YYYY-MM-DD
  };

  insurance: {
    payerName: string;
    payerId: string;
    memberId: string;
    groupNumber?: string;
  };

  referenceNumber: string;
  clinicalNotes?: string;

  /** Resolved credentials for the clearinghouse API */
  credentials: ClearinghouseCredentials;

  /** Pass-through for clearinghouse-specific fields */
  metadata?: Record<string, unknown>;
}

export interface ClearinghouseSubmitResponse {
  /** Whether the clearinghouse accepted the transaction for routing */
  accepted: boolean;
  /** Clearinghouse tracking number / trace ID */
  trackingId: string | null;
  /** Immediate payer response (populated for sync payers, null for async) */
  payerResponse: {
    status: "approved" | "denied" | "pending" | "error";
    authorizationNumber?: string;
    responseCode?: string;
    message?: string;
    expiresAt?: string;
    denialReason?: string;
  } | null;
  /** HTTP status from clearinghouse API */
  httpStatus: number;
  /** Clearinghouse-level response code */
  responseCode: string;
  /** Human-readable message */
  message: string;
  /** Raw response body for audit */
  rawResponse: unknown;
}

// ─── Status Check Request / Response ───────────────────────

export interface ClearinghouseStatusRequest {
  trackingId: string;
  clearinghousePayerId: string;
  credentials: ClearinghouseCredentials;
}

export interface ClearinghouseStatusResponse {
  found: boolean;
  status: string | null;
  responseCode: string | null;
  message: string | null;
  payerResponse: {
    status: "approved" | "denied" | "pending";
    authorizationNumber?: string;
    expiresAt?: string;
    denialReason?: string;
  } | null;
  rawResponse: unknown;
}

// ─── Transport Metadata Schema ─────────────────────────────

/** Shape of PayerTransport.metadata when method = "edi_278" */
export interface Edi278Metadata {
  /** Which clearinghouse implementation to use */
  clearinghouse: string; // "availity" | "change_healthcare" | "trizetto" | "sandbox"
  /** Force sandbox behavior regardless of transport.environment */
  sandboxMode?: boolean;
  /** Clearinghouse-specific configuration */
  config?: {
    /** Timeout override in ms (default: 30000) */
    timeoutMs?: number;
    /** Whether this payer supports real-time (sync) responses */
    syncResponse?: boolean;
    /** Custom headers to send with requests */
    customHeaders?: Record<string, string>;
  };
}
