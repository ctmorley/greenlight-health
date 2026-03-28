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
  buildAppealPrompt,
} from "@/lib/ai";

const requestSchema = z.object({
  denialId: z.string().min(1, "denialId is required"),
  additionalEvidence: z.string().optional(),
});

/**
 * POST /api/ai/draft-appeal
 * Draft an appeal letter for a denied PA request.
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

    const { denialId, additionalEvidence } = parsed.data;

    // Fetch denial with PA request and related data
    const denial = await prisma.denial.findUnique({
      where: { id: denialId },
      include: {
        priorAuth: {
          include: {
            patient: true,
            payer: true,
            appeals: {
              orderBy: { createdAt: "asc" },
              select: { appealLevel: true, appealReason: true, status: true },
            },
          },
        },
      },
    });

    if (!denial) {
      return NextResponse.json({ error: "Denial not found" }, { status: 404 });
    }

    // Verify org access
    if (denial.priorAuth.organizationId !== organizationId) {
      return NextResponse.json({ error: "Denial not found" }, { status: 404 });
    }

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      denialId,
      "Drafted appeal letter"
    ).catch(() => {});

    const paRequest = denial.priorAuth;

    // De-identify clinical notes
    const clinicalText = paRequest.clinicalNotes || "";
    const { sanitized: sanitizedNotes, mappings } = deIdentify(clinicalText);

    // Determine appeal level based on existing appeals
    const existingAppeals = paRequest.appeals.length;
    const appealLevel =
      existingAppeals === 0
        ? "first"
        : existingAppeals === 1
          ? "second"
          : "external_review";

    // Build prompt
    const { system, user } = buildAppealPrompt({
      denialReason: denial.reasonDescription || "Not specified",
      denialReasonCategory: denial.reasonCategory,
      denialDate: denial.denialDate.toISOString().split("T")[0],
      payerName: paRequest.payer?.name || "Unknown Payer",
      payerNotes: denial.payerNotes || undefined,
      serviceDescription: paRequest.procedureDescription || paRequest.serviceType || "Not specified",
      cptCodes: paRequest.cptCodes,
      icd10Codes: paRequest.icd10Codes,
      clinicalNotes: sanitizedNotes,
      priorAppeals: paRequest.appeals.map(
        (a) => `${a.appealLevel} — ${a.status}: ${a.appealReason}`
      ),
      appealLevel,
      additionalEvidence: additionalEvidence || undefined,
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
    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("\n");

    // Split appeal letter from suggested evidence
    const evidenceSeparator = "SUGGESTED_ADDITIONAL_EVIDENCE:";
    const parts = rawText.split(evidenceSeparator);
    const rawLetter = parts[0].trim();
    const suggestedEvidence = parts[1]
      ? parts[1]
          .trim()
          .split("\n")
          .map((line) => line.replace(/^-\s*/, "").trim())
          .filter(Boolean)
      : [];

    // Re-identify PHI in the generated letter
    const letter = reIdentify(rawLetter, mappings);

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return NextResponse.json({
      letter,
      suggestedEvidence,
      metadata: {
        model: AI_MODEL,
        tokensUsed,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error("Draft appeal error:", error);
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
    return NextResponse.json({ error: "Failed to draft appeal" }, { status: 500 });
  }
}
