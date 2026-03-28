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
  buildSummaryPrompt,
} from "@/lib/ai";

const requestSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  notes: z.string().optional(),
});

/**
 * POST /api/ai/summarize-clinical
 * Summarize clinical justification for a PA request.
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

    const { requestId, notes } = parsed.data;

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      requestId,
      "Summarized clinical documentation"
    ).catch(() => {});

    // Fetch PA request with related data
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        documents: { select: { fileName: true, category: true } },
      },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // De-identify clinical notes
    const clinicalText = paRequest.clinicalNotes || "";
    const additionalText = notes || "";
    const combinedText = [clinicalText, additionalText].filter(Boolean).join("\n\n");
    const { sanitized: sanitizedNotes, mappings } = deIdentify(combinedText);

    // Build prompt
    const { system, user } = buildSummaryPrompt({
      serviceDescription:
        paRequest.procedureDescription || paRequest.serviceType || "Not specified",
      cptCodes: paRequest.cptCodes,
      icd10Codes: paRequest.icd10Codes,
      clinicalNotes: sanitizedNotes,
      documentMetadata: paRequest.documents.map(
        (d) => `${d.category}: ${d.fileName}`
      ),
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

    let result;
    try {
      result = JSON.parse(rawText.trim());
    } catch {
      // Fallback if Claude didn't return valid JSON
      result = {
        summary: reIdentify(rawText.trim(), mappings),
        keyFindings: [],
        supportingDiagnoses: [],
      };
    }

    // Re-identify PHI in the summary if it was parsed from JSON
    if (result.summary) {
      result.summary = reIdentify(result.summary, mappings);
    }
    if (result.keyFindings) {
      result.keyFindings = result.keyFindings.map((f: string) =>
        reIdentify(f, mappings)
      );
    }
    if (result.supportingDiagnoses) {
      result.supportingDiagnoses = result.supportingDiagnoses.map((d: string) =>
        reIdentify(d, mappings)
      );
    }

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return NextResponse.json({
      summary: result.summary,
      keyFindings: result.keyFindings || [],
      supportingDiagnoses: result.supportingDiagnoses || [],
      metadata: {
        model: AI_MODEL,
        tokensUsed,
        processingTimeMs,
      },
    });
  } catch (error) {
    console.error("Summarize clinical error:", error);
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
    return NextResponse.json({ error: "Failed to summarize clinical data" }, { status: 500 });
  }
}
