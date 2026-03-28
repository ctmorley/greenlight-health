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
  deIdentify,
  reIdentify,
  buildLmnPrompt,
} from "@/lib/ai";

const requestSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  additionalContext: z.string().optional(),
});

/**
 * POST /api/ai/generate-lmn
 * Generate a Letter of Medical Necessity for a PA request.
 * De-identifies PHI before sending to Claude, re-identifies in response.
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

    const { requestId, additionalContext } = parsed.data;

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      requestId,
      "Generated Letter of Medical Necessity"
    ).catch(() => {});

    // Fetch PA request with related data
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        patient: true,
        payer: true,
        insurance: { include: { payer: true } },
        documents: { select: { fileName: true, category: true } },
      },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Look up ACR criteria for the CPT/ICD codes
    const _guidelines = await prisma.clinicalGuideline.findMany({
      where: {
        OR: [
          { cptCodes: { hasSome: paRequest.cptCodes } },
          { icd10Codes: { hasSome: paRequest.icd10Codes } },
        ],
      },
      take: 5,
      orderBy: { rating: "desc" },
    });

    // Build payer requirements from policies
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

    const payerRequirements = payerPolicies
      .map((p) => `${p.policyName}: ${p.requiredDocuments.join(", ")}`)
      .join("\n");

    // De-identify clinical notes
    const clinicalText = paRequest.clinicalNotes || "";
    const { sanitized: sanitizedNotes, mappings } = deIdentify(clinicalText);

    // Calculate patient age
    const now = new Date();
    const dob = new Date(paRequest.patient.dob);
    const patientAge = Math.floor(
      (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );

    // Build prompt
    const { system, user } = buildLmnPrompt({
      patientAge,
      gender: paRequest.patient.gender,
      serviceCategory: paRequest.serviceCategory || "imaging",
      serviceType: paRequest.serviceType || "unknown",
      cptCodes: paRequest.cptCodes,
      icd10Codes: paRequest.icd10Codes,
      procedureDescription: paRequest.procedureDescription || "",
      clinicalNotes: sanitizedNotes,
      payerName: paRequest.payer?.name || "Unknown Payer",
      payerRequirements: payerRequirements || undefined,
      additionalContext: additionalContext || undefined,
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

    // Extract text from response
    const rawLetter = response.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("\n");

    // Re-identify PHI in the generated letter
    const letter = reIdentify(rawLetter, mappings);

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return NextResponse.json({
      letter,
      metadata: {
        model: AI_MODEL,
        tokensUsed,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error("Generate LMN error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    // Distinguish Claude API errors from other errors
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
    return NextResponse.json({ error: "Failed to generate letter" }, { status: 500 });
  }
}
