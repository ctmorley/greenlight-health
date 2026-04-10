import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { buildPatientHashSearch, decryptPatientRecord } from "@/lib/security/phi-crypto";
import { log } from "@/lib/logger";

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Search query must be at least 2 characters"),
});

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "view", "Patient", null, "Searched patients").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());
  const parsed = searchQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    const qVal = searchParams.get("q")?.trim() || "";
    if (qVal.length < 2) {
      return NextResponse.json({ patients: [] });
    }
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { q } = parsed.data;

  try {
    // Search via blind indexes (exact match on MRN, email, first+last name)
    const hashConditions = buildPatientHashSearch(q);

    const where: Prisma.PatientWhereInput = {
      organizationId,
    };

    if (hashConditions.length > 0) {
      where.OR = hashConditions as Prisma.PatientWhereInput[];
    } else {
      return NextResponse.json({ patients: [] });
    }

    const patients = await prisma.patient.findMany({
      where,
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        insurances: {
          where: { isPrimary: true },
          include: {
            payer: { select: { name: true } },
          },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      patients: patients.map((p) => {
        const d = decryptPatientRecord(p);
        return {
          id: d.id,
          name: `${d.firstName} ${d.lastName}`,
          mrn: d.mrn,
          dob: d.dob instanceof Date ? d.dob.toISOString() : String(d.dob),
          primaryInsurance: p.insurances[0]
            ? {
                planName: p.insurances[0].planName,
                payerName: p.insurances[0].payer.name,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    log.error("Patient search error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to search patients" }, { status: 500 });
  }
}
