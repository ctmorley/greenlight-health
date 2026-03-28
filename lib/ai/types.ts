/**
 * Shared TypeScript types for all AI endpoints.
 *
 * Covers inputs, outputs, and metadata for:
 * - Letter of Medical Necessity (LMN) generation
 * - Appeal letter drafting
 * - Approval prediction
 * - Clinical summarization
 */

// ─── Common Metadata ───────────────────────────────────────

export interface AiMetadata {
  model: string;
  tokensUsed: number;
  processingTimeMs: number;
}

// ─── LMN Generation ────────────────────────────────────────

export interface GenerateLmnInput {
  requestId: string;
  additionalContext?: string;
}

export interface GenerateLmnOutput {
  letter: string;
  metadata: AiMetadata;
}

// ─── Appeal Drafting ───────────────────────────────────────

export type AppealLevel = "first" | "second" | "external_review";

export interface DraftAppealInput {
  denialId: string;
  additionalEvidence?: string;
  appealLevel?: AppealLevel;
}

export interface DraftAppealOutput {
  letter: string;
  suggestedEvidence: string[];
  metadata: AiMetadata;
}

// ─── Approval Prediction ──────────────────────────────────

export interface PredictApprovalInput {
  requestId: string;
}

export type RiskLevel = "low" | "medium" | "high";

export interface ApprovalFactors {
  positive: string[];
  negative: string[];
  missing: string[];
}

export interface PredictApprovalOutput {
  probability: number; // 0-100
  riskLevel: RiskLevel;
  factors: ApprovalFactors;
  recommendations: string[];
  metadata: AiMetadata;
}

// ─── Clinical Summarization ───────────────────────────────

export interface SummarizeClinicalInput {
  requestId: string;
  notes?: string;
}

export interface SummarizeClinicalOutput {
  summary: string;
  keyFindings: string[];
  supportingDiagnoses: string[];
  metadata: AiMetadata;
}

// ─── De-identification ────────────────────────────────────

export interface DeIdentifyResult {
  sanitized: string;
  mappings: Map<string, string>;
}
