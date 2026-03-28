/**
 * Approval Prediction Logic
 *
 * Fetches PA context including payer rules, ACR criteria, denial patterns,
 * and documentation completeness. Sends ONLY codes and categorical data
 * to Claude — NO PHI. Returns probability, risk level, factors, and
 * recommendations.
 */

import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  AI_MODEL,
  AI_MAX_TOKENS,
  buildPredictionPrompt,
} from "@/lib/ai";
import type { PredictApprovalOutput } from "./types";
import { NotFoundError } from "./lmn-generator";

/**
 * Assembles approval prediction context from the database.
 * Only non-PHI data (codes, categories, payer info) is sent to Claude.
 */
export async function assembleApprovalContext(
  requestId: string,
  organizationId: string
): Promise<PredictApprovalOutput> {
  // Fetch PA request — only non-PHI fields needed for prediction
  const paRequest = await prisma.priorAuthRequest.findFirst({
    where: { id: requestId, organizationId },
    include: {
      payer: true,
      documents: { select: { category: true } },
    },
  });

  if (!paRequest) {
    throw new NotFoundError("Request not found");
  }

  // Look up ACR guidelines for the CPT codes
  const guidelines = await prisma.clinicalGuideline.findMany({
    where: { cptCodes: { hasSome: paRequest.cptCodes } },
    take: 3,
    orderBy: { rating: "desc" },
  });

  const bestGuideline = guidelines[0] || null;

  // Look up payer-specific policies
  const payerPolicies = paRequest.payerId
    ? await prisma.payerClinicalPolicy.findMany({
        where: {
          payerId: paRequest.payerId,
          OR: [
            { cptCode: { in: paRequest.cptCodes } },
            { serviceCategory: paRequest.serviceCategory ?? undefined },
          ],
        },
        take: 3,
      })
    : [];

  // Look up denial patterns for this payer/service
  const denialPatterns = paRequest.payerId
    ? await prisma.denialPattern.findMany({
        where: {
          OR: [
            { payerId: paRequest.payerId, cptCode: { in: paRequest.cptCodes } },
            {
              payerId: paRequest.payerId,
              serviceCategory: paRequest.serviceCategory ?? undefined,
            },
          ],
        },
        take: 5,
        orderBy: { frequency: "desc" },
      })
    : [];

  // Calculate documentation completeness
  const documentationCompleteness = calculateDocCompleteness(
    payerPolicies,
    paRequest.documents.map((d) => d.category),
    !!paRequest.clinicalNotes
  );

  const requiredDocCount = countRequiredDocs(payerPolicies);
  const hasAllDocs = documentationCompleteness.matchCount >= requiredDocCount;

  // Build prompt — NO PHI, only codes and categorical data
  const { system, user } = buildPredictionPrompt({
    serviceCategory: paRequest.serviceCategory || "imaging",
    serviceType: paRequest.serviceType || "unknown",
    cptCodes: paRequest.cptCodes,
    icd10Codes: paRequest.icd10Codes,
    payerName: paRequest.payer?.name || "Unknown Payer",
    payerType: paRequest.payer?.type || "commercial",
    acrRating: bestGuideline?.rating,
    acrCategory: bestGuideline?.ratingCategory,
    documentationCompleteness: documentationCompleteness.percentage,
    hasRequiredDocs: hasAllDocs,
    historicalApprovalRate: payerPolicies[0]?.approvalRate ?? undefined,
    commonDenialReasons: denialPatterns.map((d) => d.reasonDescription),
  });

  // Call Claude
  const startTime = Date.now();
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });
  const processingTimeMs = Date.now() - startTime;

  // Extract text and parse JSON response
  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");

  const prediction = parsePrediction(rawText);

  const tokensUsed =
    (response.usage?.input_tokens || 0) +
    (response.usage?.output_tokens || 0);

  return {
    probability: prediction.probability,
    riskLevel: prediction.riskLevel,
    factors: prediction.factors,
    recommendations: prediction.recommendations,
    metadata: {
      model: AI_MODEL,
      tokensUsed,
      processingTimeMs,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

interface DocCompleteness {
  matchCount: number;
  percentage: number;
}

interface PolicyLike {
  requiredDocuments: string[];
}

function calculateDocCompleteness(
  policies: PolicyLike[],
  presentCategories: string[],
  hasNotes: boolean
): DocCompleteness {
  const requiredDocs = new Set<string>();
  for (const policy of policies) {
    for (const doc of policy.requiredDocuments) {
      requiredDocs.add(doc);
    }
  }

  const presentDocs = new Set<string>(presentCategories);
  const totalExpected = Math.max(requiredDocs.size, 1);

  let matchCount = 0;
  for (const req of requiredDocs) {
    if (presentDocs.has(req) || (req === "clinical_notes" && hasNotes)) {
      matchCount++;
    }
  }

  return {
    matchCount,
    percentage: Math.round((matchCount / totalExpected) * 100),
  };
}

function countRequiredDocs(policies: PolicyLike[]): number {
  const requiredDocs = new Set<string>();
  for (const policy of policies) {
    for (const doc of policy.requiredDocuments) {
      requiredDocs.add(doc);
    }
  }
  return requiredDocs.size;
}

interface PredictionResult {
  probability: number;
  riskLevel: "low" | "medium" | "high";
  factors: { positive: string[]; negative: string[]; missing: string[] };
  recommendations: string[];
}

function parsePrediction(rawText: string): PredictionResult {
  try {
    return JSON.parse(rawText.trim()) as PredictionResult;
  } catch {
    return {
      probability: 50,
      riskLevel: "medium",
      factors: {
        positive: [],
        negative: ["Unable to parse AI prediction"],
        missing: [],
      },
      recommendations: ["Review request manually"],
    };
  }
}
