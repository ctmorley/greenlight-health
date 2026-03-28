/**
 * Appeal Letter Drafting Logic
 *
 * Fetches denial context + PA + prior appeals, de-identifies PHI,
 * calls Claude with appeal prompt, parses suggested evidence,
 * and re-identifies the response.
 */

import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  AI_MODEL,
  AI_MAX_TOKENS,
  deIdentify,
  reIdentify,
  buildAppealPrompt,
} from "@/lib/ai";
import type { AppealLevel, DraftAppealOutput } from "./types";
import { NotFoundError } from "./lmn-generator";

/**
 * Assembles appeal context from the database, de-identifies PHI,
 * sends to Claude, and returns the re-identified appeal letter
 * along with suggested additional evidence.
 */
export async function assembleAppealContext(
  denialId: string,
  organizationId: string,
  additionalEvidence?: string,
  requestedAppealLevel?: AppealLevel
): Promise<DraftAppealOutput> {
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
    throw new NotFoundError("Denial not found");
  }

  // Verify org access
  if (denial.priorAuth.organizationId !== organizationId) {
    throw new NotFoundError("Denial not found");
  }

  const paRequest = denial.priorAuth;

  // De-identify clinical notes
  const clinicalText = paRequest.clinicalNotes || "";
  const { sanitized: sanitizedNotes, mappings } = deIdentify(clinicalText);

  // Determine appeal level: use requested level, or infer from existing appeals
  const existingAppeals = paRequest.appeals.length;
  const appealLevel: string =
    requestedAppealLevel ||
    (existingAppeals === 0
      ? "first"
      : existingAppeals === 1
        ? "second"
        : "external_review");

  // Build prompt
  const { system, user } = buildAppealPrompt({
    denialReason: denial.reasonDescription || "Not specified",
    denialReasonCategory: denial.reasonCategory,
    denialDate: denial.denialDate.toISOString().split("T")[0],
    payerName: paRequest.payer?.name || "Unknown Payer",
    payerNotes: denial.payerNotes || undefined,
    serviceDescription:
      paRequest.procedureDescription || paRequest.serviceType || "Not specified",
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
    .map((block) => (block.type === "text" ? block.text : ""))
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

  return {
    letter,
    suggestedEvidence,
    metadata: {
      model: AI_MODEL,
      tokensUsed,
      processingTimeMs,
    },
  };
}
