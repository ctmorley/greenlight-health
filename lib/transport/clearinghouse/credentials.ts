/**
 * Clearinghouse Credential Resolver
 *
 * Resolves a credentialRef string to actual API credentials from environment
 * variables. Credentials are never stored in the database — only an opaque
 * reference that maps to env vars at runtime.
 *
 * Format:
 *   "env://PREFIX"  →  reads PREFIX_API_KEY, PREFIX_API_SECRET, PREFIX_SUBMITTER_ID
 *
 * Example:
 *   credentialRef = "env://AVAILITY"
 *   → AVAILITY_API_KEY, AVAILITY_API_SECRET, AVAILITY_SUBMITTER_ID (optional)
 */

import type { ClearinghouseCredentials } from "./types";

export class CredentialResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialResolutionError";
  }
}

export function resolveCredentials(credentialRef: string): ClearinghouseCredentials {
  if (!credentialRef.startsWith("env://")) {
    throw new CredentialResolutionError(
      `Unsupported credential reference format: "${credentialRef}". Expected "env://PREFIX".`
    );
  }

  const prefix = credentialRef.slice("env://".length);
  if (!prefix) {
    throw new CredentialResolutionError(
      "Credential reference prefix is empty. Expected format: env://PREFIX"
    );
  }

  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!apiKey) {
    throw new CredentialResolutionError(
      `Missing environment variable: ${prefix}_API_KEY`
    );
  }

  const apiSecret = process.env[`${prefix}_API_SECRET`];
  if (!apiSecret) {
    throw new CredentialResolutionError(
      `Missing environment variable: ${prefix}_API_SECRET`
    );
  }

  const submitterId = process.env[`${prefix}_SUBMITTER_ID`] || undefined;

  return { apiKey, apiSecret, submitterId };
}
