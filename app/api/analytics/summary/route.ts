import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * GET /api/analytics/summary
 * Returns a JSON array of PA request summaries for the preview table.
 * Avoids CSV re-parsing issues with commas/quotes in field values.
 */
export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "Analytics", null, "Viewed analytics summary").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const dateFromParam = searchParams.get("dateFrom");
  const dateToParam = searchParams.get("dateTo");

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  if (dateFromParam) {
    const parsed = Date.parse(dateFromParam);
    if (isNaN(parsed)) {
      return NextResponse.json({ error: "Invalid dateFrom" }, { status: 400 });
    }
    dateFrom = new Date(parsed);
    dateFrom.setUTCHours(0, 0, 0, 0);
  }

  if (dateToParam) {
    const parsed = Date.parse(dateToParam);
    if (isNaN(parsed)) {
      return NextResponse.json({ error: "Invalid dateTo" }, { status: 400 });
    }
    dateTo = new Date(parsed);
    dateTo.setUTCHours(23, 59, 59, 999);
  }

  try {
    const requests = await prisma.priorAuthRequest.findMany({
      where: {
        organizationId,
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        payer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const rows = requests.map((r) => ({
      referenceNumber: r.referenceNumber,
      status: r.status,
      serviceType: r.serviceType || "",
      patientName: `${r.patient.firstName} ${r.patient.lastName}`,
      payer: r.payer?.name || "",
      createdDate: r.createdAt.toISOString().split("T")[0],
      decidedDate: r.decidedAt?.toISOString().split("T")[0] || "",
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Analytics summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary data" }, { status: 500 });
  }
}
