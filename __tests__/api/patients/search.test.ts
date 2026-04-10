/**
 * Tests for GET /api/patients/search
 *
 * Search now uses blind-index exact match (not fuzzy contains).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPatient } from "../../helpers/factories";
import { buildPatientHashSearch } from "@/lib/security/phi-crypto";
import { GET } from "@/app/api/patients/search/route";

describe("GET /api/patients/search", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
    // Default: return a hash condition so search actually queries the DB
    vi.mocked(buildPatientHashSearch).mockReturnValue([
      { lastNameHash: "hash:search-term" },
      { firstNameHash: "hash:search-term" },
      { mrnHash: "hash:search-term" },
      { emailHash: "hash:search-term" },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/patients/search", { q: "John" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("searches patients via blind index and returns results", async () => {
    const patient = {
      ...createMockPatient({ id: "p1", firstName: "John", lastName: "Doe" }),
      insurances: [
        {
          planName: "Gold PPO",
          payer: { name: "Aetna" },
        },
      ],
    };
    prismaMock.patient.findMany.mockResolvedValueOnce([patient]);

    const req = createGetRequest("/api/patients/search", { q: "John" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.patients).toHaveLength(1);
    expect(data.patients[0].name).toBe("John Doe");
    expect(buildPatientHashSearch).toHaveBeenCalledWith("John");
  });

  it("searches patients by MRN via blind index", async () => {
    const patient = {
      ...createMockPatient({ id: "p1", mrn: "MRN-12345" }),
      insurances: [],
    };
    prismaMock.patient.findMany.mockResolvedValueOnce([patient]);

    const req = createGetRequest("/api/patients/search", { q: "MRN-12345" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.patients).toHaveLength(1);
    expect(data.patients[0].mrn).toBe("MRN-12345");
  });

  it("returns empty array for too-short query", async () => {
    const req = createGetRequest("/api/patients/search", { q: "J" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.patients).toEqual([]);
  });

  it("passes hash conditions as OR clause in where", async () => {
    prismaMock.patient.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/patients/search", { q: "John" });
    await GET(req);

    const call = prismaMock.patient.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR.length).toBeGreaterThan(0);
  });

  it("returns patients with primary insurance info", async () => {
    const patient = {
      ...createMockPatient({ id: "p1" }),
      insurances: [
        {
          planName: "Gold PPO",
          payer: { name: "Aetna" },
        },
      ],
    };
    prismaMock.patient.findMany.mockResolvedValueOnce([patient]);

    const req = createGetRequest("/api/patients/search", { q: "John" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(data.patients[0].primaryInsurance).not.toBeNull();
    expect(data.patients[0].primaryInsurance.payerName).toBe("Aetna");
  });

  it("returns empty when buildPatientHashSearch returns no conditions", async () => {
    vi.mocked(buildPatientHashSearch).mockReturnValueOnce([]);

    const req = createGetRequest("/api/patients/search", { q: "xx" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(data.patients).toEqual([]);
    // Should not call findMany when there are no hash conditions
    expect(prismaMock.patient.findMany).not.toHaveBeenCalled();
  });

  it("cross-org patient not returned (org scoping verified)", async () => {
    prismaMock.patient.findMany.mockResolvedValueOnce([]);

    mockSession(createMockSession({ organizationId: "org-A" }));
    const req = createGetRequest("/api/patients/search", { q: "John" });
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(data.patients).toHaveLength(0);

    const call = prismaMock.patient.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-A");
  });
});
