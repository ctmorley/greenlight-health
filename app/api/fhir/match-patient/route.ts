import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { PlanType } from "@prisma/client";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * POST /api/fhir/match-patient
 *
 * Matches a FHIR Patient to an existing GreenLight patient record,
 * or creates a new one. Used during the EHR launch auto-fill flow.
 *
 * Matching priority:
 * 1. Exact MRN match (within the user's organization)
 * 2. Name + DOB match (fallback)
 * 3. Create new patient if no match
 */

const matchPatientSchema = z.object({
  fhirPatientId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  mrn: z.string().nullable().optional(),
  dob: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid DOB" }),
  gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  // Optional coverage data to create insurance record
  coverage: z
    .object({
      payerName: z.string().min(1),
      payerIdentifier: z.string().nullable().optional(),
      planName: z.string().nullable().optional(),
      memberId: z.string().nullable().optional(),
      groupNumber: z.string().nullable().optional(),
      subscriberId: z.string().nullable().optional(),
      relationship: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.fhir);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  auditPhiAccess(request, session, "fhir_read", "Patient", null, "FHIR patient match").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = matchPatientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Strategy 1: Match by MRN (strongest identifier)
    if (data.mrn) {
      const mrnMatch = await prisma.patient.findFirst({
        where: { organizationId, mrn: data.mrn },
        include: {
          insurances: {
            include: { payer: { select: { id: true, name: true } } },
          },
        },
      });

      if (mrnMatch) {
        // Update insurance from FHIR coverage if patient has no insurance
        if (mrnMatch.insurances.length === 0 && data.coverage) {
          await syncInsuranceFromCoverage(mrnMatch.id, data.coverage, organizationId);
          // Re-fetch with updated insurance
          const updated = await prisma.patient.findUnique({
            where: { id: mrnMatch.id },
            include: { insurances: { include: { payer: { select: { id: true, name: true } } } } },
          });
          if (updated) {
            return NextResponse.json({
              matched: true,
              matchType: "mrn",
              patient: formatPatient(updated),
            });
          }
        }

        return NextResponse.json({
          matched: true,
          matchType: "mrn",
          patient: formatPatient(mrnMatch),
        });
      }
    }

    // Strategy 2: Match by name + DOB
    const dobDate = new Date(data.dob);
    const nameMatch = await prisma.patient.findFirst({
      where: {
        organizationId,
        firstName: { equals: data.firstName, mode: "insensitive" },
        lastName: { equals: data.lastName, mode: "insensitive" },
        dob: dobDate,
      },
      include: {
        insurances: {
          include: { payer: { select: { id: true, name: true } } },
        },
      },
    });

    if (nameMatch) {
      // Update MRN if we have one from FHIR and the patient doesn't have one
      if (data.mrn && nameMatch.mrn.startsWith("AUTO-")) {
        await prisma.patient.update({
          where: { id: nameMatch.id },
          data: { mrn: data.mrn },
        });
        nameMatch.mrn = data.mrn;
      }

      // Sync insurance if patient has none but FHIR has coverage
      if (nameMatch.insurances.length === 0 && data.coverage) {
        await syncInsuranceFromCoverage(nameMatch.id, data.coverage, organizationId);
        const updated = await prisma.patient.findUnique({
          where: { id: nameMatch.id },
          include: { insurances: { include: { payer: { select: { id: true, name: true } } } } },
        });
        if (updated) {
          return NextResponse.json({
            matched: true,
            matchType: "name_dob",
            patient: formatPatient(updated),
          });
        }
      }

      return NextResponse.json({
        matched: true,
        matchType: "name_dob",
        patient: formatPatient(nameMatch),
      });
    }

    // Strategy 3: Create new patient
    const mrn = data.mrn || `EHR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Try to match payer by name for insurance creation
    let payerMatch = null;
    if (data.coverage?.payerName) {
      payerMatch = await fuzzyMatchPayer(data.coverage.payerName, data.coverage.payerIdentifier || null);
    }

    const newPatient = await prisma.patient.create({
      data: {
        organizationId,
        firstName: data.firstName,
        lastName: data.lastName,
        mrn,
        dob: dobDate,
        gender: data.gender,
        phone: data.phone || null,
        email: data.email || null,
        // Create insurance record if we have coverage data AND matched a payer
        ...(data.coverage && payerMatch
          ? {
              insurances: {
                create: {
                  payerId: payerMatch.id,
                  planName: data.coverage.planName || `${payerMatch.name} Plan`,
                  planType: detectPlanType(data.coverage.planName || null, payerMatch.name),
                  memberId: data.coverage.memberId || data.coverage.subscriberId || "PENDING",
                  groupNumber: data.coverage.groupNumber || null,
                  isPrimary: true,
                  effectiveDate: new Date(),
                },
              },
            }
          : {}),
      },
      include: {
        insurances: {
          include: { payer: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json(
      {
        matched: false,
        matchType: "created",
        patient: formatPatient(newPatient),
        payerMatched: payerMatch ? { id: payerMatch.id, name: payerMatch.name } : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("FHIR patient match error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to match patient" }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────

interface PatientWithInsurances {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
  dob: Date;
  gender: string;
  phone: string | null;
  email: string | null;
  insurances: Array<{
    id: string;
    planName: string;
    planType: string;
    memberId: string;
    groupNumber: string | null;
    isPrimary: boolean;
    effectiveDate: Date;
    payer: { id: string; name: string };
  }>;
}

function formatPatient(p: PatientWithInsurances) {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    name: `${p.firstName} ${p.lastName}`,
    mrn: p.mrn,
    dob: p.dob.toISOString(),
    gender: p.gender,
    phone: p.phone,
    email: p.email,
    insurances: p.insurances.map((ins) => ({
      id: ins.id,
      planName: ins.planName,
      planType: ins.planType,
      memberId: ins.memberId,
      groupNumber: ins.groupNumber,
      isPrimary: ins.isPrimary,
      effectiveDate: ins.effectiveDate.toISOString(),
      payer: ins.payer,
    })),
  };
}

/**
 * Syncs insurance from FHIR Coverage data to an existing patient record.
 * Creates a new insurance record if the patient doesn't have matching coverage.
 */
async function syncInsuranceFromCoverage(
  patientId: string,
  coverage: { payerName: string; payerIdentifier?: string | null; planName?: string | null; memberId?: string | null; groupNumber?: string | null; subscriberId?: string | null },
  _organizationId: string
) {
  const payerMatch = await fuzzyMatchPayer(coverage.payerName, coverage.payerIdentifier || null);
  if (!payerMatch) return;

  // Check if patient already has insurance with this payer
  const existing = await prisma.patientInsurance.findFirst({
    where: { patientId, payerId: payerMatch.id },
  });

  if (existing) {
    // Update member ID if FHIR has one and existing is placeholder
    if (coverage.memberId && existing.memberId === "PENDING") {
      await prisma.patientInsurance.update({
        where: { id: existing.id },
        data: { memberId: coverage.memberId },
      });
    }
    return;
  }

  // Create new insurance record
  await prisma.patientInsurance.create({
    data: {
      patientId,
      payerId: payerMatch.id,
      planName: coverage.planName || `${payerMatch.name} Plan`,
      planType: detectPlanType(coverage.planName || null, payerMatch.name),
      memberId: coverage.memberId || coverage.subscriberId || "PENDING",
      groupNumber: coverage.groupNumber || null,
      isPrimary: true,
      effectiveDate: new Date(),
    },
  });
}

/**
 * Detects insurance plan type from plan name and payer name keywords.
 */
function detectPlanType(planName: string | null, payerName: string): PlanType {
  const combined = `${planName || ""} ${payerName}`.toLowerCase();

  if (combined.includes("medicare")) return "medicare";
  if (combined.includes("medicaid") || combined.includes("medi-cal")) return "medicaid";
  if (combined.includes("tricare")) return "tricare";
  if (combined.includes("hmo")) return "hmo";
  if (combined.includes("ppo")) return "ppo";
  if (combined.includes("epo")) return "epo";
  if (combined.includes("pos") && !combined.includes("post")) return "pos";

  return "other";
}

/**
 * Fuzzy match a FHIR payer name to a GreenLight Payer record.
 * Tries exact match first, then case-insensitive contains, then word overlap.
 */
async function fuzzyMatchPayer(payerName: string, payerIdentifier: string | null) {
  // Try exact payerIdentifier match first
  if (payerIdentifier) {
    const idMatch = await prisma.payer.findFirst({
      where: { payerId: payerIdentifier, isActive: true },
      select: { id: true, name: true },
    });
    if (idMatch) return idMatch;
  }

  // Try case-insensitive exact name match
  const exactMatch = await prisma.payer.findFirst({
    where: { name: { equals: payerName, mode: "insensitive" }, isActive: true },
    select: { id: true, name: true },
  });
  if (exactMatch) return exactMatch;

  // Try case-insensitive contains (e.g., "Aetna" matches "Aetna Health Plans")
  const containsMatch = await prisma.payer.findFirst({
    where: { name: { contains: payerName, mode: "insensitive" }, isActive: true },
    select: { id: true, name: true },
  });
  if (containsMatch) return containsMatch;

  // Try matching significant words from the payer name
  const words = payerName
    .split(/[\s,.-]+/)
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase());

  for (const word of words) {
    const wordMatch = await prisma.payer.findFirst({
      where: { name: { contains: word, mode: "insensitive" }, isActive: true },
      select: { id: true, name: true },
    });
    if (wordMatch) return wordMatch;
  }

  return null;
}
