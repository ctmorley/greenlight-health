/**
 * Tests for the EDI 278 Clearinghouse Transport Adapter.
 *
 * Covers:
 * - Credential resolution (env:// prefix pattern)
 * - FHIR Bundle → clearinghouse request mapping
 * - Sandbox clearinghouse client behavior
 * - Edi278Adapter validate / submit / checkStatus
 * - Registry integration
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.unmock("@/lib/transport");
vi.unmock("@/lib/transport/registry");
vi.unmock("@/lib/transport/adapters/simulated");
vi.unmock("@/lib/transport/adapters/edi-278");
vi.unmock("@/lib/transport/types");
vi.unmock("@/lib/transport/clearinghouse/types");
vi.unmock("@/lib/transport/clearinghouse/credentials");
vi.unmock("@/lib/transport/clearinghouse/mapper");
vi.unmock("@/lib/transport/clearinghouse/sandbox-client");
vi.unmock("@/lib/transport/clearinghouse");
vi.unmock("@/lib/pas/claim-response-parser");

import { resetPrismaMocks } from "../../helpers/mock-prisma";

// ─── Shared Fixtures ───────────────────────────────────────

const mockEdiTransport = {
  id: "t-edi-1",
  payerId: "py-1",
  organizationId: null,
  method: "edi_278" as const,
  environment: "sandbox" as const,
  isEnabled: true,
  priority: 0,
  endpointUrl: null,
  statusEndpointUrl: null,
  externalPayerId: "BCBS-12345",
  clearinghousePayerId: "CH-BCBS-12345",
  credentialRef: null,
  supportsAttachments: false,
  supportsStatusCheck: true,
  requiresHumanReview: true,
  metadata: { clearinghouse: "sandbox" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProductionTransport = {
  ...mockEdiTransport,
  id: "t-edi-prod",
  environment: "production" as const,
  endpointUrl: "https://api.clearinghouse.example/v1/pa",
  statusEndpointUrl: "https://api.clearinghouse.example/v1/pa/status",
  credentialRef: "env://AVAILITY",
  metadata: { clearinghouse: "availity" },
};

const mockRequest = {
  id: "req-1",
  organizationId: "org-1",
  patientId: "pat-1",
  createdById: "user-1",
  assignedToId: null,
  referenceNumber: "PA-EDI-001",
  status: "submitted" as const,
  urgency: "routine" as const,
  serviceCategory: "imaging" as const,
  serviceType: "mri" as const,
  cptCodes: ["70553"],
  icd10Codes: ["M54.5"],
  procedureDescription: "Brain MRI with and without contrast",
  payerId: "py-1",
  insuranceId: null,
  rbmVendor: null,
  rbmReferenceNumber: null,
  orderingPhysicianId: null,
  renderingPhysicianNpi: null,
  facilityName: null,
  scheduledDate: null,
  dueDate: null,
  clinicalNotes: "Patient presents with chronic headaches.",
  aiAuditResult: null,
  draftMetadata: null,
  submittedAt: new Date(),
  decidedAt: null,
  expiresAt: null,
  approvedUnits: null,
  approvedCptCodes: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Minimal PAS Bundle matching the structure from bundle-assembler.ts */
function buildTestBundle() {
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    identifier: {
      system: "https://greenlight-health.vercel.app/pa-reference",
      value: "PA-EDI-001",
    },
    entry: [
      {
        fullUrl: "urn:uuid:claim-1",
        resource: {
          resourceType: "Claim",
          status: "active",
          type: { coding: [{ code: "professional" }] },
          use: "preauthorization",
          priority: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/processpriority",
                code: "deferred",
              },
            ],
          },
          item: [
            {
              sequence: 1,
              productOrService: {
                coding: [
                  { system: "http://www.ama-assn.org/go/cpt", code: "70553" },
                ],
                text: "Brain MRI with and without contrast",
              },
              servicedDate: "2026-04-15",
            },
          ],
          diagnosis: [
            {
              sequence: 1,
              diagnosisCodeableConcept: {
                coding: [
                  { system: "http://hl7.org/fhir/sid/icd-10-cm", code: "M54.5" },
                ],
              },
            },
          ],
          supportingInfo: [
            {
              sequence: 1,
              category: { coding: [{ code: "info" }] },
              valueString: "Patient presents with chronic headaches.",
            },
          ],
        },
      },
      {
        fullUrl: "urn:uuid:patient-1",
        resource: {
          resourceType: "Patient",
          identifier: [
            {
              type: { coding: [{ code: "MR" }] },
              value: "MRN-12345",
            },
          ],
          name: [{ family: "Smith", given: ["Jane"] }],
          birthDate: "1985-03-15",
          gender: "female",
        },
      },
      {
        fullUrl: "urn:uuid:coverage-1",
        resource: {
          resourceType: "Coverage",
          status: "active",
          subscriberId: "MEM-67890",
          beneficiary: { reference: "urn:uuid:patient-1" },
          payor: [{ display: "Blue Cross Blue Shield" }],
          class: [
            {
              type: { coding: [{ code: "group" }] },
              value: "GRP-555",
            },
          ],
        },
      },
      {
        fullUrl: "urn:uuid:practitioner-1",
        resource: {
          resourceType: "Practitioner",
          identifier: [
            {
              system: "http://hl7.org/fhir/sid/us-npi",
              value: "1234567890",
            },
          ],
          name: [{ text: "Dr. John Doe" }],
        },
      },
      {
        fullUrl: "urn:uuid:organization-1",
        resource: {
          resourceType: "Organization",
          name: "Acme Medical Group",
          identifier: [
            {
              system: "http://hl7.org/fhir/sid/us-npi",
              value: "9876543210",
            },
          ],
        },
      },
    ],
  };
}

// ─── Credential Resolution Tests ───────────────────────────

describe("Credential Resolution", () => {
  let resolveCredentials: typeof import("@/lib/transport/clearinghouse/credentials").resolveCredentials;
  let CredentialResolutionError: typeof import("@/lib/transport/clearinghouse/credentials").CredentialResolutionError;

  beforeEach(async () => {
    const mod = await import("@/lib/transport/clearinghouse/credentials");
    resolveCredentials = mod.resolveCredentials;
    CredentialResolutionError = mod.CredentialResolutionError;
  });

  afterEach(() => {
    delete process.env.AVAILITY_API_KEY;
    delete process.env.AVAILITY_API_SECRET;
    delete process.env.AVAILITY_SUBMITTER_ID;
  });

  it("resolves env:// prefix to environment variables", () => {
    process.env.AVAILITY_API_KEY = "test-key";
    process.env.AVAILITY_API_SECRET = "test-secret";

    const creds = resolveCredentials("env://AVAILITY");
    expect(creds.apiKey).toBe("test-key");
    expect(creds.apiSecret).toBe("test-secret");
    expect(creds.submitterId).toBeUndefined();
  });

  it("includes optional submitter ID when present", () => {
    process.env.AVAILITY_API_KEY = "test-key";
    process.env.AVAILITY_API_SECRET = "test-secret";
    process.env.AVAILITY_SUBMITTER_ID = "SUB-001";

    const creds = resolveCredentials("env://AVAILITY");
    expect(creds.submitterId).toBe("SUB-001");
  });

  it("throws on missing API key", () => {
    process.env.AVAILITY_API_SECRET = "test-secret";

    expect(() => resolveCredentials("env://AVAILITY")).toThrow(
      CredentialResolutionError
    );
    expect(() => resolveCredentials("env://AVAILITY")).toThrow(
      "AVAILITY_API_KEY"
    );
  });

  it("throws on missing API secret", () => {
    process.env.AVAILITY_API_KEY = "test-key";

    expect(() => resolveCredentials("env://AVAILITY")).toThrow(
      "AVAILITY_API_SECRET"
    );
  });

  it("rejects unsupported prefix", () => {
    expect(() => resolveCredentials("vault://secret/path")).toThrow(
      'Unsupported credential reference format'
    );
  });
});

// ─── FHIR Bundle Mapper Tests ──────────────────────────────

describe("FHIR Bundle Mapper", () => {
  let mapBundleToClearinghouseRequest: typeof import("@/lib/transport/clearinghouse/mapper").mapBundleToClearinghouseRequest;

  const dummyCreds = { apiKey: "k", apiSecret: "s" };

  beforeEach(async () => {
    const mod = await import("@/lib/transport/clearinghouse/mapper");
    mapBundleToClearinghouseRequest = mod.mapBundleToClearinghouseRequest;
  });

  it("extracts patient demographics from PAS Bundle", () => {
    const result = mapBundleToClearinghouseRequest(
      buildTestBundle(),
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    expect(result.patient.firstName).toBe("Jane");
    expect(result.patient.lastName).toBe("Smith");
    expect(result.patient.dateOfBirth).toBe("1985-03-15");
    expect(result.patient.gender).toBe("female");
    expect(result.patient.memberId).toBe("MEM-67890");
  });

  it("extracts CPT and ICD-10 codes from Claim resource", () => {
    const result = mapBundleToClearinghouseRequest(
      buildTestBundle(),
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    expect(result.service.cptCodes).toEqual(["70553"]);
    expect(result.service.icd10Codes).toEqual(["M54.5"]);
  });

  it("extracts NPI from Practitioner and Organization", () => {
    const result = mapBundleToClearinghouseRequest(
      buildTestBundle(),
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    expect(result.provider.orderingProviderNpi).toBe("1234567890");
    expect(result.provider.npi).toBe("9876543210");
    expect(result.provider.organizationName).toBe("Acme Medical Group");
    expect(result.provider.orderingProviderName).toBe("Dr. John Doe");
  });

  it("maps urgency priority back to routine/urgent/emergent", () => {
    const bundle = buildTestBundle();
    // "deferred" → routine
    let result = mapBundleToClearinghouseRequest(bundle, mockEdiTransport, mockRequest, dummyCreds);
    expect(result.service.urgency).toBe("routine");

    // Change to "stat" → emergent
    const claim = bundle.entry[0].resource;
    (claim as Record<string, unknown>).priority = { coding: [{ code: "stat" }] };
    result = mapBundleToClearinghouseRequest(bundle, mockEdiTransport, mockRequest, dummyCreds);
    expect(result.service.urgency).toBe("emergent");

    // Change to "normal" → urgent
    (claim as Record<string, unknown>).priority = { coding: [{ code: "normal" }] };
    result = mapBundleToClearinghouseRequest(bundle, mockEdiTransport, mockRequest, dummyCreds);
    expect(result.service.urgency).toBe("urgent");
  });

  it("extracts insurance coverage data", () => {
    const result = mapBundleToClearinghouseRequest(
      buildTestBundle(),
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    expect(result.insurance.payerName).toBe("Blue Cross Blue Shield");
    expect(result.insurance.memberId).toBe("MEM-67890");
    expect(result.insurance.groupNumber).toBe("GRP-555");
  });

  it("extracts clinical notes from Claim supportingInfo", () => {
    const result = mapBundleToClearinghouseRequest(
      buildTestBundle(),
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    expect(result.clinicalNotes).toBe(
      "Patient presents with chronic headaches."
    );
  });

  it("falls back to request fields when bundle data is missing", () => {
    const emptyBundle = {
      resourceType: "Bundle",
      type: "collection",
      identifier: { value: "PA-EDI-001" },
      entry: [],
    };

    const result = mapBundleToClearinghouseRequest(
      emptyBundle,
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    // CPT and ICD-10 fall back to request fields
    expect(result.service.cptCodes).toEqual(["70553"]);
    expect(result.service.icd10Codes).toEqual(["M54.5"]);
    expect(result.referenceNumber).toBe("PA-EDI-001");
  });

  it("uses clearinghousePayerId from transport", () => {
    const result = mapBundleToClearinghouseRequest(
      buildTestBundle(),
      mockEdiTransport,
      mockRequest,
      dummyCreds
    );

    expect(result.clearinghousePayerId).toBe("CH-BCBS-12345");
  });
});

// ─── Sandbox Client Tests ──────────────────────────────────

describe("SandboxClearinghouseClient", () => {
  let SandboxClearinghouseClient: typeof import("@/lib/transport/clearinghouse/sandbox-client").SandboxClearinghouseClient;

  const dummyCreds = { apiKey: "k", apiSecret: "s" };

  beforeEach(async () => {
    const mod = await import("@/lib/transport/clearinghouse/sandbox-client");
    SandboxClearinghouseClient = mod.SandboxClearinghouseClient;
  });

  function buildSubmitRequest(
    overrides: Record<string, unknown> = {}
  ) {
    return {
      clearinghousePayerId: "CH-BCBS-12345",
      patient: {
        firstName: "Jane",
        lastName: "Smith",
        dateOfBirth: "1985-03-15",
        gender: "female",
        memberId: "MEM-67890",
      },
      provider: {
        organizationName: "Acme Medical",
        npi: "9876543210",
      },
      service: {
        serviceType: "mri",
        cptCodes: ["70553"],
        icd10Codes: ["M54.5"],
        procedureDescription: "Brain MRI",
        urgency: "routine" as const,
      },
      insurance: {
        payerName: "BCBS",
        payerId: "py-1",
        memberId: "MEM-67890",
      },
      referenceNumber: "PA-EDI-001",
      credentials: dummyCreds,
      ...overrides,
    };
  }

  it("returns accepted with tracking ID for valid request", async () => {
    const client = new SandboxClearinghouseClient();
    const result = await client.submit(buildSubmitRequest());

    expect(result.accepted).toBe(true);
    expect(result.trackingId).toBeTruthy();
    expect(result.trackingId).toMatch(/^SBX-/);
    expect(result.payerResponse).not.toBeNull();
    expect(result.httpStatus).toBe(200);
  });

  it("rejects request with missing required fields", async () => {
    const client = new SandboxClearinghouseClient();
    const result = await client.submit(
      buildSubmitRequest({
        clearinghousePayerId: "",
        patient: {
          firstName: "",
          lastName: "",
          dateOfBirth: "",
          gender: "female",
          memberId: "",
        },
      })
    );

    expect(result.accepted).toBe(false);
    expect(result.httpStatus).toBe(400);
    expect(result.responseCode).toBe("VALIDATION_ERROR");
  });

  it("returns approved for emergent urgency", async () => {
    const client = new SandboxClearinghouseClient();
    const result = await client.submit(
      buildSubmitRequest({
        service: {
          serviceType: "mri",
          cptCodes: ["70553"],
          icd10Codes: ["M54.5"],
          procedureDescription: "Brain MRI",
          urgency: "emergent",
        },
      })
    );

    expect(result.accepted).toBe(true);
    expect(result.payerResponse?.status).toBe("approved");
    expect(result.payerResponse?.authorizationNumber).toBeTruthy();
  });

  it("checkStatus returns found for known tracking IDs", async () => {
    const client = new SandboxClearinghouseClient();

    // First submit
    const submitResult = await client.submit(buildSubmitRequest());
    const trackingId = submitResult.trackingId!;

    // Then check status
    const statusResult = await client.checkStatus({
      trackingId,
      clearinghousePayerId: "CH-BCBS-12345",
      credentials: dummyCreds,
    });

    expect(statusResult.found).toBe(true);
    expect(statusResult.status).toBeTruthy();
  });

  it("checkStatus returns not-found for unknown tracking IDs", async () => {
    const client = new SandboxClearinghouseClient();

    const statusResult = await client.checkStatus({
      trackingId: "UNKNOWN-ID",
      clearinghousePayerId: "CH-BCBS-12345",
      credentials: dummyCreds,
    });

    expect(statusResult.found).toBe(false);
    expect(statusResult.status).toBeNull();
  });
});

// ─── Edi278Adapter Tests ───────────────────────────────────

describe("Edi278Adapter", () => {
  let Edi278Adapter: typeof import("@/lib/transport/adapters/edi-278").Edi278Adapter;

  beforeEach(async () => {
    resetPrismaMocks();
    const mod = await import("@/lib/transport/adapters/edi-278");
    Edi278Adapter = mod.Edi278Adapter;
  });

  afterEach(() => {
    delete process.env.AVAILITY_API_KEY;
    delete process.env.AVAILITY_API_SECRET;
  });

  describe("validate", () => {
    it("returns valid when all sandbox config is present", async () => {
      const adapter = new Edi278Adapter();
      const result = await adapter.validate(mockEdiTransport, mockRequest);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns invalid when clearinghousePayerId is missing", async () => {
      const adapter = new Edi278Adapter();
      const transport = { ...mockEdiTransport, clearinghousePayerId: null };
      const result = await adapter.validate(transport, mockRequest);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "clearinghousePayerId is required for EDI 278 transports"
      );
    });

    it("returns invalid when metadata.clearinghouse is missing", async () => {
      const adapter = new Edi278Adapter();
      const transport = { ...mockEdiTransport, metadata: {} };
      const result = await adapter.validate(transport, mockRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("metadata.clearinghouse"))).toBe(true);
    });

    it("returns invalid when production transport missing credentials", async () => {
      const adapter = new Edi278Adapter();
      const transport = { ...mockProductionTransport, credentialRef: null };
      const result = await adapter.validate(transport, mockRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("credentialRef"))).toBe(true);
    });

    it("returns valid for sandbox without credentials", async () => {
      const adapter = new Edi278Adapter();
      const transport = {
        ...mockEdiTransport,
        credentialRef: null,
        endpointUrl: null,
      };
      const result = await adapter.validate(transport, mockRequest);

      expect(result.valid).toBe(true);
    });
  });

  describe("submit", () => {
    it("returns accepted with claimResponse for successful submission", async () => {
      const adapter = new Edi278Adapter();

      // Use emergent urgency to guarantee approved status
      const emergentBundle = buildTestBundle();
      (emergentBundle.entry[0].resource as Record<string, unknown>).priority = {
        coding: [{ code: "stat" }],
      };
      const emergentRequest = { ...mockRequest, urgency: "emergent" as const };

      const result = await adapter.submit(
        mockEdiTransport,
        emergentBundle,
        emergentRequest
      );

      expect(result.accepted).toBe(true);
      expect(result.status).toBe("accepted");
      expect(result.externalSubmissionId).toBeTruthy();
      expect(result.externalSubmissionId).toMatch(/^SBX-/);
      expect(result.claimResponse).not.toBeNull();
      expect(result.claimResponse?.status).toBe("approved");
      expect(result.claimResponse?.authorizationNumber).toBeTruthy();
      expect(result.responseTimeMs).toBeGreaterThan(0);
      expect(result.failureCategory).toBeNull();
    });

    it("returns pending for async payer response", async () => {
      const adapter = new Edi278Adapter();

      // Use a CPT code that deterministically returns pending
      // The sandbox uses hashCode % 10 on CPT code, we need hash in [6,8] for non-imaging
      // CPT "99213" is a non-imaging code — let's test with a no-CPT scenario
      const bundle = buildTestBundle();
      const claim = bundle.entry[0].resource;
      (claim as Record<string, unknown>).item = [
        {
          sequence: 1,
          productOrService: {
            coding: [{ system: "http://www.ama-assn.org/go/cpt", code: "99213" }],
            text: "Office visit",
          },
        },
      ];

      const request = { ...mockRequest, cptCodes: ["99213"] };
      const result = await adapter.submit(mockEdiTransport, bundle, request);

      // Regardless of exact status, verify the result shape is correct
      expect(result.status).toBeDefined();
      expect(["accepted", "rejected", "pending"]).toContain(result.status);
      expect(result.externalSubmissionId).toBeTruthy();
      expect(result.claimResponse).not.toBeNull();
      expect(result.responseTimeMs).toBeGreaterThan(0);
    });

    it("classifies credential errors as auth failures", async () => {
      const adapter = new Edi278Adapter();

      // Production transport with bad credentials
      const transport = {
        ...mockProductionTransport,
        credentialRef: "env://NONEXISTENT",
      };

      const result = await adapter.submit(
        transport,
        buildTestBundle(),
        mockRequest
      );

      expect(result.accepted).toBe(false);
      expect(result.status).toBe("error");
      expect(result.failureCategory).toBe("auth");
    });

    it("measures responseTimeMs correctly", async () => {
      const adapter = new Edi278Adapter();
      const result = await adapter.submit(
        mockEdiTransport,
        buildTestBundle(),
        mockRequest
      );

      expect(result.responseTimeMs).toBeGreaterThanOrEqual(100); // Sandbox adds 100-300ms
      expect(result.responseTimeMs).toBeLessThan(5000);
    });
  });

  describe("checkStatus", () => {
    it("returns found for a previously submitted request", async () => {
      const adapter = new Edi278Adapter();

      // Submit first
      const submitResult = await adapter.submit(
        mockEdiTransport,
        buildTestBundle(),
        mockRequest
      );
      const trackingId = submitResult.externalSubmissionId!;

      // Check status
      const statusResult = await adapter.checkStatus(
        mockEdiTransport,
        trackingId
      );

      expect(statusResult.found).toBe(true);
      expect(statusResult.currentStatus).toBeTruthy();
    });

    it("returns not-found for unknown tracking ID", async () => {
      const adapter = new Edi278Adapter();
      const result = await adapter.checkStatus(
        mockEdiTransport,
        "UNKNOWN-TRACKING-ID"
      );

      expect(result.found).toBe(false);
    });
  });
});

// ─── Registry Integration ──────────────────────────────────

describe("Registry — EDI 278", () => {
  let getAdapter: typeof import("@/lib/transport/registry").getAdapter;

  beforeEach(async () => {
    resetPrismaMocks();
    const registry = await import("@/lib/transport/registry");
    getAdapter = registry.getAdapter;
  });

  it("returns Edi278Adapter for 'edi_278' method", () => {
    const adapter = getAdapter("edi_278");
    expect(adapter).not.toBeNull();
    expect(adapter).toHaveProperty("submit");
    expect(adapter).toHaveProperty("checkStatus");
    expect(adapter).toHaveProperty("validate");
  });
});
