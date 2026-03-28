import { prisma } from "@/lib/prisma";
import type { ServiceCategory } from "@prisma/client";

interface PaCheckInput {
  cptCodes: string[];
  icd10Codes: string[];
  payerName?: string | null;
  payerId?: string | null;
  serviceCategory?: string | null;
}

export interface PaCheckResult {
  requiresPA: boolean;
  riskLevel: "low" | "medium" | "high" | "unknown";
  acrRating: number | null;
  acrMessage: string | null;
  payerName: string | null;
  rbmVendor: string | null;
  avgResponseDays: number | null;
  documentationNeeded: string[];
  denialWarnings: string[];
  topRecommendation: string | null;
}

/**
 * Core PA requirement check logic.
 * Combines ACR criteria, payer rules, documentation requirements,
 * and denial patterns into a single result.
 */
export async function checkPaRequirement(input: PaCheckInput): Promise<PaCheckResult> {
  const result: PaCheckResult = {
    requiresPA: false,
    riskLevel: "unknown",
    acrRating: null,
    acrMessage: null,
    payerName: null,
    rbmVendor: null,
    avgResponseDays: null,
    documentationNeeded: [],
    denialWarnings: [],
    topRecommendation: null,
  };

  if (input.cptCodes.length === 0 && input.icd10Codes.length === 0) {
    return result;
  }

  // ── 1. Resolve payer ──
  let resolvedPayerId: string | null = input.payerId || null;

  if (!resolvedPayerId && input.payerName) {
    const payer = await prisma.payer.findFirst({
      where: {
        OR: [
          { name: { contains: input.payerName, mode: "insensitive" } },
          { payerId: input.payerName },
        ],
        isActive: true,
      },
      select: { id: true, name: true, rbmVendor: true, avgResponseDays: true },
    });
    if (payer) {
      resolvedPayerId = payer.id;
      result.payerName = payer.name;
      result.rbmVendor = payer.rbmVendor;
      result.avgResponseDays = payer.avgResponseDays;
    }
  }

  if (resolvedPayerId && !result.payerName) {
    const payer = await prisma.payer.findUnique({
      where: { id: resolvedPayerId },
      select: { name: true, rbmVendor: true, avgResponseDays: true },
    });
    if (payer) {
      result.payerName = payer.name;
      result.rbmVendor = payer.rbmVendor;
      result.avgResponseDays = payer.avgResponseDays;
    }
  }

  // ── 2. Check payer rules ──
  if (resolvedPayerId) {
    const serviceCategory = (input.serviceCategory || detectServiceCategory(input.cptCodes)) as ServiceCategory | null;

    const rules = await prisma.payerRule.findMany({
      where: {
        payerId: resolvedPayerId,
        ...(serviceCategory ? { serviceCategory } : {}),
        OR: [
          { cptCode: { in: input.cptCodes } },
          { cptCode: null },
        ],
      },
    });

    // Check if any rule requires PA (specific CPT match takes priority)
    for (const cpt of input.cptCodes) {
      const specificRule = rules.find((r) => r.cptCode === cpt);
      const categoryRule = rules.find((r) => r.cptCode === null);
      const bestRule = specificRule || categoryRule;
      if (bestRule?.requiresPA) {
        result.requiresPA = true;
        break;
      }
    }

    // If no CPT-specific rules, check category rules
    if (!result.requiresPA && input.cptCodes.length === 0 && rules.length > 0) {
      result.requiresPA = rules.some((r) => r.requiresPA);
    }
  }

  // ── 3. ACR Appropriateness Criteria ──
  if (input.cptCodes.length > 0 || input.icd10Codes.length > 0) {
    const guidelineWhere: Record<string, unknown>[] = [];
    if (input.cptCodes.length > 0) {
      guidelineWhere.push({ cptCodes: { hasSome: input.cptCodes } });
    }
    if (input.icd10Codes.length > 0) {
      guidelineWhere.push({ icd10Codes: { hasSome: input.icd10Codes } });
    }

    const guidelines = await prisma.clinicalGuideline.findMany({
      where: guidelineWhere.length === 1 ? guidelineWhere[0] : { OR: guidelineWhere },
      orderBy: { rating: "desc" },
      take: 10,
    });

    if (guidelines.length > 0) {
      const topRating = guidelines[0].rating;
      result.acrRating = topRating;

      if (topRating >= 7) {
        result.riskLevel = "low";
        result.acrMessage = `ACR rates this as "Usually Appropriate" (${topRating}/9). Strong clinical support.`;
      } else if (topRating >= 4) {
        result.riskLevel = "medium";
        result.acrMessage = `ACR rates this as "May Be Appropriate" (${topRating}/9). Additional documentation recommended.`;
      } else {
        result.riskLevel = "high";
        result.acrMessage = `ACR rates this as "Usually Not Appropriate" (${topRating}/9). High denial risk.`;
      }

      const topAppropriate = guidelines.find((g) => g.rating >= 7);
      if (topAppropriate) {
        result.topRecommendation = `${topAppropriate.procedure} for ${topAppropriate.condition} (rated ${topAppropriate.rating}/9)`;
      }
    }
  }

  // ── 4. Documentation requirements ──
  if (resolvedPayerId && result.requiresPA) {
    const docReqs = await prisma.documentationRequirement.findMany({
      where: {
        OR: [
          { payerId: resolvedPayerId, cptCode: { in: input.cptCodes } },
          { payerId: resolvedPayerId, cptCode: null },
          { payerId: null, cptCode: { in: input.cptCodes } },
        ],
        isRequired: true,
      },
      select: { documentType: true, description: true },
    });

    result.documentationNeeded = docReqs.map(
      (d) => d.description || d.documentType
    );
  }

  // ── 5. Denial pattern warnings ──
  if (resolvedPayerId && input.cptCodes.length > 0) {
    const denialPatterns = await prisma.denialPattern.findMany({
      where: {
        OR: [
          { payerId: resolvedPayerId, cptCode: { in: input.cptCodes } },
          { payerId: resolvedPayerId, cptCode: null },
        ],
      },
      orderBy: { frequency: "desc" },
      take: 3,
      select: { reasonDescription: true, preventionTip: true },
    });

    result.denialWarnings = denialPatterns
      .map((d) => d.preventionTip || d.reasonDescription)
      .filter(Boolean) as string[];
  }

  return result;
}

/**
 * Detect service category from CPT code ranges.
 */
function detectServiceCategory(cptCodes: string[]): string | null {
  for (const code of cptCodes) {
    const num = parseInt(code, 10);
    if (isNaN(num)) continue;

    // Imaging CPT ranges
    if (
      (num >= 70010 && num <= 76499) || // Radiology
      (num >= 76500 && num <= 76999) || // Ultrasound
      (num >= 77001 && num <= 79999)    // Nuclear medicine
    ) {
      return "imaging";
    }

    // Surgical CPT ranges
    if (num >= 10004 && num <= 69990) {
      return "surgical";
    }
  }

  return null;
}
