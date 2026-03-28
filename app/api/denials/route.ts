import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const queryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  reasonCategory: z.enum(["medical_necessity", "incomplete_documentation", "out_of_network", "service_not_covered", "missing_precert", "coding_error", "other", ""]).default(""),
  payerId: z.string().default(""),
  dateFrom: z.string().refine((v) => v === "" || !isNaN(Date.parse(v)), { message: "Invalid dateFrom format" }).default(""),
  dateTo: z.string().refine((v) => v === "" || !isNaN(Date.parse(v)), { message: "Invalid dateTo format" }).default(""),
  appealStatus: z.enum(["none", "pending", "won", "lost", ""]).default(""),
  search: z.string().default(""),
  sortBy: z.enum(["denialDate", "reasonCategory", "createdAt"]).default("denialDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * GET /api/denials
 * Denial management queue — lists all denied PAs with denial details.
 * Supports filtering by reason category, payer, date range, and appeal status.
 * All queries are scoped to the authenticated user's organization.
 */
export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "Denial", null, "Listed denials").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawParams = Object.fromEntries(searchParams.entries());
    const paramsParsed = queryParamsSchema.safeParse(rawParams);

    if (!paramsParsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: paramsParsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { page, pageSize, reasonCategory, payerId, dateFrom, dateTo, appealStatus, search, sortBy, sortOrder } = paramsParsed.data;

    // Build the denial where clause
    const denialWhere: Record<string, unknown> = {};

    if (reasonCategory) {
      denialWhere.reasonCategory = reasonCategory;
    }

    if (dateFrom || dateTo) {
      denialWhere.denialDate = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setUTCHours(0, 0, 0, 0);
        (denialWhere.denialDate as Record<string, unknown>).gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setUTCHours(23, 59, 59, 999);
        (denialWhere.denialDate as Record<string, unknown>).lte = to;
      }
    }

    // Build the priorAuth where clause — always scoped to the user's organization
    const priorAuthWhere: Record<string, unknown> = {
      organizationId,
      status: { in: ["denied", "appealed"] },
    };

    if (payerId) {
      priorAuthWhere.payerId = payerId;
    }

    if (search) {
      priorAuthWhere.OR = [
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { patient: { firstName: { contains: search, mode: "insensitive" } } },
        { patient: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    denialWhere.priorAuth = priorAuthWhere;

    // Encode appeal status filter directly in the Prisma where clause
    // so that pagination and counts are correct
    if (appealStatus) {
      if (appealStatus === "none") {
        denialWhere.appeals = { none: {} };
      } else if (appealStatus === "pending") {
        denialWhere.appeals = {
          some: { status: { in: ["draft", "filed", "in_review"] } },
        };
      } else if (appealStatus === "won") {
        denialWhere.appeals = { some: { status: "won" } };
      } else if (appealStatus === "lost") {
        denialWhere.appeals = { some: { status: "lost" } };
      }
    }

    // Count total for pagination — uses the same where clause including appeal status
    const totalCount = await prisma.denial.count({ where: denialWhere });

    // Build orderBy
    let orderBy: Record<string, unknown> = { denialDate: sortOrder };
    if (sortBy === "reasonCategory") {
      orderBy = { reasonCategory: sortOrder };
    } else if (sortBy === "createdAt") {
      orderBy = { createdAt: sortOrder };
    }

    // Fetch denials with related data — pagination applied after filtering
    const denials = await prisma.denial.findMany({
      where: denialWhere,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        priorAuth: {
          select: {
            id: true,
            referenceNumber: true,
            status: true,
            urgency: true,
            serviceType: true,
            patient: {
              select: { firstName: true, lastName: true, mrn: true },
            },
            payer: {
              select: { id: true, name: true },
            },
          },
        },
        appeals: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            appealLevel: true,
            filedDate: true,
            decisionDate: true,
          },
        },
      },
    });

    const result = denials.map((d) => ({
      id: d.id,
      denialDate: d.denialDate.toISOString(),
      reasonCode: d.reasonCode,
      reasonCategory: d.reasonCategory,
      reasonDescription: d.reasonDescription,
      payerNotes: d.payerNotes,
      priorAuth: {
        id: d.priorAuth.id,
        referenceNumber: d.priorAuth.referenceNumber,
        status: d.priorAuth.status,
        urgency: d.priorAuth.urgency,
        serviceType: d.priorAuth.serviceType,
        patientName: `${d.priorAuth.patient.firstName} ${d.priorAuth.patient.lastName}`,
        patientMrn: d.priorAuth.patient.mrn,
        payerName: d.priorAuth.payer?.name || null,
        payerId: d.priorAuth.payer?.id || null,
      },
      latestAppeal: d.appeals.length > 0
        ? {
            id: d.appeals[0].id,
            status: d.appeals[0].status,
            appealLevel: d.appeals[0].appealLevel,
            filedDate: d.appeals[0].filedDate.toISOString(),
            decisionDate: d.appeals[0].decisionDate?.toISOString() || null,
          }
        : null,
    }));

    // Reason category counts for filter badges — also scoped to organization
    const categoryCounts = await prisma.denial.groupBy({
      by: ["reasonCategory"],
      where: {
        priorAuth: {
          organizationId,
          status: { in: ["denied", "appealed"] },
        },
      },
      _count: { id: true },
    });

    const reasonCategoryCounts: Record<string, number> = {};
    for (const c of categoryCounts) {
      reasonCategoryCounts[c.reasonCategory] = c._count.id;
    }

    return NextResponse.json({
      denials: result,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      reasonCategoryCounts,
    });
  } catch (error) {
    console.error("Denials list error:", error);
    return NextResponse.json({ error: "Failed to fetch denials" }, { status: 500 });
  }
}
