/**
 * Clinical Criteria Matching API
 *
 * Given CPT codes and/or ICD-10 codes, returns relevant ACR
 * Appropriateness Criteria and payer-specific policies.
 *
 * GET /api/clinical-criteria?cpt=70553&icd10=M54.5&payerId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const cptCodesParam = searchParams.get("cpt");
  const icd10CodesParam = searchParams.get("icd10");
  const payerId = searchParams.get("payerId");
  const condition = searchParams.get("condition");

  const cptCodes = cptCodesParam ? cptCodesParam.split(",").map((c) => c.trim()) : [];
  const icd10Codes = icd10CodesParam ? icd10CodesParam.split(",").map((c) => c.trim()) : [];

  if (cptCodes.length === 0 && icd10Codes.length === 0 && !condition) {
    return NextResponse.json(
      { error: "Provide at least one of: cpt, icd10, or condition" },
      { status: 400 }
    );
  }

  // Build query for ACR guidelines
  const guidelineWhere: Record<string, unknown>[] = [];

  if (cptCodes.length > 0) {
    guidelineWhere.push({ cptCodes: { hasSome: cptCodes } });
  }
  if (icd10Codes.length > 0) {
    guidelineWhere.push({ icd10Codes: { hasSome: icd10Codes } });
  }
  if (condition) {
    guidelineWhere.push({
      condition: { contains: condition, mode: "insensitive" },
    });
  }

  const guidelines = await prisma.clinicalGuideline.findMany({
    where: guidelineWhere.length === 1 ? guidelineWhere[0] : { OR: guidelineWhere },
    orderBy: [{ rating: "desc" }],
    take: 50,
  });

  // Group by condition+variant for better readability
  const grouped: Record<
    string,
    {
      condition: string;
      variant: string;
      procedures: {
        id: string;
        procedure: string;
        rating: number;
        ratingCategory: string;
        evidenceStrength: string;
        cptCodes: string[];
        radiationLevel: number | null;
        radiationDose: string | null;
      }[];
    }
  > = {};

  for (const g of guidelines) {
    const key = `${g.condition}||${g.variant}`;
    if (!grouped[key]) {
      grouped[key] = {
        condition: g.condition,
        variant: g.variant,
        procedures: [],
      };
    }
    grouped[key].procedures.push({
      id: g.id,
      procedure: g.procedure,
      rating: g.rating,
      ratingCategory: g.ratingCategory,
      evidenceStrength: g.evidenceStrength,
      cptCodes: g.cptCodes,
      radiationLevel: g.radiationLevel,
      radiationDose: g.radiationDose,
    });
  }

  // Sort procedures within each group by rating descending
  for (const group of Object.values(grouped)) {
    group.procedures.sort((a, b) => b.rating - a.rating);
  }

  // Fetch payer-specific policies if payerId provided
  let payerPolicies: unknown[] = [];
  if (payerId && cptCodes.length > 0) {
    payerPolicies = await prisma.payerClinicalPolicy.findMany({
      where: {
        payerId,
        isActive: true,
        OR: [
          { cptCode: { in: cptCodes } },
          { cptCode: null }, // Category-wide policies
        ],
      },
      include: {
        guideline: {
          select: {
            condition: true,
            procedure: true,
            rating: true,
            ratingCategory: true,
          },
        },
      },
    });
  }

  // Fetch documentation requirements
  let docRequirements: unknown[] = [];
  if (payerId || cptCodes.length > 0) {
    const docWhere: Record<string, unknown>[] = [];
    if (payerId) docWhere.push({ payerId });
    if (cptCodes.length > 0) docWhere.push({ cptCode: { in: cptCodes } });

    docRequirements = await prisma.documentationRequirement.findMany({
      where: docWhere.length === 1 ? docWhere[0] : { AND: docWhere },
    });
  }

  // Fetch denial patterns for pre-submission audit
  let denialPatterns: unknown[] = [];
  if (payerId || cptCodes.length > 0) {
    const denialWhere: Record<string, unknown>[] = [];
    if (payerId) denialWhere.push({ payerId });
    if (cptCodes.length > 0) denialWhere.push({ cptCode: { in: cptCodes } });

    denialPatterns = await prisma.denialPattern.findMany({
      where: denialWhere.length === 1 ? denialWhere[0] : { OR: denialWhere },
      orderBy: { frequency: "desc" },
      take: 10,
    });
  }

  // Build pre-submission audit summary
  const audit = buildAuditSummary(guidelines, cptCodes);

  return NextResponse.json({
    query: { cptCodes, icd10Codes, condition, payerId },
    guidelines: Object.values(grouped),
    guidelineCount: guidelines.length,
    payerPolicies,
    docRequirements,
    denialPatterns,
    audit,
  });
}

function buildAuditSummary(
  guidelines: { rating: number; ratingCategory: string; procedure: string; condition: string }[],
  queriedCptCodes: string[]
) {
  if (guidelines.length === 0) {
    return {
      hasGuidelines: false,
      message: queriedCptCodes.length > 0
        ? "No ACR Appropriateness Criteria found for the queried CPT codes. Manual clinical review recommended."
        : "No matching guidelines found.",
      riskLevel: "unknown" as const,
    };
  }

  // Find the most relevant guideline (highest rated for the queried procedure)
  const appropriate = guidelines.filter((g) => g.rating >= 7);
  const mayBe = guidelines.filter((g) => g.rating >= 4 && g.rating <= 6);
  const notAppropriate = guidelines.filter((g) => g.rating <= 3);

  const highestRating = Math.max(...guidelines.map((g) => g.rating));
  const avgRating = guidelines.reduce((sum, g) => sum + g.rating, 0) / guidelines.length;

  let riskLevel: "low" | "medium" | "high";
  let message: string;

  if (highestRating >= 7 && appropriate.length > 0) {
    riskLevel = "low";
    message = `ACR rates this as "Usually Appropriate" (${highestRating}/9). Strong clinical support for this imaging study. Low denial risk.`;
  } else if (highestRating >= 4) {
    riskLevel = "medium";
    message = `ACR rates this as "May Be Appropriate" (${highestRating}/9). Additional clinical documentation recommended to support medical necessity.`;
  } else {
    riskLevel = "high";
    message = `ACR rates this as "Usually Not Appropriate" (${highestRating}/9). High denial risk. Consider alternative imaging or provide strong clinical justification.`;
  }

  return {
    hasGuidelines: true,
    highestRating,
    avgRating: Math.round(avgRating * 10) / 10,
    appropriateCount: appropriate.length,
    mayBeCount: mayBe.length,
    notAppropriateCount: notAppropriate.length,
    riskLevel,
    message,
    topRecommendation: appropriate.length > 0
      ? `${appropriate[0].procedure} for ${appropriate[0].condition} (rated ${appropriate[0].rating}/9)`
      : undefined,
  };
}
