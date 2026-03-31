/**
 * Tests for GET/POST /api/patients
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetPrismaMocks } from "../../helpers/mock-prisma";
import {
  createGetRequest,
  createPostRequest,
  mockSession,
  parseResponse,
} from "../../helpers/request";
import {
  createMockSession,
  createMockPatient,
  createMockPayer,
} from "../../helpers/factories";
import { GET, POST } from "@/app/api/patients/route";

describe("GET /api/patients", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createGetRequest("/api/patients");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no organization context", async () => {
    mockSession(createMockSession({ organizationId: "" }));
    const req = createGetRequest("/api/patients");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns paginated patients scoped to organization", async () => {
    const patient = {
      ...createMockPatient({ id: "p1" }),
      insurances: [
        {
          planName: "Gold PPO",
          payer: { name: "Aetna" },
          memberId: "MEM-001",
        },
      ],
      _count: { requests: 3 },
    };

    prismaMock.patient.findMany.mockResolvedValueOnce([patient]);
    prismaMock.patient.count.mockResolvedValueOnce(1);

    const req = createGetRequest("/api/patients");
    const res = await GET(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(data.patients).toHaveLength(1);
    expect(data.patients[0].name).toBe("John Doe");
    expect(data.patients[0].primaryInsurance).not.toBeNull();
    expect(data.patients[0].paCount).toBe(3);
    expect(data.pagination.totalCount).toBe(1);
  });

  it("filters patients by search term", async () => {
    prismaMock.patient.findMany.mockResolvedValueOnce([]);
    prismaMock.patient.count.mockResolvedValueOnce(0);

    const req = createGetRequest("/api/patients", { search: "John" });
    await GET(req);

    const call = prismaMock.patient.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
    expect(call.where.OR).toBeDefined();
  });

  it("verifies org scoping in query", async () => {
    prismaMock.patient.findMany.mockResolvedValueOnce([]);
    prismaMock.patient.count.mockResolvedValueOnce(0);

    const req = createGetRequest("/api/patients");
    await GET(req);

    const call = prismaMock.patient.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
  });
});

describe("POST /api/patients", () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockSession(createMockSession());
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession(null);
    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      lastName: "Smith",
      dob: "1990-01-01",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates a patient successfully", async () => {
    const patient = {
      ...createMockPatient({ id: "new-patient", firstName: "Jane", lastName: "Smith" }),
      insurances: [],
    };
    prismaMock.patient.create.mockResolvedValueOnce(patient);

    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      lastName: "Smith",
      dob: "1990-01-01",
      gender: "female",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.firstName).toBe("Jane");
    expect(data.lastName).toBe("Smith");
    expect(data.name).toBe("Jane Smith");
  });

  it("creates patient with inline insurance", async () => {
    const payer = createMockPayer({ id: "py1" });
    const patient = {
      ...createMockPatient({ id: "p-with-ins" }),
      insurances: [
        {
          id: "ins-1",
          payerId: "py1",
          payer: { id: "py1", name: "Aetna" },
          planName: "Gold PPO",
          planType: "ppo",
          memberId: "MEM-001",
          groupNumber: "GRP-001",
          isPrimary: true,
          effectiveDate: new Date("2024-01-01"),
        },
      ],
    };
    prismaMock.patient.create.mockResolvedValueOnce(patient);

    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      lastName: "Smith",
      dob: "1990-01-01",
      insurance: {
        payerId: "py1",
        planName: "Gold PPO",
        planType: "ppo",
        memberId: "MEM-001",
        effectiveDate: "2024-01-01",
      },
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.insurances).toHaveLength(1);
  });

  it("returns 400 for missing required fields", async () => {
    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      // missing lastName, dob
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate MRN in same org", async () => {
    prismaMock.patient.findFirst.mockResolvedValueOnce(
      createMockPatient({ mrn: "MRN-DUP" })
    );

    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      lastName: "Smith",
      dob: "1990-01-01",
      mrn: "MRN-DUP",
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("auto-generates MRN when not provided", async () => {
    const patient = {
      ...createMockPatient({ mrn: "AUTO-1234567890-ABCDE" }),
      insurances: [],
    };
    prismaMock.patient.create.mockResolvedValueOnce(patient);

    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      lastName: "Smith",
      dob: "1990-01-01",
    });
    const res = await POST(req);
    const data = await parseResponse(res);

    expect(res.status).toBe(201);
    expect(data.mrn).toBeDefined();
  });

  it("returns 400 for invalid date of birth", async () => {
    const req = createPostRequest("/api/patients", {
      firstName: "Jane",
      lastName: "Smith",
      dob: "not-a-date",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
