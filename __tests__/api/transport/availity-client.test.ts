/**
 * Tests for the Availity Clearinghouse Client.
 *
 * Covers:
 * - OAuth 2.0 token acquisition and caching
 * - Request mapping (ClearinghouseSubmitRequest → Availity JSON)
 * - Async submission with polling
 * - Status check
 * - Error handling (auth failures, validation errors, timeouts)
 * - Factory integration
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.unmock("@/lib/transport/clearinghouse/availity-client");
vi.unmock("@/lib/transport/clearinghouse/types");
vi.unmock("@/lib/transport/clearinghouse");
vi.unmock("@/lib/transport/clearinghouse/sandbox-client");

import { AvailityClient, _resetTokenCache } from "@/lib/transport/clearinghouse/availity-client";
import { getClearinghouseClient } from "@/lib/transport/clearinghouse";
import type {
  ClearinghouseSubmitRequest,
  ClearinghouseCredentials,
} from "@/lib/transport/clearinghouse/types";

// ─── Fixtures ─────────────────────────────────────────────

const credentials: ClearinghouseCredentials = {
  apiKey: "test-client-id",
  apiSecret: "test-client-secret",
  submitterId: "MEDIVIS-001",
};

const baseRequest: ClearinghouseSubmitRequest = {
  clearinghousePayerId: "BCBSF",
  patient: {
    firstName: "John",
    lastName: "Smith",
    dateOfBirth: "1985-03-15",
    gender: "male",
    memberId: "MBR123456",
    groupNumber: "GRP789",
  },
  provider: {
    organizationName: "Metro Imaging Center",
    npi: "1234567890",
    orderingProviderName: "Dr Jane Wilson",
    orderingProviderNpi: "0987654321",
  },
  service: {
    serviceType: "mri",
    cptCodes: ["70553"],
    icd10Codes: ["M54.5"],
    procedureDescription: "MRI Brain with and without contrast",
    urgency: "routine",
    scheduledDate: "2026-04-15",
  },
  insurance: {
    payerName: "Blue Cross Blue Shield of Florida",
    payerId: "BCBSF",
    memberId: "MBR123456",
    groupNumber: "GRP789",
  },
  referenceNumber: "PA-2026-0001",
  clinicalNotes: "Patient presents with persistent headaches",
  credentials,
};

// ─── Fetch Mocking ────────────────────────────────────────

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function mockFetchResponses(
  ...responses: Array<{
    status: number;
    headers?: Record<string, string>;
    body: unknown;
  }>
) {
  let callIndex = 0;
  fetchMock = vi.fn().mockImplementation(() => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return Promise.resolve({
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers: new Headers(resp.headers || {}),
      json: () => Promise.resolve(resp.body),
      text: () => Promise.resolve(JSON.stringify(resp.body)),
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

beforeEach(() => {
  _resetTokenCache();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ─── OAuth Token Tests ────────────────────────────────────

describe("AvailityClient OAuth", () => {
  it("acquires token before making API call", async () => {
    mockFetchResponses(
      // Token response
      {
        status: 200,
        body: { access_token: "tok-123", token_type: "Bearer", expires_in: 300 },
      },
      // Submit 202
      {
        status: 202,
        headers: { Location: "/v2/service-reviews/review-1" },
        body: { id: "review-1", statusCode: "0", status: "In Progress" },
      },
      // Poll complete
      {
        status: 200,
        body: {
          id: "review-1",
          statusCode: "4",
          status: "Complete",
          certificationNumber: "AUTH-001",
          certificationExpirationDate: "2026-07-15",
        },
      }
    );

    const client = new AvailityClient();
    await client.submit(baseRequest);

    // First call should be token request
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall[0]).toContain("/v1/token");
    expect(tokenCall[1].method).toBe("POST");

    // Second call should have Bearer token
    const submitCall = fetchMock.mock.calls[1];
    expect(submitCall[1].headers.Authorization).toBe("Bearer tok-123");
  });

  it("returns error on OAuth failure", async () => {
    mockFetchResponses({
      status: 401,
      body: { error: "invalid_client" },
    });

    const client = new AvailityClient();
    const result = await client.submit(baseRequest);

    expect(result.accepted).toBe(false);
    expect(result.responseCode).toBe("NETWORK_ERROR");
    expect(result.message).toContain("OAuth failed");
  });
});

// ─── Submit Tests ─────────────────────────────────────────

describe("AvailityClient submit", () => {
  it("submits and polls for approved result", async () => {
    mockFetchResponses(
      // Token
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      // Submit 202
      {
        status: 202,
        headers: { Location: "/v2/service-reviews/rv-100" },
        body: { id: "rv-100", statusCode: "0" },
      },
      // Poll — still processing
      { status: 200, body: { id: "rv-100", statusCode: "0" } },
      // Poll — complete with approval
      {
        status: 200,
        body: {
          id: "rv-100",
          statusCode: "4",
          status: "Complete",
          certificationNumber: "AUTH-555",
          certificationExpirationDate: "2026-07-15",
        },
      }
    );

    const client = new AvailityClient();
    const result = await client.submit(baseRequest);

    expect(result.accepted).toBe(true);
    expect(result.trackingId).toBe("rv-100");
    expect(result.payerResponse?.status).toBe("approved");
    expect(result.payerResponse?.authorizationNumber).toBe("AUTH-555");
    expect(result.payerResponse?.expiresAt).toBe("2026-07-15");
  });

  it("handles denied result", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      {
        status: 202,
        body: { id: "rv-200", statusCode: "0" },
      },
      {
        status: 200,
        body: {
          id: "rv-200",
          statusCode: "4",
          status: "Complete",
          statusReasons: [{ code: "A2", message: "Does not meet medical necessity" }],
        },
      }
    );

    const client = new AvailityClient();
    const result = await client.submit(baseRequest);

    expect(result.accepted).toBe(true);
    expect(result.payerResponse?.status).toBe("denied");
    expect(result.payerResponse?.denialReason).toContain("medical necessity");
  });

  it("handles validation error from Availity", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      {
        status: 400,
        body: {
          userMessage: "Invalid request",
          validationMessages: [
            { field: "payer.id", errorMessage: "Unknown payer ID" },
          ],
        },
      }
    );

    const client = new AvailityClient();
    const result = await client.submit(baseRequest);

    expect(result.accepted).toBe(false);
    expect(result.httpStatus).toBe(400);
    expect(result.responseCode).toBe("VALIDATION_ERROR");
    expect(result.message).toContain("Invalid request");
  });

  it("maps request fields correctly to Availity schema", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 202, body: { id: "rv-300", statusCode: "0" } },
      {
        status: 200,
        body: { id: "rv-300", statusCode: "4", certificationNumber: "AUTH-300" },
      }
    );

    const client = new AvailityClient();
    await client.submit(baseRequest);

    // Inspect the POST body
    const submitCall = fetchMock.mock.calls[1];
    const body = JSON.parse(submitCall[1].body);

    expect(body.payer.id).toBe("BCBSF");
    expect(body.subscriber.memberId).toBe("MBR123456");
    expect(body.subscriber.firstName).toBe("John");
    expect(body.subscriber.lastName).toBe("Smith");
    expect(body.subscriber.birthDate).toBe("1985-03-15");
    expect(body.subscriber.genderCode).toBe("M");
    expect(body.patient.subscriberRelationshipCode).toBe("18");
    expect(body.diagnoses).toEqual([{ qualifierCode: "ABK", code: "M54.5" }]);
    expect(body.procedures).toEqual([
      { code: "70553", qualifierCode: "HC", fromDate: "2026-04-15", toDate: "2026-04-15" },
    ]);
    expect(body.requestTypeCode).toBe("HS");
    expect(body.requestingProvider.npi).toBe("1234567890");
    expect(body.requestingProvider.submitterId).toBe("MEDIVIS-001");
    expect(body.referenceNumber).toBe("PA-2026-0001");
  });

  it("maps urgent request to UT request type", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 202, body: { id: "rv-400", statusCode: "0" } },
      { status: 200, body: { id: "rv-400", statusCode: "4", certificationNumber: "AUTH-400" } }
    );

    const client = new AvailityClient();
    await client.submit({ ...baseRequest, service: { ...baseRequest.service, urgency: "urgent" } });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.requestTypeCode).toBe("UT");
  });

  it("returns accepted false on poll timeout", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 202, body: { id: "rv-timeout", statusCode: "0" } },
      // All polls return "still processing"
      { status: 200, body: { id: "rv-timeout", statusCode: "0" } },
      { status: 200, body: { id: "rv-timeout", statusCode: "0" } },
    );

    // Use minimal poll attempts and delays for fast test
    const client = new AvailityClient({ maxPollAttempts: 2, initialPollDelayMs: 1 });
    const result = await client.submit(baseRequest);

    expect(result.accepted).toBe(false);
    expect(result.trackingId).toBe("rv-timeout");
    expect(result.responseCode).toBe("504");
    expect(result.payerResponse).toBeNull();
  });

  it("returns accepted false on payer validation error (statusCode 19)", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 202, body: { id: "rv-err", statusCode: "0" } },
      {
        status: 200,
        body: {
          id: "rv-err",
          statusCode: "19",
          status: "Request Error",
          validationMessages: [{ field: "payer.id", errorMessage: "Unknown payer" }],
        },
      }
    );

    const client = new AvailityClient();
    const result = await client.submit(baseRequest);

    expect(result.accepted).toBe(false);
    expect(result.trackingId).toBe("rv-err");
    expect(result.responseCode).toBe("19");
    expect(result.message).toContain("Unknown payer");
  });

  it("uses transport endpointUrl as base URL", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 202, body: { id: "rv-600", statusCode: "0" } },
      { status: 200, body: { id: "rv-600", statusCode: "4", certificationNumber: "AUTH-600" } }
    );

    const client = new AvailityClient({ baseUrl: "https://custom.availity.com" });
    await client.submit(baseRequest);

    // Token call should use custom base URL
    expect(fetchMock.mock.calls[0][0]).toBe("https://custom.availity.com/v1/token");
    // Submit call should use custom base URL
    expect(fetchMock.mock.calls[1][0]).toBe("https://custom.availity.com/v2/service-reviews");
  });

  it("passes mock scenario header in demo mode", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 202, body: { id: "rv-500", statusCode: "0" } },
      { status: 200, body: { id: "rv-500", statusCode: "4", certificationNumber: "AUTH-500" } }
    );

    const client = new AvailityClient();
    await client.submit({
      ...baseRequest,
      metadata: { mockScenarioId: "SR-CreateRequestAccepted-i" },
    });

    const submitHeaders = fetchMock.mock.calls[1][1].headers;
    expect(submitHeaders["X-Api-Mock-Scenario-ID"]).toBe("SR-CreateRequestAccepted-i");
  });
});

// ─── Status Check Tests ───────────────────────────────────

describe("AvailityClient checkStatus", () => {
  it("returns approved status for completed review", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      {
        status: 200,
        body: {
          id: "rv-100",
          statusCode: "4",
          status: "Complete",
          certificationNumber: "AUTH-100",
          certificationExpirationDate: "2026-07-15",
        },
      }
    );

    const client = new AvailityClient();
    const result = await client.checkStatus({
      trackingId: "rv-100",
      clearinghousePayerId: "BCBSF",
      credentials,
    });

    expect(result.found).toBe(true);
    expect(result.status).toBe("approved");
    expect(result.payerResponse?.authorizationNumber).toBe("AUTH-100");
  });

  it("returns in_progress for processing review", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 200, body: { id: "rv-200", statusCode: "0", status: "In Progress" } }
    );

    const client = new AvailityClient();
    const result = await client.checkStatus({
      trackingId: "rv-200",
      clearinghousePayerId: "BCBSF",
      credentials,
    });

    expect(result.found).toBe(true);
    expect(result.status).toBe("in_progress");
    expect(result.payerResponse).toBeNull();
  });

  it("returns not found for 404", async () => {
    mockFetchResponses(
      { status: 200, body: { access_token: "tok-1", expires_in: 300 } },
      { status: 404, body: {} }
    );

    const client = new AvailityClient();
    const result = await client.checkStatus({
      trackingId: "rv-nonexistent",
      clearinghousePayerId: "BCBSF",
      credentials,
    });

    expect(result.found).toBe(false);
  });
});

// ─── Factory Integration ──────────────────────────────────

describe("getClearinghouseClient with Availity", () => {
  it("returns AvailityClient for production availity transport", () => {
    const transport = {
      id: "t-1",
      payerId: "py-1",
      organizationId: null,
      method: "edi_278" as const,
      environment: "production" as const,
      isEnabled: true,
      priority: 0,
      endpointUrl: "https://api.availity.com",
      statusEndpointUrl: null,
      externalPayerId: null,
      clearinghousePayerId: "BCBSF",
      credentialRef: "env://AVAILITY",
      supportsAttachments: false,
      supportsStatusCheck: true,
      requiresHumanReview: true,
      metadata: { clearinghouse: "availity" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const client = getClearinghouseClient(transport);
    expect(client).toBeInstanceOf(AvailityClient);
  });

  it("still returns sandbox client for sandbox environment", () => {
    const transport = {
      id: "t-2",
      payerId: "py-1",
      organizationId: null,
      method: "edi_278" as const,
      environment: "sandbox" as const,
      isEnabled: true,
      priority: 0,
      endpointUrl: null,
      statusEndpointUrl: null,
      externalPayerId: null,
      clearinghousePayerId: "BCBSF",
      credentialRef: null,
      supportsAttachments: false,
      supportsStatusCheck: true,
      requiresHumanReview: true,
      metadata: { clearinghouse: "availity" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const client = getClearinghouseClient(transport);
    // Sandbox environment overrides clearinghouse name
    expect(client).not.toBeInstanceOf(AvailityClient);
  });
});
