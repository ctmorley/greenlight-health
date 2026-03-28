/**
 * Clinical Note Summarization Logic
 *
 * Fetches PA context + clinical notes + document metadata,
 * de-identifies PHI, calls Claude for summarization,
 * and re-identifies each field in the structured response.
 */

import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  AI_MODEL,
  AI_MAX_TOKENS,
  deIdentify,
  reIdentify,
  buildSummaryPrompt,
} from "@/lib/ai";
import type { SummarizeClinicalOutput } from "./types";
import { NotFoundError } from "./lmn-generator";

/**
 * Assembles clinical summarization context from the database,
 * de-identifies PHI, sends to Claude, and returns the re-identified
 * summary with key findings and supporting diagnoses.
 */
export async function assembleSummaryContext(
  requestId: string,
  organizationId: string,
  notes?: string
): Promise<SummarizeClinicalOutput> {
  // Fetch PA request with related data (org-scoped)
  const paRequest = await prisma.priorAuthRequest.findFirst({
    where: { id: requestId, organizationId },
    include: {
      documents: { select: { fileName: true, category: true } },
    },
  });

  if (!paRequest) {
    throw new NotFoundError("Request not found");
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
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");

  const result = parseSummaryResponse(rawText, mappings);

  const tokensUsed =
    (response.usage?.input_tokens || 0) +
    (response.usage?.output_tokens || 0);

  return {
    summary: result.summary,
    keyFindings: result.keyFindings,
    supportingDiagnoses: result.supportingDiagnoses,
    metadata: {
      model: AI_MODEL,
      tokensUsed,
      processingTimeMs,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

interface SummaryResult {
  summary: string;
  keyFindings: string[];
  supportingDiagnoses: string[];
}

/**
 * Parses the Claude JSON response and re-identifies PHI in each field.
 * Falls back to raw text as summary if JSON parsing fails.
 */
function parseSummaryResponse(
  rawText: string,
  mappings: Map<string, string>
): SummaryResult {
  let parsed: SummaryResult;

  try {
    parsed = JSON.parse(rawText.trim()) as SummaryResult;
  } catch {
    // Fallback if Claude didn't return valid JSON
    return {
      summary: reIdentify(rawText.trim(), mappings),
      keyFindings: [],
      supportingDiagnoses: [],
    };
  }

  // Re-identify PHI in each field
  return {
    summary: parsed.summary ? reIdentify(parsed.summary, mappings) : "",
    keyFindings: (parsed.keyFindings || []).map((f: string) =>
      reIdentify(f, mappings)
    ),
    supportingDiagnoses: (parsed.supportingDiagnoses || []).map((d: string) =>
      reIdentify(d, mappings)
    ),
  };
}
