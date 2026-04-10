/**
 * Availity Clearinghouse Client
 *
 * Implements ClearinghouseClient against Availity's Service Reviews API (278).
 *
 * Key behaviors:
 * - OAuth 2.0 client_credentials flow with automatic token refresh
 * - Async submission: POST returns 202 → poll GET until statusCode != 0
 * - Maps ClearinghouseSubmitRequest to Availity's serviceReview JSON schema
 * - Maps Availity responses back to ClearinghouseSubmitResponse
 *
 * API docs: https://developer.availity.com/blog/2025/3/25/hipaa-transactions
 */

import type {
  ClearinghouseClient,
  ClearinghouseSubmitRequest,
  ClearinghouseSubmitResponse,
  ClearinghouseStatusRequest,
  ClearinghouseStatusResponse,
  ClearinghouseCredentials,
} from "./types";

// ─── Configuration ──────────────────────────────────────────

const DEFAULT_BASE_URL = "https://api.availity.com";

/** Token refresh buffer — renew 30s before expiry */
const TOKEN_REFRESH_BUFFER_MS = 30_000;

/** Max polling attempts before timeout */
const MAX_POLL_ATTEMPTS = 20;

/** Initial delay between polls (doubles each attempt, capped) */
const INITIAL_POLL_DELAY_MS = 1_000;

/** Maximum delay between polls */
const MAX_POLL_DELAY_MS = 10_000;

/** Default request timeout */
const DEFAULT_TIMEOUT_MS = 30_000;

// ─── OAuth Token Cache ──────────────────────────────────────

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix ms
}

const tokenCache = new Map<string, CachedToken>();

function getCacheKey(credentials: ClearinghouseCredentials): string {
  return credentials.apiKey;
}

/** Clear the token cache. Exported for testing only. */
export function _resetTokenCache(): void {
  tokenCache.clear();
}

// ─── Availity API Types ─────────────────────────────────────

interface AvailityServiceReview {
  payer: { id: string };
  requestingProvider: {
    lastName: string;
    firstName?: string;
    npi: string;
    taxId?: string;
    submitterId?: string;
  };
  subscriber: {
    memberId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    genderCode: string;
  };
  patient: {
    firstName: string;
    lastName: string;
    birthDate: string;
    genderCode: string;
    subscriberRelationshipCode: string;
  };
  diagnoses: Array<{
    qualifierCode: string;
    code: string;
  }>;
  procedures: Array<{
    code: string;
    qualifierCode: string;
    fromDate?: string;
    toDate?: string;
  }>;
  serviceTypeCode: string;
  placeOfServiceCode: string;
  fromDate?: string;
  toDate?: string;
  requestTypeCode: string;
  referenceNumber?: string;
}

interface AvailityResponse {
  id?: string;
  status?: string;
  statusCode?: string;
  controlNumber?: string;
  certificationNumber?: string;
  certificationEffectiveDate?: string;
  certificationExpirationDate?: string;
  referenceNumber?: string;
  validationMessages?: Array<{
    field?: string;
    code?: string;
    errorMessage?: string;
  }>;
  payerNotes?: Array<{
    type?: string;
    typeCode?: string;
    message?: string;
  }>;
  statusReasons?: Array<{
    code?: string;
    message?: string;
  }>;
  createdDate?: string;
  updatedDate?: string;
  expirationDate?: string;
}

interface AvailityErrorResponse {
  userMessage?: string;
  developerMessage?: string;
  validationMessages?: Array<{
    field?: string;
    errorMessage?: string;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────

function mapGenderCode(gender: string): string {
  switch (gender.toLowerCase()) {
    case "male":
      return "M";
    case "female":
      return "F";
    default:
      return "U";
  }
}

/**
 * Map service urgency to X12 278 request type code.
 * HS = Health Services Review (standard)
 * UT = Urgent (expedited review)
 */
function mapRequestTypeCode(urgency: string): string {
  switch (urgency) {
    case "urgent":
    case "emergent":
      return "UT";
    default:
      return "HS";
  }
}

/**
 * Map the first CPT code prefix to a service type code.
 * Falls back to "73" (Diagnostic Medical) for unknown prefixes.
 */
function mapServiceTypeCode(cptCodes: string[]): string {
  if (cptCodes.length === 0) return "73";
  const first = cptCodes[0];

  // Imaging CPTs (70000-79999)
  if (first.startsWith("7")) return "73"; // Diagnostic Medical
  // Surgical CPTs (10000-69999)
  if (/^[1-6]/.test(first)) return "2"; // Surgical
  // Eval/management (99000-99499)
  if (first.startsWith("99")) return "3"; // Consultation

  return "73";
}

/**
 * Map Availity statusCode to payer response status.
 * 4 = Complete (check certificationNumber for approved vs denied)
 * 0 = In Progress
 * 19, R1, 7, 13, 14, 15 = Errors
 */
function mapAvailityStatus(
  response: AvailityResponse
): "approved" | "denied" | "pending" | "error" {
  const code = response.statusCode;

  if (code === "0") return "pending"; // Still processing

  if (code === "4") {
    // Complete — determine approval from certificationNumber
    if (response.certificationNumber) return "approved";
    // Check statusReasons for denial indicators
    const reasons = response.statusReasons || [];
    const hasDenial = reasons.some(
      (r) => r.code === "A2" || r.message?.toLowerCase().includes("denied")
    );
    if (hasDenial) return "denied";
    // No cert number but no explicit denial — pending/manual review
    return "pending";
  }

  // Error codes
  if (code === "19") return "error"; // Request/validation error
  return "error"; // R1, 7, 13, 14, 15 — communication errors
}

function buildErrorMessage(response: AvailityResponse): string {
  const parts: string[] = [];

  if (response.status) parts.push(response.status);

  const reasons = response.statusReasons || [];
  for (const r of reasons) {
    if (r.message) parts.push(r.message);
  }

  const validations = response.validationMessages || [];
  for (const v of validations) {
    if (v.errorMessage) parts.push(`${v.field || "field"}: ${v.errorMessage}`);
  }

  return parts.length > 0 ? parts.join("; ") : "Unknown error";
}

// ─── Client Implementation ──────────────────────────────────

export interface AvailityClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxPollAttempts?: number;
  initialPollDelayMs?: number;
}

export class AvailityClient implements ClearinghouseClient {
  private baseUrl: string;
  private tokenEndpoint: string;
  private serviceReviewsEndpoint: string;
  private timeoutMs: number;
  private maxPollAttempts: number;
  private initialPollDelayMs: number;

  constructor(options?: AvailityClientOptions) {
    this.baseUrl = (options?.baseUrl || process.env.AVAILITY_BASE_URL || DEFAULT_BASE_URL)
      .replace(/\/+$/, ""); // strip trailing slashes
    this.tokenEndpoint = `${this.baseUrl}/v1/token`;
    this.serviceReviewsEndpoint = `${this.baseUrl}/v2/service-reviews`;
    this.timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxPollAttempts = options?.maxPollAttempts || MAX_POLL_ATTEMPTS;
    this.initialPollDelayMs = options?.initialPollDelayMs || INITIAL_POLL_DELAY_MS;
  }

  // ── OAuth Token ─────────────────────────────────────────

  private async getAccessToken(
    credentials: ClearinghouseCredentials
  ): Promise<string> {
    const cacheKey = getCacheKey(credentials);
    const cached = tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    const scope = credentials.submitterId
      ? "healthcare-hipaa-transactions"
      : "healthcare-hipaa-transactions";

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credentials.apiKey,
      client_secret: credentials.apiSecret,
      scope,
    });

    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Availity OAuth failed (${response.status}): ${text}`
      );
    }

    const data = await response.json();
    const expiresInMs = (data.expires_in || 300) * 1000;

    tokenCache.set(cacheKey, {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInMs,
    });

    return data.access_token;
  }

  private async authenticatedFetch(
    url: string,
    credentials: ClearinghouseCredentials,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await this.getAccessToken(credentials);

    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(this.timeoutMs),
    });
  }

  // ── Request Mapping ─────────────────────────────────────

  private mapToAvailityRequest(
    request: ClearinghouseSubmitRequest
  ): AvailityServiceReview {
    const providerParts = (request.provider.orderingProviderName || "").split(" ");
    const providerLastName = providerParts.length > 1
      ? providerParts.slice(-1)[0]
      : request.provider.organizationName;
    const providerFirstName = providerParts.length > 1
      ? providerParts.slice(0, -1).join(" ")
      : undefined;

    return {
      payer: {
        id: request.clearinghousePayerId,
      },
      requestingProvider: {
        lastName: providerLastName,
        firstName: providerFirstName,
        npi: request.provider.npi,
        submitterId: request.credentials.submitterId,
      },
      subscriber: {
        memberId: request.insurance.memberId,
        firstName: request.patient.firstName,
        lastName: request.patient.lastName,
        birthDate: request.patient.dateOfBirth,
        genderCode: mapGenderCode(request.patient.gender),
      },
      patient: {
        firstName: request.patient.firstName,
        lastName: request.patient.lastName,
        birthDate: request.patient.dateOfBirth,
        genderCode: mapGenderCode(request.patient.gender),
        subscriberRelationshipCode: "18", // Self (default)
      },
      diagnoses: request.service.icd10Codes.map((code) => ({
        qualifierCode: "ABK", // ICD-10-CM
        code,
      })),
      procedures: request.service.cptCodes.map((code) => ({
        code,
        qualifierCode: "HC", // HCPCS
        fromDate: request.service.scheduledDate,
        toDate: request.service.scheduledDate,
      })),
      serviceTypeCode: mapServiceTypeCode(request.service.cptCodes),
      placeOfServiceCode: "22", // Outpatient hospital (default for imaging/surgical)
      fromDate: request.service.scheduledDate,
      toDate: request.service.scheduledDate,
      requestTypeCode: mapRequestTypeCode(request.service.urgency),
      referenceNumber: request.referenceNumber,
    };
  }

  // ── Polling ─────────────────────────────────────────────

  private async pollForResult(
    reviewId: string,
    credentials: ClearinghouseCredentials,
    mockScenario?: string
  ): Promise<AvailityResponse> {
    let delay = this.initialPollDelayMs;

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delay));

      const headers: Record<string, string> = {};
      if (mockScenario) {
        headers["X-Api-Mock-Scenario-ID"] = mockScenario;
      }

      const response = await this.authenticatedFetch(
        `${this.serviceReviewsEndpoint}/${reviewId}`,
        credentials,
        { method: "GET", headers }
      );

      if (!response.ok && response.status !== 202) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Availity poll failed (${response.status}): ${text}`
        );
      }

      const data: AvailityResponse = await response.json();

      // statusCode "0" = still processing; anything else = done
      if (data.statusCode !== "0") {
        return data;
      }

      // Exponential backoff with cap
      delay = Math.min(delay * 2, MAX_POLL_DELAY_MS);
    }

    // Exhausted polling attempts
    return {
      statusCode: "504",
      status: "Timeout",
      statusReasons: [
        { code: "POLL_TIMEOUT", message: "Polling timed out waiting for payer response" },
      ],
    };
  }

  // ── ClearinghouseClient Interface ───────────────────────

  async submit(
    request: ClearinghouseSubmitRequest
  ): Promise<ClearinghouseSubmitResponse> {
    const mockScenario = request.metadata?.mockScenarioId as string | undefined;

    try {
      const availityRequest = this.mapToAvailityRequest(request);

      const headers: Record<string, string> = {};
      if (mockScenario) {
        headers["X-Api-Mock-Scenario-ID"] = mockScenario;
      }

      const response = await this.authenticatedFetch(
        this.serviceReviewsEndpoint,
        request.credentials,
        {
          method: "POST",
          body: JSON.stringify(availityRequest),
          headers,
        }
      );

      // Handle immediate validation errors
      if (response.status === 400) {
        const errorData: AvailityErrorResponse = await response.json().catch(() => ({}));
        const messages = (errorData.validationMessages || [])
          .map((v) => `${v.field || "field"}: ${v.errorMessage}`)
          .join("; ");

        return {
          accepted: false,
          trackingId: null,
          payerResponse: null,
          httpStatus: 400,
          responseCode: "VALIDATION_ERROR",
          message: errorData.userMessage || messages || "Validation failed",
          rawResponse: errorData,
        };
      }

      // Non-202 unexpected status
      if (response.status !== 202 && response.status !== 200) {
        const text = await response.text().catch(() => "");
        return {
          accepted: false,
          trackingId: null,
          payerResponse: null,
          httpStatus: response.status,
          responseCode: "UNEXPECTED_STATUS",
          message: `Unexpected response ${response.status}: ${text}`,
          rawResponse: text,
        };
      }

      // 202 Accepted — extract ID from Location header or response body
      const data: AvailityResponse = await response.json().catch(() => ({}));
      const reviewId = data.id || this.extractIdFromLocation(response);

      if (!reviewId) {
        return {
          accepted: true,
          trackingId: null,
          payerResponse: null,
          httpStatus: response.status,
          responseCode: "NO_TRACKING_ID",
          message: "Accepted but no review ID returned",
          rawResponse: data,
        };
      }

      // Poll for final result
      const result = await this.pollForResult(reviewId, request.credentials, mockScenario);
      const payerStatus = mapAvailityStatus(result);

      // Poll timeout or payer-side error — not a successful submission
      if (payerStatus === "error") {
        return {
          accepted: false,
          trackingId: reviewId,
          payerResponse: null,
          httpStatus: response.status,
          responseCode: result.statusCode || "POLL_ERROR",
          message: buildErrorMessage(result),
          rawResponse: result,
        };
      }

      return {
        accepted: true,
        trackingId: reviewId,
        payerResponse: {
          status: payerStatus,
          authorizationNumber: result.certificationNumber || undefined,
          responseCode: result.statusCode || undefined,
          message: buildErrorMessage(result),
          expiresAt: result.certificationExpirationDate || undefined,
          denialReason: payerStatus === "denied"
            ? buildErrorMessage(result)
            : undefined,
        },
        httpStatus: response.status,
        responseCode: result.statusCode || "UNKNOWN",
        message: buildErrorMessage(result),
        rawResponse: result,
      };
    } catch (err) {
      const error = err as Error;
      return {
        accepted: false,
        trackingId: null,
        payerResponse: null,
        httpStatus: 0,
        responseCode: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
        message: error.message,
        rawResponse: { error: error.message },
      };
    }
  }

  async checkStatus(
    request: ClearinghouseStatusRequest
  ): Promise<ClearinghouseStatusResponse> {
    try {
      const response = await this.authenticatedFetch(
        `${this.serviceReviewsEndpoint}/${request.trackingId}`,
        request.credentials,
        { method: "GET" }
      );

      if (response.status === 404) {
        return {
          found: false,
          status: null,
          responseCode: null,
          message: "Review not found",
          payerResponse: null,
          rawResponse: null,
        };
      }

      if (!response.ok && response.status !== 202) {
        const text = await response.text().catch(() => "");
        return {
          found: false,
          status: null,
          responseCode: String(response.status),
          message: `Status check failed (${response.status}): ${text}`,
          payerResponse: null,
          rawResponse: text,
        };
      }

      const data: AvailityResponse = await response.json();
      const payerStatus = mapAvailityStatus(data);

      // Still processing
      if (data.statusCode === "0") {
        return {
          found: true,
          status: "in_progress",
          responseCode: "0",
          message: "Still processing",
          payerResponse: null,
          rawResponse: data,
        };
      }

      return {
        found: true,
        status: payerStatus,
        responseCode: data.statusCode || null,
        message: buildErrorMessage(data),
        payerResponse:
          payerStatus !== "error"
            ? {
                status: payerStatus as "approved" | "denied" | "pending",
                authorizationNumber: data.certificationNumber || undefined,
                expiresAt: data.certificationExpirationDate || undefined,
                denialReason: payerStatus === "denied"
                  ? buildErrorMessage(data)
                  : undefined,
              }
            : null,
        rawResponse: data,
      };
    } catch (err) {
      const error = err as Error;
      return {
        found: false,
        status: null,
        responseCode: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
        message: error.message,
        payerResponse: null,
        rawResponse: { error: error.message },
      };
    }
  }

  // ── Internal ────────────────────────────────────────────

  private extractIdFromLocation(response: Response): string | null {
    const location = response.headers.get("Location") || response.headers.get("location");
    if (!location) return null;

    // Location header format: /v2/service-reviews/{id}
    const parts = location.split("/");
    return parts[parts.length - 1] || null;
  }
}
