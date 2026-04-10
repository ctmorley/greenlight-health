import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { generateReferenceNumber } from "@/lib/reference-number";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { guardSubscription } from "@/lib/billing";
import { decryptPatientRecord, buildPatientHashSearch } from "@/lib/security/phi-crypto";

const VALID_STATUSES = [
  "draft", "submitted", "pending_review", "approved",
  "partially_approved", "denied", "appealed", "expired", "cancelled",
] as const;

const VALID_SERVICE_CATEGORIES = ["imaging", "surgical", "medical"] as const;

const VALID_SERVICE_TYPES = [
  "mri", "ct", "pet_ct", "ultrasound", "xray", "fluoroscopy",
  "mammography", "dexa", "nuclear", "surgical_procedure", "medical_procedure",
] as const;

const VALID_URGENCIES = ["routine", "urgent", "emergent"] as const;

const VALID_SORT_FIELDS = ["createdAt", "dueDate", "status", "patientName"] as const;

const requestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(""),
  status: z
    .string()
    .optional()
    .default("")
    .transform((v) => v ? v.split(",").filter(Boolean) : [])
    .pipe(z.array(z.enum(VALID_STATUSES))),
  serviceCategory: z.enum(VALID_SERVICE_CATEGORIES).or(z.literal("")).optional().default(""),
  serviceType: z.enum(VALID_SERVICE_TYPES).or(z.literal("")).optional().default(""),
  payerId: z.string().optional().default(""),
  urgency: z.enum(VALID_URGENCIES).or(z.literal("")).optional().default(""),
  dateFrom: z
    .string()
    .optional()
    .default("")
    .refine((v) => v === "" || !isNaN(Date.parse(v)), { message: "Invalid dateFrom format" }),
  dateTo: z
    .string()
    .optional()
    .default("")
    .refine((v) => v === "" || !isNaN(Date.parse(v)), { message: "Invalid dateTo format" }),
  sortBy: z.enum(VALID_SORT_FIELDS).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

const createRequestSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  serviceCategory: z.enum(VALID_SERVICE_CATEGORIES).optional().nullable(),
  serviceType: z.enum(VALID_SERVICE_TYPES).optional().nullable(),
  cptCodes: z.array(z.string()).default([]),
  icd10Codes: z.array(z.string()).default([]),
  procedureDescription: z.string().optional().default(""),
  payerId: z.string().optional().nullable(),
  insuranceId: z.string().optional().nullable(),
  urgency: z.enum(VALID_URGENCIES).optional().default("routine"),
  clinicalNotes: z.string().optional().default(""),
  orderingPhysicianId: z.string().optional().nullable(),
  renderingPhysicianNpi: z.string().optional().nullable(),
  facilityName: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  // Step tracking for draft persistence
  currentStep: z.number().int().min(1).max(5).optional(),
});

/**
 * Build a Prisma OR condition that supports full-name search.
 * Uses blind-index hash columns for patient PHI fields;
 * referenceNumber stays as a plaintext contains search (not PHI).
 */
function buildSearchCondition(search: string): Prisma.PriorAuthRequestWhereInput | undefined {
  if (!search) return undefined;

  const patientHashConditions = buildPatientHashSearch(search);

  return {
    OR: [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      ...patientHashConditions.map((c) => ({
        patient: c as Prisma.PatientWhereInput,
      })),
    ],
  };
}

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "PriorAuthRequest", null, "Listed PA requests").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  // Parse and validate query params
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());
  const parsed = requestsQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const {
    page, pageSize, search, status: statuses, serviceCategory,
    serviceType, payerId, urgency, dateFrom, dateTo, sortBy, sortOrder,
  } = parsed.data;

  try {
    const skip = (page - 1) * pageSize;

    const where: Prisma.PriorAuthRequestWhereInput = {
      organizationId,
    };

    const searchCondition = buildSearchCondition(search);
    if (searchCondition) {
      Object.assign(where, searchCondition);
    }

    if (statuses.length > 0) {
      where.status = { in: statuses };
    }

    if (serviceCategory) {
      where.serviceCategory = serviceCategory as "imaging" | "surgical" | "medical";
    }

    if (serviceType) {
      where.serviceType = serviceType as "mri" | "ct" | "pet_ct" | "ultrasound" | "xray" | "fluoroscopy" | "mammography" | "dexa" | "nuclear" | "surgical_procedure" | "medical_procedure";
    }

    if (payerId) {
      where.payerId = payerId;
    }

    if (urgency) {
      where.urgency = urgency as Prisma.EnumUrgencyFilter["equals"];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    let orderBy: Prisma.PriorAuthRequestOrderByWithRelationInput;
    switch (sortBy) {
      case "dueDate":
        orderBy = { dueDate: { sort: sortOrder, nulls: "last" } };
        break;
      case "status":
        orderBy = { status: sortOrder };
        break;
      case "patientName":
        // Sort by blind-index hash — deterministic and populated for all rows.
        // Not alphabetical, but avoids NULL-sort issues from dropped plaintext columns.
        orderBy = { patient: { lastNameHash: { sort: sortOrder, nulls: "last" } } };
        break;
      case "createdAt":
      default:
        orderBy = { createdAt: sortOrder };
        break;
    }

    const [requests, totalCount, statusCounts] = await Promise.all([
      prisma.priorAuthRequest.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              firstNameEncrypted: true,
              lastNameEncrypted: true,
              mrnEncrypted: true,
            },
          },
          payer: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.priorAuthRequest.count({ where }),
      prisma.priorAuthRequest.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    const statusCountsMap: Record<string, number> = {};
    for (const sc of statusCounts) {
      statusCountsMap[sc.status] = sc._count._all;
    }

    return NextResponse.json({
      requests: requests.map((r) => {
        const patient = decryptPatientRecord(r.patient);
        return {
        id: r.id,
        referenceNumber: r.referenceNumber,
        status: r.status,
        urgency: r.urgency,
        serviceCategory: r.serviceCategory || null,
        serviceType: r.serviceType || null,
        cptCodes: r.cptCodes,
        patient: {
          id: patient.id,
          name: `${patient.firstName} ${patient.lastName}`,
          mrn: patient.mrn,
        },
        payer: r.payer ? {
          id: r.payer.id,
          name: r.payer.name,
        } : null,
        createdBy: `${r.createdBy.firstName} ${r.createdBy.lastName}`,
        createdAt: r.createdAt.toISOString(),
        dueDate: r.dueDate?.toISOString() || null,
        submittedAt: r.submittedAt?.toISOString() || null,
        scheduledDate: r.scheduledDate?.toISOString() || null,
      };
      }),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
      statusCounts: statusCountsMap,
    });
  } catch (error) {
    console.error("Requests list error:", error);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Insufficient permissions. Viewers cannot create PA requests." },
      { status: 403 }
    );
  }

  auditPhiAccess(request, session, "create", "PriorAuthRequest", null, "Created PA request").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  // Check subscription limits
  const blocked = await guardSubscription(organizationId, "create_pa");
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const parsed = createRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify patient belongs to this org
    const patient = await prisma.patient.findFirst({
      where: { id: data.patientId, organizationId },
    });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Verify insurance belongs to this patient (if provided)
    if (data.insuranceId) {
      const insurance = await prisma.patientInsurance.findFirst({
        where: { id: data.insuranceId, patientId: data.patientId },
      });
      if (!insurance) {
        return NextResponse.json({ error: "Insurance not found for this patient" }, { status: 404 });
      }
    }

    // Verify payer exists and belongs to this org (or is global)
    let payer = null;
    if (data.payerId) {
      payer = await prisma.payer.findFirst({
        where: {
          id: data.payerId,
          OR: [{ organizationId }, { organizationId: null }],
        },
      });
      if (!payer) {
        return NextResponse.json({ error: "Payer not found" }, { status: 404 });
      }
    }

    const referenceNumber = await generateReferenceNumber();

    // Store current step in draftMetadata (separate from aiAuditResult)
    const draftMetadata = data.currentStep ? { currentStep: data.currentStep } : undefined;

    const [newRequest] = await prisma.$transaction(async (tx) => {
      const created = await tx.priorAuthRequest.create({
        data: {
          organizationId,
          patientId: data.patientId,
          createdById: session.user.id,
          referenceNumber,
          status: "draft",
          urgency: data.urgency as "routine" | "urgent" | "emergent",
          serviceCategory: (data.serviceCategory as "imaging" | "surgical" | "medical") || null,
          serviceType: (data.serviceType as "mri" | "ct" | "pet_ct" | "ultrasound" | "xray" | "fluoroscopy" | "mammography" | "dexa" | "nuclear" | "surgical_procedure" | "medical_procedure") || null,
          cptCodes: data.cptCodes,
          icd10Codes: data.icd10Codes,
          procedureDescription: data.procedureDescription || null,
          payerId: data.payerId || null,
          insuranceId: data.insuranceId || null,
          clinicalNotes: data.clinicalNotes || null,
          orderingPhysicianId: data.orderingPhysicianId || null,
          renderingPhysicianNpi: data.renderingPhysicianNpi || null,
          facilityName: data.facilityName || null,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          rbmVendor: payer?.rbmVendor || null,
          draftMetadata,
        },
      });

      // Create initial status change entry (transactional with request creation)
      const statusChange = await tx.authStatusChange.create({
        data: {
          priorAuthId: created.id,
          changedById: session.user.id,
          fromStatus: "draft",
          toStatus: "draft",
          note: "PA request created as draft",
        },
      });

      return [created, statusChange] as const;
    });

    return NextResponse.json({
      id: newRequest.id,
      referenceNumber: newRequest.referenceNumber,
      status: newRequest.status,
    }, { status: 201 });
  } catch (error) {
    console.error("Create request error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
}
