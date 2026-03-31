/**
 * Tests for GET /api/patients/search
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import { createMockSession, createMockPatient } from "../../helpers/factories";
import { GET } from "@/app/api/patients/search/route";

describe("GET /api/patients/search", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/patients/search", { q: "John" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("searches patients by name", async () => {
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
  });

  it("searches patients by MRN", async () => {
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

  it("verifies org scoping in search query", async () => {
    prismaMock.patient.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/patients/search", { q: "John" });
    await GET(req);

    const call = prismaMock.patient.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
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

  it("handles full-name search with two tokens", async () => {
    prismaMock.patient.findMany.mockResolvedValueOnce([]);

    const req = createGetRequest("/api/patients/search", { q: "John Doe" });
    await GET(req);

    const call = prismaMock.patient.findMany.mock.calls[0][0];
    // With 2 tokens, should use AND conditions for first/last name
    expect(call.where.OR).toBeDefined();
  });

  it("cross-org patient not returned (org scoping verified)", async () => {
    // Simulate patient from different org - findMany returns empty
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
