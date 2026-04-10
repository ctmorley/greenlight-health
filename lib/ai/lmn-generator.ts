/**
 * Letter of Medical Necessity (LMN) Generation Logic
 *
 * Fetches PA request context, de-identifies PHI, calls Claude with LMN prompt,
 * and re-identifies the response. Separated from the route handler for
 * testability and maintainability.
 */

import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  AI_MODEL,
  AI_MAX_TOKENS,
  deIdentify,
  reIdentify,
  buildLmnPrompt,
} from "@/lib/ai";
import type { GenerateLmnOutput } from "./types";

/**
 * Assembles full LMN context from the database, de-identifies PHI,
 * sends to Claude, and returns the re-identified letter.
 */
export async function assembleLmnContext(
  requestId: string,
  organizationId: string,
  additionalContext?: string
): Promise<GenerateLmnOutput> {
  // Fetch PA request with related data (org-scoped)
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
    throw new NotFoundError("Request not found");
  }

  // Look up ACR criteria for the CPT/ICD codes
  await prisma.clinicalGuideline.findMany({
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

  // De-identify both the stored notes and any user-supplied extra context
  // so ad hoc PHI does not bypass the redaction pipeline.
  const clinicalText = paRequest.clinicalNotes || "";
  const extraContextText = additionalContext || "";
  const sectionBreak = "\n\n__GREENLIGHT_ADDITIONAL_CONTEXT__\n\n";
  const combinedText = `${clinicalText}${sectionBreak}${extraContextText}`;
  const { sanitized: sanitizedCombined, mappings } = deIdentify(combinedText);
  const [sanitizedNotes, sanitizedAdditionalContext = ""] =
    sanitizedCombined.split(sectionBreak);

  // Calculate patient age (dob may be null post-cutover if read from non-decrypted record)
  const now = new Date();
  const rawDob = paRequest.patient.dob;
  const dob = rawDob ? new Date(rawDob) : new Date();
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
    additionalContext: sanitizedAdditionalContext || undefined,
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
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");

  // Re-identify PHI in the generated letter
  const letter = reIdentify(rawLetter, mappings);

  const tokensUsed =
    (response.usage?.input_tokens || 0) +
    (response.usage?.output_tokens || 0);

  return {
    letter,
    metadata: {
      model: AI_MODEL,
      tokensUsed,
      processingTimeMs,
    },
  };
}

/**
 * Custom error for resource not found (maps to 404).
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
