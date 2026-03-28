import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Search query must be at least 2 characters"),
});

/**
 * Build search condition supporting full-name search for patients.
 */
function buildPatientSearchCondition(q: string): Prisma.PatientWhereInput {
  const tokens = q.split(/\s+/).filter(Boolean);

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
        { mrn: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  return {
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { mrn: { contains: q, mode: "insensitive" } },
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

  auditPhiAccess(request, session, "view", "Patient", null, "Searched patients").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());
  const parsed = searchQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    // Return empty results for too-short queries (graceful degradation)
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
    const searchCondition = buildPatientSearchCondition(q);

    const patients = await prisma.patient.findMany({
      where: {
        organizationId,
        ...searchCondition,
      },
      take: 10,
      orderBy: { lastName: "asc" },
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
      patients: patients.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        mrn: p.mrn,
        dob: p.dob.toISOString(),
        primaryInsurance: p.insurances[0]
          ? {
              planName: p.insurances[0].planName,
              payerName: p.insurances[0].payer.name,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Patient search error:", error);
    return NextResponse.json({ error: "Failed to search patients" }, { status: 500 });
  }
}
