import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { PlanType } from "@prisma/client";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  encryptPatientFields,
  encryptInsuranceFields,
  decryptPatientRecord,
  decryptInsuranceRecord,
  blindIndex,
} from "@/lib/security/phi-crypto";

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

    // Strategy 1: Match by MRN via blind index (strongest identifier)
    if (data.mrn) {
      const mrnMatch = await prisma.patient.findFirst({
        where: { organizationId, mrnHash: blindIndex(data.mrn) },
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

    // Strategy 2: Match by name + DOB via blind indexes
    const dobDate = new Date(data.dob);
    const nameMatch = await prisma.patient.findFirst({
      where: {
        organizationId,
        firstNameHash: blindIndex(data.firstName),
        lastNameHash: blindIndex(data.lastName),
        dobHash: blindIndex(dobDate.toISOString().split("T")[0]),
      },
      include: {
        insurances: {
          include: { payer: { select: { id: true, name: true } } },
        },
      },
    });

    if (nameMatch) {
      // Dual-read: decrypt to check MRN value
      const decryptedMatch = decryptPatientRecord(nameMatch);
      // Update MRN if we have one from FHIR and the patient doesn't have one
      if (data.mrn && String(decryptedMatch.mrn).startsWith("AUTO-")) {
        const mrnEncryptedFields = encryptPatientFields({ mrn: data.mrn });
        await prisma.patient.update({
          where: { id: nameMatch.id },
          data: { ...mrnEncryptedFields },
        });
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

    // Dual-write: encrypt patient PHI fields
    const patientPhiEncrypted = encryptPatientFields({
      firstName: data.firstName,
      lastName: data.lastName,
      mrn,
      dob: dobDate.toISOString(),
      phone: data.phone || null,
      email: data.email || null,
    });

    // Try to match payer by name for insurance creation
    let payerMatch = null;
    if (data.coverage?.payerName) {
      payerMatch = await fuzzyMatchPayer(
        data.coverage.payerName,
        data.coverage.payerIdentifier || null,
        organizationId
      );
    }

    // Dual-write: encrypt insurance PHI fields if creating insurance
    const insuranceMemberId = data.coverage?.memberId || data.coverage?.subscriberId || "PENDING";
    const insuranceGroupNumber = data.coverage?.groupNumber || null;
    const insurancePhiEncrypted = (data.coverage && payerMatch)
      ? encryptInsuranceFields({ memberId: insuranceMemberId, groupNumber: insuranceGroupNumber })
      : {};

    // Plaintext PHI columns are no longer written — encrypted + hash only
    const newPatient = await prisma.patient.create({
      data: {
        organizationId,
        gender: data.gender,
        ...patientPhiEncrypted,
        // Create insurance record if we have coverage data AND matched a payer
        ...(data.coverage && payerMatch
          ? {
              insurances: {
                create: {
                  payerId: payerMatch.id,
                  planName: data.coverage.planName || `${payerMatch.name} Plan`,
                  planType: detectPlanType(data.coverage.planName || null, payerMatch.name),
                  isPrimary: true,
                  effectiveDate: new Date(),
                  ...insurancePhiEncrypted,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPatient(p: Record<string, any>) {
  // Dual-read: decrypt patient and insurance PHI fields
  const dp = decryptPatientRecord(p);
  return {
    id: dp.id,
    firstName: dp.firstName,
    lastName: dp.lastName,
    name: `${dp.firstName} ${dp.lastName}`,
    mrn: dp.mrn,
    dob: dp.dob instanceof Date ? dp.dob.toISOString() : String(dp.dob),
    gender: dp.gender,
    phone: dp.phone,
    email: dp.email,
    insurances: (p.insurances || []).map((ins: Record<string, unknown>) => {
      const di = decryptInsuranceRecord(ins);
      return {
        id: di.id,
        planName: di.planName,
        planType: di.planType,
        memberId: di.memberId,
        groupNumber: di.groupNumber,
        isPrimary: di.isPrimary,
        effectiveDate: di.effectiveDate instanceof Date ? di.effectiveDate.toISOString() : String(di.effectiveDate),
        payer: di.payer,
      };
    }),
  };
}

/**
 * Syncs insurance from FHIR Coverage data to an existing patient record.
 * Creates a new insurance record if the patient doesn't have matching coverage.
 */
async function syncInsuranceFromCoverage(
  patientId: string,
  coverage: { payerName: string; payerIdentifier?: string | null; planName?: string | null; memberId?: string | null; groupNumber?: string | null; subscriberId?: string | null },
  organizationId: string
) {
  const payerMatch = await fuzzyMatchPayer(
    coverage.payerName,
    coverage.payerIdentifier || null,
    organizationId
  );
  if (!payerMatch) return;

  // Check if patient already has insurance with this payer
  const existing = await prisma.patientInsurance.findFirst({
    where: { patientId, payerId: payerMatch.id },
  });

  if (existing) {
    // Dual-read: decrypt to check memberId value
    const decrypted = decryptInsuranceRecord(existing);
    // Update member ID if FHIR has one and existing is placeholder
    if (coverage.memberId && decrypted.memberId === "PENDING") {
      const memberEncrypted = encryptInsuranceFields({ memberId: coverage.memberId });
      await prisma.patientInsurance.update({
        where: { id: existing.id },
        data: { ...memberEncrypted },
      });
    }
    return;
  }

  // Create new insurance record — plaintext PHI columns no longer written
  const newMemberId = coverage.memberId || coverage.subscriberId || "PENDING";
  const newGroupNumber = coverage.groupNumber || null;
  const insEncrypted = encryptInsuranceFields({ memberId: newMemberId, groupNumber: newGroupNumber });

  await prisma.patientInsurance.create({
    data: {
      patientId,
      payerId: payerMatch.id,
      planName: coverage.planName || `${payerMatch.name} Plan`,
      planType: detectPlanType(coverage.planName || null, payerMatch.name),
      isPrimary: true,
      effectiveDate: new Date(),
      ...insEncrypted,
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
 * Restricts matches to the current organization plus global payers.
 * Tries exact match first, then case-insensitive contains, then word overlap.
 */
async function fuzzyMatchPayer(
  payerName: string,
  payerIdentifier: string | null,
  organizationId: string
) {
  const visibilityFilter = {
    OR: [{ organizationId }, { organizationId: null }],
    isActive: true,
  };

  // Try exact payerIdentifier match first
  if (payerIdentifier) {
    const idMatch = await prisma.payer.findFirst({
      where: { ...visibilityFilter, payerId: payerIdentifier },
      select: { id: true, name: true },
    });
    if (idMatch) return idMatch;
  }

  // Try case-insensitive exact name match
  const exactMatch = await prisma.payer.findFirst({
    where: {
      ...visibilityFilter,
      name: { equals: payerName, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  if (exactMatch) return exactMatch;

  // Try case-insensitive contains (e.g., "Aetna" matches "Aetna Health Plans")
  const containsMatch = await prisma.payer.findFirst({
    where: {
      ...visibilityFilter,
      name: { contains: payerName, mode: "insensitive" },
    },
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
      where: {
        ...visibilityFilter,
        name: { contains: word, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
    if (wordMatch) return wordMatch;
  }

  return null;
}
