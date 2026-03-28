import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  getAnthropicClient,
  isAiConfigured,
  AI_MODEL,
  AI_MAX_TOKENS,
  buildPredictionPrompt,
} from "@/lib/ai";

const requestSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
});

/**
 * POST /api/ai/predict-approval
 * Predict approval probability for a PA request.
 * NEVER sends PHI to Claude — only CPT/ICD-10 codes, payer info,
 * ACR rating, and documentation completeness.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.ai);
  if (rateLimited) return rateLimited;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 }
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { requestId } = parsed.data;

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      requestId,
      "Predicted approval probability"
    ).catch(() => {});

    // Fetch PA request — only non-PHI fields needed for prediction
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        payer: true,
        documents: { select: { category: true } },
      },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
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
              { payerId: paRequest.payerId, serviceCategory: paRequest.serviceCategory ?? undefined },
            ],
          },
          take: 5,
          orderBy: { frequency: "desc" },
        })
      : [];

    // Calculate documentation completeness
    const requiredDocs = new Set<string>();
    for (const policy of payerPolicies) {
      for (const doc of policy.requiredDocuments) {
        requiredDocs.add(doc);
      }
    }
    const presentDocs = new Set<string>(paRequest.documents.map((d) => d.category));
    const hasNotes = !!paRequest.clinicalNotes;
    const totalExpected = Math.max(requiredDocs.size, 1);
    let matchCount = 0;
    for (const req of requiredDocs) {
      if (presentDocs.has(req) || (req === "clinical_notes" && hasNotes)) {
        matchCount++;
      }
    }
    const documentationCompleteness = Math.round(
      (matchCount / totalExpected) * 100
    );

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
      documentationCompleteness,
      hasRequiredDocs: matchCount >= requiredDocs.size,
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
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("\n");

    let prediction;
    try {
      prediction = JSON.parse(rawText.trim());
    } catch {
      // If Claude didn't return valid JSON, provide a fallback
      prediction = {
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

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return NextResponse.json({
      probability: prediction.probability,
      riskLevel: prediction.riskLevel,
      factors: prediction.factors,
      recommendations: prediction.recommendations,
      metadata: {
        model: AI_MODEL,
        tokensUsed,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error("Predict approval error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (
      error instanceof Error &&
      (error.message.includes("Anthropic") ||
        error.message.includes("API") ||
        error.message.includes("401") ||
        error.message.includes("429") ||
        error.message.includes("500"))
    ) {
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Failed to predict approval" }, { status: 500 });
  }
}
