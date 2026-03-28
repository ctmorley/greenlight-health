/**
 * System and user prompt templates for all AI endpoints.
 *
 * Each prompt builder constructs a structured prompt optimized for
 * Claude, including role instructions, output format requirements,
 * and domain-specific medical knowledge framing.
 */

// ─── LMN Generation ────────────────────────────────────────

export interface LmnPromptInput {
  patientAge: number;
  gender: string;
  serviceCategory: string;
  serviceType: string;
  cptCodes: string[];
  icd10Codes: string[];
  procedureDescription: string;
  clinicalNotes: string;
  payerName: string;
  payerRequirements?: string;
  additionalContext?: string;
}

/**
 * Builds the system + user prompt for Letter of Medical Necessity generation.
 * The prompt guides Claude to produce a formal LMN that addresses medical
 * necessity criteria, payer-specific requirements, and clinical evidence.
 */
export function buildLmnPrompt(input: LmnPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a medical documentation specialist assisting healthcare providers with Letters of Medical Necessity (LMN). Your role is to draft comprehensive, clinically accurate letters that clearly establish medical necessity for requested procedures.

Guidelines:
- Use formal medical letter format with professional tone
- Reference specific clinical findings, diagnoses, and treatment history
- Address payer-specific requirements and medical necessity criteria
- Cite relevant CPT and ICD-10 codes with clinical justification
- Include evidence-based rationale referencing accepted clinical guidelines
- Structure the letter with: patient background, clinical indication, medical necessity justification, and conclusion
- Do NOT fabricate clinical information — only use what is provided
- Keep the letter concise but thorough (typically 1-2 pages)`;

  const user = `Please draft a Letter of Medical Necessity for the following case:

Patient Demographics:
- Age: ${input.patientAge}
- Gender: ${input.gender}

Requested Service:
- Category: ${input.serviceCategory}
- Type: ${input.serviceType}
- CPT Codes: ${input.cptCodes.join(", ") || "Not specified"}
- Procedure: ${input.procedureDescription || "Not specified"}

Diagnoses (ICD-10):
${input.icd10Codes.length > 0 ? input.icd10Codes.map((c) => `- ${c}`).join("\n") : "- Not specified"}

Clinical Notes:
${input.clinicalNotes || "No clinical notes provided."}

Payer: ${input.payerName}
${input.payerRequirements ? `Payer-Specific Requirements:\n${input.payerRequirements}` : ""}
${input.additionalContext ? `\nAdditional Context:\n${input.additionalContext}` : ""}

Please generate a complete Letter of Medical Necessity addressing all relevant medical necessity criteria.`;

  return { system, user };
}

// ─── Appeal Drafting ───────────────────────────────────────

export interface AppealPromptInput {
  denialReason: string;
  denialReasonCategory: string;
  denialDate: string;
  payerName: string;
  payerNotes?: string;
  serviceDescription: string;
  cptCodes: string[];
  icd10Codes: string[];
  clinicalNotes: string;
  priorAppeals?: string[];
  appealLevel: string;
  additionalEvidence?: string;
}

/**
 * Builds the system + user prompt for appeal letter drafting.
 * The prompt guides Claude to construct a persuasive appeal that
 * addresses the specific denial reasons with clinical evidence.
 */
export function buildAppealPrompt(input: AppealPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a healthcare appeals specialist with expertise in overturning prior authorization denials. Your role is to draft compelling appeal letters that address specific denial reasons with clinical evidence and regulatory references.

Guidelines:
- Address each denial reason directly and systematically
- Reference payer-specific policies, CMS guidelines, and clinical evidence
- Cite relevant medical literature and clinical guidelines supporting the procedure
- Maintain a professional, evidence-based tone
- Structure the appeal with: introduction, denial response, clinical justification, regulatory references, and requested action
- For second-level appeals, reference what was presented in the first appeal
- For external reviews, emphasize independent review standards
- Suggest additional evidence that could strengthen the case
- Do NOT fabricate clinical information — only use what is provided

Output format: Provide the appeal letter followed by a section titled "SUGGESTED_ADDITIONAL_EVIDENCE:" listing evidence items that could strengthen this appeal, one per line starting with "- ".`;

  const user = `Please draft an appeal letter for the following denied prior authorization:

Appeal Level: ${input.appealLevel}
Denial Date: ${input.denialDate}
Denial Reason Category: ${input.denialReasonCategory}
Denial Reason: ${input.denialReason}
${input.payerNotes ? `Payer Notes: ${input.payerNotes}` : ""}

Original Request:
- Service: ${input.serviceDescription}
- CPT Codes: ${input.cptCodes.join(", ") || "Not specified"}
- ICD-10 Codes: ${input.icd10Codes.join(", ") || "Not specified"}

Clinical Evidence:
${input.clinicalNotes || "No clinical notes provided."}

Payer: ${input.payerName}
${input.priorAppeals && input.priorAppeals.length > 0 ? `\nPrior Appeal History:\n${input.priorAppeals.map((a, i) => `Appeal ${i + 1}: ${a}`).join("\n")}` : ""}
${input.additionalEvidence ? `\nNew Evidence:\n${input.additionalEvidence}` : ""}

Please generate a complete appeal letter and suggest additional evidence that could strengthen this case.`;

  return { system, user };
}

// ─── Approval Prediction ──────────────────────────────────

export interface PredictionPromptInput {
  serviceCategory: string;
  serviceType: string;
  cptCodes: string[];
  icd10Codes: string[];
  payerName: string;
  payerType: string;
  acrRating?: number;
  acrCategory?: string;
  documentationCompleteness: number; // 0-100
  hasRequiredDocs: boolean;
  historicalApprovalRate?: number;
  commonDenialReasons?: string[];
}

/**
 * Builds the system + user prompt for approval probability prediction.
 * NOTE: This prompt intentionally contains NO PHI — only codes and
 * categorical data are included.
 */
export function buildPredictionPrompt(input: PredictionPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a prior authorization analytics engine. Based on the provided clinical codes, payer information, and documentation status, predict the likelihood of approval and identify risk factors.

You must respond in EXACTLY this JSON format (no markdown, no extra text):
{
  "probability": <number 0-100>,
  "riskLevel": "<low|medium|high>",
  "factors": {
    "positive": ["<factor1>", "<factor2>"],
    "negative": ["<factor1>", "<factor2>"],
    "missing": ["<factor1>", "<factor2>"]
  },
  "recommendations": ["<recommendation1>", "<recommendation2>"]
}

Rules:
- probability must be a number between 0 and 100
- riskLevel: "low" if probability >= 70, "medium" if 40-69, "high" if < 40
- Analyze the CPT codes, ICD-10 codes, payer patterns, ACR appropriateness, and documentation completeness
- Be realistic based on industry patterns for the given payer type
- Recommendations should be actionable steps to improve approval chances
- Do NOT include any patient-identifying information in your response`;

  const user = `Analyze the following prior authorization request and predict approval likelihood:

Service:
- Category: ${input.serviceCategory}
- Type: ${input.serviceType}
- CPT Codes: ${input.cptCodes.join(", ") || "None specified"}
- ICD-10 Codes: ${input.icd10Codes.join(", ") || "None specified"}

Payer Information:
- Payer: ${input.payerName}
- Payer Type: ${input.payerType}
${input.historicalApprovalRate !== undefined ? `- Historical Approval Rate: ${(input.historicalApprovalRate * 100).toFixed(1)}%` : ""}

Clinical Appropriateness:
${input.acrRating !== undefined ? `- ACR Rating: ${input.acrRating}/9 (${input.acrCategory || "unrated"})` : "- ACR Rating: Not available"}

Documentation:
- Completeness: ${input.documentationCompleteness}%
- All Required Documents Present: ${input.hasRequiredDocs ? "Yes" : "No"}

${input.commonDenialReasons && input.commonDenialReasons.length > 0 ? `Known Denial Patterns for this Payer/Service:\n${input.commonDenialReasons.map((r) => `- ${r}`).join("\n")}` : ""}

Provide your prediction in the specified JSON format.`;

  return { system, user };
}

// ─── Clinical Summarization ───────────────────────────────

export interface SummaryPromptInput {
  serviceDescription: string;
  cptCodes: string[];
  icd10Codes: string[];
  clinicalNotes: string;
  documentMetadata?: string[];
  additionalNotes?: string;
}

/**
 * Builds the system + user prompt for clinical note summarization.
 * The prompt guides Claude to extract key findings, diagnoses, and
 * clinical relevance for the prior authorization context.
 */
export function buildSummaryPrompt(input: SummaryPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a clinical documentation summarization engine for prior authorization support. Your role is to distill clinical notes into concise, relevant summaries that highlight information pertinent to the requested procedure.

You must respond in EXACTLY this JSON format (no markdown, no extra text):
{
  "summary": "<concise clinical summary paragraph>",
  "keyFindings": ["<finding1>", "<finding2>"],
  "supportingDiagnoses": ["<diagnosis1>", "<diagnosis2>"]
}

Guidelines:
- Focus on findings relevant to the requested procedure/service
- Extract key clinical findings that support medical necessity
- Identify primary and secondary diagnoses mentioned in the notes
- Be concise but clinically accurate
- Do NOT fabricate information not present in the source notes
- Organize findings by clinical relevance to the authorization request`;

  const user = `Please summarize the following clinical documentation for a prior authorization request:

Requested Service:
- Description: ${input.serviceDescription || "Not specified"}
- CPT Codes: ${input.cptCodes.join(", ") || "None specified"}
- ICD-10 Codes: ${input.icd10Codes.join(", ") || "None specified"}

Clinical Notes:
${input.clinicalNotes || "No clinical notes provided."}
${input.additionalNotes ? `\nAdditional Notes:\n${input.additionalNotes}` : ""}
${input.documentMetadata && input.documentMetadata.length > 0 ? `\nAttached Documents:\n${input.documentMetadata.map((d) => `- ${d}`).join("\n")}` : ""}

Provide a structured summary in the specified JSON format.`;

  return { system, user };
}
