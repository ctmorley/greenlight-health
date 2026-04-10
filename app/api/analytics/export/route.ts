import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { decryptPatientRecord } from "@/lib/security/phi-crypto";

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "export", "PriorAuthRequest", null, "Exported PA requests data").catch(() => {});

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
        patient: { select: {
          firstName: true, lastName: true, mrn: true,
          firstNameEncrypted: true, lastNameEncrypted: true, mrnEncrypted: true,
        } },
        payer: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        denials: { select: { reasonCategory: true, reasonCode: true, denialDate: true }, take: 1 },
        appeals: { select: { status: true, appealLevel: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build CSV
    const headers = [
      "Reference Number",
      "Status",
      "Urgency",
      "Service Category",
      "Service Type",
      "CPT Codes",
      "ICD-10 Codes",
      "Patient Name",
      "Patient MRN",
      "Payer",
      "Created By",
      "Created Date",
      "Submitted Date",
      "Decided Date",
      "Denial Reason",
      "Denial Code",
      "Appeal Status",
      "Appeal Level",
    ];

    const rows = requests.map((r) => {
      const denial = r.denials[0];
      const appeal = r.appeals[0];
      const patient = decryptPatientRecord(r.patient);
      return [
        r.referenceNumber,
        r.status,
        r.urgency,
        r.serviceCategory || "",
        r.serviceType || "",
        r.cptCodes.join("; "),
        r.icd10Codes.join("; "),
        `${patient.firstName} ${patient.lastName}`,
        patient.mrn,
        r.payer?.name || "",
        `${r.createdBy.firstName} ${r.createdBy.lastName}`,
        r.createdAt.toISOString().split("T")[0],
        r.submittedAt?.toISOString().split("T")[0] || "",
        r.decidedAt?.toISOString().split("T")[0] || "",
        denial?.reasonCategory || "",
        denial?.reasonCode || "",
        appeal?.status || "",
        appeal?.appealLevel || "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => {
          const str = String(cell);
          // Escape CSV fields that contain commas, quotes, or newlines
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(",")
      ),
    ].join("\n");

    const filename = `pa-requests-export-${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
