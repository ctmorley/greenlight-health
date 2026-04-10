/**
 * Tests for GET/PATCH /api/patients/[id]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPatchRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPatient } from "../../helpers/factories";
import { GET, PATCH } from "@/app/api/patients/[id]/route";

const params = createParams({ id: "patient-1" });

// ─── GET /api/patients/[id] ──────────────────────────────────

describe("GET /api/patients/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/patients/patient-1");
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it("returns patient details with relations", async () => {
    const patient = {
      ...createMockPatient({ id: "patient-1" }),
      organization: { id: "org-1", name: "Test Org" },
      insurances: [
        {
          id: "ins-1",
          planName: "Gold PPO",
          planType: "ppo",
          memberId: "MEM-001",
          groupNumber: "GRP-001",
          isPrimary: true,
          effectiveDate: new Date("2024-01-01"),
          terminationDate: null,
          payer: { id: "py1", name: "Aetna" },
        },
      ],
      requests: [],
    };

    prismaMock.patient.findFirst.mockResolvedValueOnce(patient);

    const req = createGetRequest("/api/patients/patient-1");
    const res = await GET(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.id).toBe("patient-1");
    expect(data.firstName).toBe("John");
    expect(data.lastName).toBe("Doe");
    expect(data.insurances).toHaveLength(1);
    expect(data.insurances[0].payer.name).toBe("Aetna");
  });

  it("returns 404 for patient from different org (cross-org isolation)", async () => {
    prismaMock.patient.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/patients/other-org-patient");
    const res = await GET(req, createParams({ id: "other-org-patient" }));
    expect(res.status).toBe(404);

    // Verify org scoping
    const call = prismaMock.patient.findFirst.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
  });

  it("returns 404 for non-existent patient", async () => {
    prismaMock.patient.findFirst.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/patients/nonexistent");
    const res = await GET(req, createParams({ id: "nonexistent" }));
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/patients/[id] ────────────────────────────────

describe("PATCH /api/patients/[id]", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPatchRequest("/api/patients/patient-1", { firstName: "Jane" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("updates patient demographics successfully", async () => {
    const existing = createMockPatient({ id: "patient-1" });
    prismaMock.patient.findFirst.mockResolvedValueOnce(existing);

    const updated = {
      ...existing,
      firstName: "Jane",
      updatedAt: new Date(),
    };
    prismaMock.patient.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/patients/patient-1", { firstName: "Jane" });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.firstName).toBe("Jane");
    expect(data.name).toBe("Jane Doe");
  });

  it("updates multiple demographic fields", async () => {
    const existing = createMockPatient({ id: "patient-1" });
    prismaMock.patient.findFirst.mockResolvedValueOnce(existing);

    const updated = {
      ...existing,
      phone: "555-0200",
      email: "jane@test.com",
      address: "456 Oak Ave",
      updatedAt: new Date(),
    };
    prismaMock.patient.update.mockResolvedValueOnce(updated);

    const req = createPatchRequest("/api/patients/patient-1", {
      phone: "555-0200",
      email: "jane@test.com",
      address: "456 Oak Ave",
    });
    const res = await PATCH(req, params);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.phone).toBe("555-0200");
    expect(data.email).toBe("jane@test.com");
  });

  it("returns 404 for patient from different org", async () => {
    prismaMock.patient.findFirst.mockResolvedValueOnce(null);

    const req = createPatchRequest("/api/patients/patient-1", { firstName: "Jane" });
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);

    // Verify org scoping
    const call = prismaMock.patient.findFirst.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
  });

  it("returns 400 for invalid data", async () => {
    const req = createPatchRequest("/api/patients/patient-1", {
      email: "not-an-email",
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid fields provided", async () => {
    const existing = createMockPatient({ id: "patient-1" });
    prismaMock.patient.findFirst.mockResolvedValueOnce(existing);

    const req = createPatchRequest("/api/patients/patient-1", {
      mrn: "cannot-change-mrn", // MRN is not an allowed field
    });
    const res = await PATCH(req, params);
    // Zod strips unknown fields, so no valid fields remain
    expect(res.status).toBe(400);
  });

  it("validates gender enum values", async () => {
    const req = createPatchRequest("/api/patients/patient-1", {
      gender: "invalid_gender",
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("validates date of birth format", async () => {
    const req = createPatchRequest("/api/patients/patient-1", {
      dob: "not-a-date",
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });
});
