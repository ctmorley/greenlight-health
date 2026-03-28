/**
 * AI Module — barrel exports
 *
 * Centralizes all AI-related functionality:
 * - Anthropic SDK client and configuration
 * - PHI de-identification / re-identification
 * - Prompt builders for all AI endpoints
 * - Shared types
 */

export { getAnthropicClient, isAiConfigured, AI_MODEL, AI_MAX_TOKENS } from "./client";
export { deIdentify, reIdentify } from "./de-identify";
export {
  buildLmnPrompt,
  buildAppealPrompt,
  buildPredictionPrompt,
  buildSummaryPrompt,
} from "./prompts";
export type {
  LmnPromptInput,
  AppealPromptInput,
  PredictionPromptInput,
  SummaryPromptInput,
} from "./prompts";
export type {
  AiMetadata,
  GenerateLmnInput,
  GenerateLmnOutput,
  DraftAppealInput,
  DraftAppealOutput,
  PredictApprovalInput,
  PredictApprovalOutput,
  SummarizeClinicalInput,
  SummarizeClinicalOutput,
  DeIdentifyResult,
  ApprovalFactors,
  RiskLevel,
  AppealLevel,
} from "./types";
