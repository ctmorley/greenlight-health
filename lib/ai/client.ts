/**
 * Anthropic SDK singleton with error handling, model config,
 * and missing-key guard.
 *
 * All AI features use this module to obtain a configured Anthropic
 * client instance. The client is lazily initialized and cached for
 * the lifetime of the process.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Default model for all AI requests */
export const AI_MODEL = "claude-opus-4-20250514";

/** Maximum tokens for generation responses */
export const AI_MAX_TOKENS = 4096;

let clientInstance: Anthropic | null = null;

/**
 * Returns a configured Anthropic client instance.
 *
 * @throws {Error} If ANTHROPIC_API_KEY environment variable is not set.
 *   The error message is safe to surface to API consumers (no secrets).
 */
export function getAnthropicClient(): Anthropic {
  if (clientInstance) {
    return clientInstance;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "AI service not configured: ANTHROPIC_API_KEY environment variable is not set."
    );
  }

  clientInstance = new Anthropic({ apiKey });
  return clientInstance;
}

/**
 * Checks whether the Anthropic API key is configured.
 * Use this for health checks without throwing.
 */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
