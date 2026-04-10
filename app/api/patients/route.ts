import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  encryptPatientFields,
  encryptInsuranceFields,
  decryptPatientRecord,
  decryptInsuranceRecord,
  buildPatientHashSearch,
  blindIndex,
} from "@/lib/security/phi-crypto";

const patientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(""),
});

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "Patient", null, "Listed patients").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());
  const parsed = patientsQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { page, pageSize, search } = parsed.data;

  try {
    const skip = (page - 1) * pageSize;

    // Always scoped to organization
    const where: Prisma.PatientWhereInput = {
      organizationId,
    };

    // Search via blind indexes (exact match on MRN, email, first+last name)
    if (search) {
      const hashConditions = buildPatientHashSearch(search);
      if (hashConditions.length > 0) {
        where.OR = hashConditions as Prisma.PatientWhereInput[];
      }
    }

    const [patients, totalCount] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          insurances: {
            where: { isPrimary: true },
            include: {
              payer: { select: { name: true } },
            },
            take: 1,
          },
          _count: {
            select: { requests: true },
          },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      patients: patients.map((p) => {
        // Dual-read: decrypt if encrypted fields present, fall back to plaintext
        const d = decryptPatientRecord(p);
        return {
          id: d.id,
          firstName: d.firstName,
          lastName: d.lastName,
          name: `${d.firstName} ${d.lastName}`,
          mrn: d.mrn,
          dob: d.dob instanceof Date ? d.dob.toISOString() : String(d.dob),
          gender: d.gender,
          phone: d.phone,
          email: d.email,
          primaryInsurance: p.insurances[0]
            ? {
                planName: p.insurances[0].planName,
                payerName: p.insurances[0].payer.name,
                memberId: decryptInsuranceRecord(p.insurances[0]).memberId,
              }
            : null,
          paCount: p._count.requests,
        };
      }),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Patients list error:", error);
    return NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 });
  }
}

// ─── POST: Create a new patient ────────────────────────────────

const emptyToNull = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  z.string().nullable().optional()
);

const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mrn: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    z.string().nullable().optional()
  ),
  dob: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date of birth" }),
  gender: z.enum(["male", "female", "other", "unknown"]).optional().default("unknown"),
  phone: emptyToNull,
  email: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    z.string().email().nullable().optional()
  ),
  address: emptyToNull,
  // Optional inline insurance
  insurance: z
    .object({
      payerId: z.string().min(1),
      planName: z.string().min(1),
      planType: z.enum(["hmo", "ppo", "epo", "pos", "medicaid", "medicare", "tricare", "other"]).optional().default("other"),
      memberId: z.string().min(1),
      groupNumber: z.string().optional().nullable(),
      effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid effective date" }),
    })
    .optional()
    .nullable(),
});

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Insufficient permissions. Viewers cannot create patients." },
      { status: 403 }
    );
  }

  auditPhiAccess(request, session, "create", "Patient", null, "Created patient").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createPatientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid patient data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Auto-generate MRN if not provided
    const mrn = data.mrn || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    // Check if MRN already exists for this org (via blind-index hash)
    if (data.mrn) {
      const existingPatient = await prisma.patient.findFirst({
        where: {
          organizationId,
          mrnHash: blindIndex(mrn),
        },
      });

      if (existingPatient) {
        return NextResponse.json(
          { error: "A patient with this MRN already exists in your organization" },
          { status: 409 }
        );
      }
    }

    // Dual-write: plaintext + encrypted/hash columns
    const phiFields = encryptPatientFields({
      firstName: data.firstName,
      lastName: data.lastName,
      mrn,
      dob: data.dob,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
    });

    const insurancePhiFields = data.insurance
      ? encryptInsuranceFields({
          memberId: data.insurance.memberId,
          groupNumber: data.insurance.groupNumber || null,
        })
      : {};

    // Create patient (and insurance if provided)
    // Plaintext PHI columns are no longer written — encrypted + hash only
    const patient = await prisma.patient.create({
      data: {
        organizationId,
        gender: data.gender,
        ...phiFields,
        ...(data.insurance
          ? {
              insurances: {
                create: {
                  payerId: data.insurance.payerId,
                  planName: data.insurance.planName,
                  planType: data.insurance.planType,
                  ...insurancePhiFields,
                  isPrimary: true,
                  effectiveDate: new Date(data.insurance.effectiveDate),
                },
              },
            }
          : {}),
      },
      include: {
        insurances: {
          include: {
            payer: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Dual-read: decrypt the freshly created patient + insurance records
    const dp = decryptPatientRecord(patient);
    return NextResponse.json(
      {
        id: dp.id,
        firstName: dp.firstName,
        lastName: dp.lastName,
        name: `${dp.firstName} ${dp.lastName}`,
        mrn: dp.mrn,
        dob: dp.dob instanceof Date ? dp.dob.toISOString() : String(dp.dob),
        gender: dp.gender,
        insurances: patient.insurances.map((ins) => {
          const di = decryptInsuranceRecord(ins);
          return {
            id: di.id,
            payerId: di.payerId,
            payerName: ins.payer.name,
            planName: di.planName,
            planType: di.planType,
            memberId: di.memberId,
            groupNumber: di.groupNumber,
            isPrimary: di.isPrimary,
            effectiveDate: di.effectiveDate instanceof Date ? di.effectiveDate.toISOString() : String(di.effectiveDate),
          };
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create patient error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create patient" }, { status: 500 });
  }
}
