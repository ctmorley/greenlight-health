import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { decryptPatientRecord } from "@/lib/security/phi-crypto";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "Dashboard", null, "Viewed dashboard stats").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    // All queries are scoped to the authenticated user's organization
    const orgFilter = { organizationId };

    // ── Total PAs ────────────────────────────────────────────
    const totalPAs = await prisma.priorAuthRequest.count({
      where: orgFilter,
    });

    // ── Status counts ────────────────────────────────────────
    const statusCounts = await prisma.priorAuthRequest.groupBy({
      by: ["status"],
      where: orgFilter,
      _count: { id: true },
    });

    const statusMap: Record<string, number> = {};
    for (const s of statusCounts) {
      statusMap[s.status] = s._count.id;
    }

    const approved = statusMap["approved"] || 0;
    const partiallyApproved = statusMap["partially_approved"] || 0;
    const denied = statusMap["denied"] || 0;
    // Approval rate per test plan: approved / (approved + denied + partially_approved)
    const decidedForApproval = approved + denied + partiallyApproved;
    const approvalRate = decidedForApproval > 0 ? (approved / decidedForApproval) * 100 : 0;
    const denialRate = decidedForApproval > 0 ? (denied / decidedForApproval) * 100 : 0;

    const pendingCount = (statusMap["pending_review"] || 0) + (statusMap["submitted"] || 0);

    // ── Average Turnaround (business days) ───────────────────
    const decidedRequests = await prisma.priorAuthRequest.findMany({
      where: {
        ...orgFilter,
        submittedAt: { not: null },
        decidedAt: { not: null },
      },
      select: { submittedAt: true, decidedAt: true },
    });

    let avgTurnaround = 0;
    if (decidedRequests.length > 0) {
      let totalBizDays = 0;
      for (const r of decidedRequests) {
        totalBizDays += countBusinessDays(r.submittedAt!, r.decidedAt!);
      }
      avgTurnaround = Math.round((totalBizDays / decidedRequests.length) * 10) / 10;
    }

    // ── Status Distribution (for donut chart) ────────────────
    // Include all possible statuses, padding with zero counts for missing ones
    const ALL_STATUSES = [
      "draft", "submitted", "pending_review", "approved",
      "partially_approved", "denied", "appealed", "expired", "cancelled",
    ];
    const statusDistribution = ALL_STATUSES.map((s) => ({
      name: formatStatusLabel(s),
      value: statusMap[s] || 0,
      status: s,
    }));

    // ── Recent Activity (last 20 status changes) ─────────────
    const recentActivity = await prisma.authStatusChange.findMany({
      where: {
        priorAuth: orgFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        changedBy: { select: { firstName: true, lastName: true } },
        priorAuth: {
          select: {
            referenceNumber: true,
            patient: { select: { firstName: true, lastName: true, firstNameEncrypted: true, lastNameEncrypted: true } },
          },
        },
      },
    });

    const activityFeed = recentActivity.map((a) => {
      const patient = decryptPatientRecord(a.priorAuth.patient);
      return {
      id: a.id,
      user: `${a.changedBy.firstName} ${a.changedBy.lastName}`,
      referenceNumber: a.priorAuth.referenceNumber,
      patientName: `${patient.firstName} ${patient.lastName}`,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    };
    });

    // ── Turnaround Trend (last 12 weeks) ─────────────────────
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    const trendRequests = await prisma.priorAuthRequest.findMany({
      where: {
        ...orgFilter,
        decidedAt: { gte: twelveWeeksAgo, not: null },
        submittedAt: { not: null },
      },
      select: { submittedAt: true, decidedAt: true },
    });

    // Bucket by week
    const turnaroundTrend: { week: string; avgDays: number }[] = [];
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - w * 7);

      const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const weekRequests = trendRequests.filter((r) => {
        const d = r.decidedAt!;
        return d >= weekStart && d < weekEnd;
      });

      let avgDays = 0;
      if (weekRequests.length > 0) {
        const total = weekRequests.reduce(
          (sum, r) => sum + countBusinessDays(r.submittedAt!, r.decidedAt!),
          0
        );
        avgDays = Math.round((total / weekRequests.length) * 10) / 10;
      }

      turnaroundTrend.push({ week: weekLabel, avgDays });
    }

    // ── Top Denial Reasons (bar chart) ───────────────────────
    const denialReasons = await prisma.denial.groupBy({
      by: ["reasonCategory"],
      where: {
        priorAuth: orgFilter,
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const topDenialReasons = denialReasons.map((d) => ({
      category: formatDenialCategory(d.reasonCategory),
      rawCategory: d.reasonCategory,
      count: d._count.id,
    }));

    // Guarantee exactly 5 denial categories for the bar chart
    // Pad with zero-count categories if fewer than 5 were returned from DB
    const allDenialCategories: string[] = [
      "medical_necessity",
      "incomplete_documentation",
      "out_of_network",
      "service_not_covered",
      "missing_precert",
      "coding_error",
      "other",
    ];
    const existingCategories = new Set(topDenialReasons.map((d) => String(d.rawCategory)));
    for (const cat of allDenialCategories) {
      if (topDenialReasons.length >= 5) break;
      if (!existingCategories.has(cat)) {
        topDenialReasons.push({
          category: formatDenialCategory(cat),
          rawCategory: cat as typeof denialReasons[number]["reasonCategory"],
          count: 0,
        });
      }
    }

    return NextResponse.json({
      totalPAs,
      approvalRate: Math.round(approvalRate * 10) / 10,
      denialRate: Math.round(denialRate * 10) / 10,
      avgTurnaround,
      pendingCount,
      statusDistribution,
      activityFeed,
      turnaroundTrend,
      topDenialReasons,
    });
  } catch (error) {
    log.error("Dashboard stats error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
  }
}

// ─── Utilities ──────────────────────────────────────────────

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

function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    pending_review: "Pending Review",
    approved: "Approved",
    partially_approved: "Partially Approved",
    denied: "Denied",
    appealed: "Appealed",
    expired: "Expired",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}

function formatDenialCategory(cat: string): string {
  const labels: Record<string, string> = {
    medical_necessity: "Medical Necessity",
    incomplete_documentation: "Incomplete Docs",
    out_of_network: "Out of Network",
    service_not_covered: "Not Covered",
    missing_precert: "Missing Pre-Cert",
    coding_error: "Coding Error",
    other: "Other",
  };
  return labels[cat] || cat;
}
