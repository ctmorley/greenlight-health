/**
 * Tests for GET /api/patients/[id]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  mockSession,
  createParams,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPatient } from "../../helpers/factories";
import { GET } from "@/app/api/patients/[id]/route";

const params = createParams({ id: "patient-1" });

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
