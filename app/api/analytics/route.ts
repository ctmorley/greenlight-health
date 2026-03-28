import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "Analytics", null, "Viewed analytics data").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const dateFromParam = searchParams.get("dateFrom");
  const dateToParam = searchParams.get("dateTo");

  // Parse date range
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
    const orgFilter = { organizationId };
    const dateFilter = {
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const requestFilter = { ...orgFilter, ...dateFilter };

    // ── 1. Approval Rate Over Time (weekly for last 12 weeks or date range) ──
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    const approvalTrendStart = dateFrom || twelveWeeksAgo;
    const approvalTrendEnd = dateTo || new Date();

    const decidedInRange = await prisma.priorAuthRequest.findMany({
      where: {
        ...orgFilter,
        decidedAt: {
          gte: approvalTrendStart,
          lte: approvalTrendEnd,
          not: null,
        },
        status: { in: ["approved", "partially_approved", "denied"] },
      },
      select: { status: true, decidedAt: true },
    });

    // Group by week — anchor buckets at dateFrom and clamp to [dateFrom, dateTo]
    const approvalRateOverTime: { week: string; approvalRate: number; total: number }[] = [];
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const rangeMs = approvalTrendEnd.getTime() - approvalTrendStart.getTime();

    // For ranges less than 7 days, use a single bucket
    if (rangeMs < msPerWeek) {
      const weekLabel = approvalTrendStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const weekItems = decidedInRange.filter((r) => {
        const d = r.decidedAt!;
        return d >= approvalTrendStart && d <= approvalTrendEnd;
      });
      const approved = weekItems.filter((r) => r.status === "approved" || r.status === "partially_approved").length;
      const total = weekItems.length;
      const rate = total > 0 ? Math.round((approved / total) * 1000) / 10 : 0;
      approvalRateOverTime.push({ week: weekLabel, approvalRate: rate, total });
    } else {
      // Generate weekly buckets starting from dateFrom, clamped to dateTo
      const numWeeks = Math.max(1, Math.min(52, Math.ceil(rangeMs / msPerWeek)));
      for (let w = 0; w < numWeeks; w++) {
        const bucketStart = new Date(approvalTrendStart.getTime() + w * msPerWeek);
        const bucketEnd = new Date(Math.min(approvalTrendStart.getTime() + (w + 1) * msPerWeek, approvalTrendEnd.getTime()));

        // Skip buckets entirely beyond the date range
        if (bucketStart > approvalTrendEnd) break;

        const weekLabel = bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const weekItems = decidedInRange.filter((r) => {
          const d = r.decidedAt!;
          return d >= bucketStart && d < bucketEnd;
        });
        // Include items exactly at bucketEnd for the last bucket
        if (bucketEnd.getTime() === approvalTrendEnd.getTime()) {
          const lastItems = decidedInRange.filter((r) => {
            const d = r.decidedAt!;
            return d.getTime() === bucketEnd.getTime();
          });
          for (const item of lastItems) {
            if (!weekItems.includes(item)) weekItems.push(item);
          }
        }

        const approved = weekItems.filter((r) => r.status === "approved" || r.status === "partially_approved").length;
        const total = weekItems.length;
        const rate = total > 0 ? Math.round((approved / total) * 1000) / 10 : 0;
        approvalRateOverTime.push({ week: weekLabel, approvalRate: rate, total });
      }
    }

    // ── 2. Volume by Service Type ──
    const volumeByServiceType = await prisma.priorAuthRequest.groupBy({
      by: ["serviceType"],
      where: requestFilter,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const serviceTypeLabels: Record<string, string> = {
      mri: "MRI",
      ct: "CT",
      pet_ct: "PET/CT",
      ultrasound: "Ultrasound",
      xray: "X-Ray",
      fluoroscopy: "Fluoroscopy",
      mammography: "Mammography",
      dexa: "DEXA",
      nuclear: "Nuclear",
      surgical_procedure: "Surgical",
      medical_procedure: "Medical",
    };

    const volumeByType = volumeByServiceType
      .filter((v) => v.serviceType !== null)
      .map((v) => ({
        type: serviceTypeLabels[v.serviceType!] || v.serviceType,
        rawType: v.serviceType,
        count: v._count.id,
      }));

    // ── 3. Volume by Payer ──
    const volumeByPayer = await prisma.priorAuthRequest.groupBy({
      by: ["payerId"],
      where: { ...requestFilter, payerId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    const payerIds = volumeByPayer.map((v) => v.payerId!).filter(Boolean);
    const payers = await prisma.payer.findMany({
      where: { id: { in: payerIds } },
      select: { id: true, name: true },
    });
    const payerNameMap = Object.fromEntries(payers.map((p) => [p.id, p.name]));

    const volumeByPayerData = volumeByPayer.map((v) => ({
      payer: payerNameMap[v.payerId!] || "Unknown",
      payerId: v.payerId,
      count: v._count.id,
    }));

    // ── 4. Average Turnaround by Payer ──
    const turnaroundByPayerRaw = await prisma.priorAuthRequest.findMany({
      where: {
        ...orgFilter,
        ...(dateFrom || dateTo
          ? {
              decidedAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
                not: null,
              },
            }
          : { decidedAt: { not: null } }),
        submittedAt: { not: null },
        payerId: { not: null },
      },
      select: { payerId: true, submittedAt: true, decidedAt: true },
    });

    const payerTurnarounds: Record<string, number[]> = {};
    for (const r of turnaroundByPayerRaw) {
      if (!r.payerId) continue;
      if (!payerTurnarounds[r.payerId]) payerTurnarounds[r.payerId] = [];
      payerTurnarounds[r.payerId].push(countBusinessDays(r.submittedAt!, r.decidedAt!));
    }

    // Get all payer names we need
    const allPayerIds = Object.keys(payerTurnarounds);
    const allPayers = await prisma.payer.findMany({
      where: { id: { in: allPayerIds } },
      select: { id: true, name: true },
    });
    const allPayerNameMap = Object.fromEntries(allPayers.map((p) => [p.id, p.name]));

    const avgTurnaroundByPayer = Object.entries(payerTurnarounds)
      .map(([payerId, days]) => ({
        payer: allPayerNameMap[payerId] || "Unknown",
        avgDays: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
        count: days.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── 5. Denial Reasons Breakdown ──
    const denialDateFilter = dateFrom || dateTo
      ? {
          denialDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {};

    const denialReasons = await prisma.denial.groupBy({
      by: ["reasonCategory"],
      where: {
        priorAuth: orgFilter,
        ...denialDateFilter,
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const denialCategoryLabels: Record<string, string> = {
      medical_necessity: "Medical Necessity",
      incomplete_documentation: "Incomplete Docs",
      out_of_network: "Out of Network",
      service_not_covered: "Not Covered",
      missing_precert: "Missing Pre-Cert",
      coding_error: "Coding Error",
      other: "Other",
    };

    const denialReasonsBreakdown = denialReasons.map((d) => ({
      category: denialCategoryLabels[d.reasonCategory] || d.reasonCategory,
      rawCategory: d.reasonCategory,
      count: d._count.id,
    }));

    // ── 6. Appeal Success Rate ──
    const appeals = await prisma.appeal.findMany({
      where: {
        priorAuth: orgFilter,
        status: { in: ["won", "lost"] },
        ...(dateFrom || dateTo
          ? {
              filedDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      select: { status: true, appealLevel: true },
    });

    const appealLevelLabels: Record<string, string> = {
      first: "1st Level",
      second: "2nd Level",
      external_review: "External Review",
    };

    const appealsByLevel: Record<string, { won: number; lost: number }> = {};
    for (const a of appeals) {
      if (!appealsByLevel[a.appealLevel]) {
        appealsByLevel[a.appealLevel] = { won: 0, lost: 0 };
      }
      if (a.status === "won") appealsByLevel[a.appealLevel].won++;
      if (a.status === "lost") appealsByLevel[a.appealLevel].lost++;
    }

    const appealSuccessRate = Object.entries(appealsByLevel).map(([level, counts]) => ({
      level: appealLevelLabels[level] || level,
      rawLevel: level,
      won: counts.won,
      lost: counts.lost,
      total: counts.won + counts.lost,
      successRate: counts.won + counts.lost > 0
        ? Math.round((counts.won / (counts.won + counts.lost)) * 1000) / 10
        : 0,
    }));

    // Overall appeal success
    const totalWon = appeals.filter((a) => a.status === "won").length;
    const totalDecided = appeals.length;
    const overallAppealSuccessRate = totalDecided > 0
      ? Math.round((totalWon / totalDecided) * 1000) / 10
      : 0;

    // ── Summary metrics ──
    const totalPAs = await prisma.priorAuthRequest.count({ where: requestFilter });

    const statusCounts = await prisma.priorAuthRequest.groupBy({
      by: ["status"],
      where: requestFilter,
      _count: { id: true },
    });
    const statusMap: Record<string, number> = {};
    for (const s of statusCounts) {
      statusMap[s.status] = s._count.id;
    }
    const approved = (statusMap["approved"] || 0) + (statusMap["partially_approved"] || 0);
    const denied = statusMap["denied"] || 0;
    const decided = approved + denied;
    const approvalRate = decided > 0 ? Math.round((approved / decided) * 1000) / 10 : 0;
    const denialRate = decided > 0 ? Math.round((denied / decided) * 1000) / 10 : 0;

    return NextResponse.json({
      summary: {
        totalPAs,
        approvalRate,
        denialRate,
        totalAppeals: totalDecided,
        overallAppealSuccessRate,
      },
      approvalRateOverTime,
      volumeByType,
      volumeByPayer: volumeByPayerData,
      avgTurnaroundByPayer,
      denialReasonsBreakdown,
      appealSuccessRate,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(count, 0);
}
