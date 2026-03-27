import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const patientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(""),
});

/**
 * Build search condition supporting full-name search for patients.
 */
function buildPatientSearchCondition(search: string): Prisma.PatientWhereInput | undefined {
  if (!search) return undefined;

  const tokens = search.split(/\s+/).filter(Boolean);

  if (tokens.length >= 2) {
    const firstToken = tokens[0];
    const lastTokens = tokens.slice(1).join(" ");

    return {
      OR: [
        {
          AND: [
            { firstName: { contains: firstToken, mode: "insensitive" } },
            { lastName: { contains: lastTokens, mode: "insensitive" } },
          ],
        },
        {
          AND: [
            { lastName: { contains: firstToken, mode: "insensitive" } },
            { firstName: { contains: lastTokens, mode: "insensitive" } },
          ],
        },
        { mrn: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  return {
    OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { mrn: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const searchCondition = buildPatientSearchCondition(search);
    if (searchCondition) {
      Object.assign(where, searchCondition);
    }

    const [patients, totalCount] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { lastName: "asc" },
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
      patients: patients.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        name: `${p.firstName} ${p.lastName}`,
        mrn: p.mrn,
        dob: p.dob.toISOString(),
        gender: p.gender,
        phone: p.phone,
        email: p.email,
        primaryInsurance: p.insurances[0]
          ? {
              planName: p.insurances[0].planName,
              payerName: p.insurances[0].payer.name,
              memberId: p.insurances[0].memberId,
            }
          : null,
        paCount: p._count.requests,
      })),
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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Check if MRN already exists for this org
    if (data.mrn) {
      const existingPatient = await prisma.patient.findFirst({
        where: { organizationId, mrn },
      });

      if (existingPatient) {
        return NextResponse.json(
          { error: "A patient with this MRN already exists in your organization" },
          { status: 409 }
        );
      }
    }

    // Create patient (and insurance if provided)
    const patient = await prisma.patient.create({
      data: {
        organizationId,
        firstName: data.firstName,
        lastName: data.lastName,
        mrn,
        dob: new Date(data.dob),
        gender: data.gender,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        ...(data.insurance
          ? {
              insurances: {
                create: {
                  payerId: data.insurance.payerId,
                  planName: data.insurance.planName,
                  planType: data.insurance.planType,
                  memberId: data.insurance.memberId,
                  groupNumber: data.insurance.groupNumber || null,
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

    return NextResponse.json(
      {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        name: `${patient.firstName} ${patient.lastName}`,
        mrn: patient.mrn,
        dob: patient.dob.toISOString(),
        gender: patient.gender,
        insurances: patient.insurances.map((ins) => ({
          id: ins.id,
          payerId: ins.payerId,
          payerName: ins.payer.name,
          planName: ins.planName,
          planType: ins.planType,
          memberId: ins.memberId,
          groupNumber: ins.groupNumber,
          isPrimary: ins.isPrimary,
          effectiveDate: ins.effectiveDate.toISOString(),
        })),
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
