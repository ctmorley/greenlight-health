/**
 * PHI De-identification / Re-identification Engine
 *
 * Before any text is sent to an LLM, all Protected Health Information
 * (PHI) must be replaced with tokens. After receiving the LLM response,
 * tokens are mapped back to original values (except SSN, which is never
 * re-inserted).
 *
 * Covered PHI elements per HIPAA Safe Harbor (45 CFR § 164.514(b)):
 * - Patient names
 * - Dates of birth
 * - Medical Record Numbers (MRN)
 * - Social Security Numbers (SSN)
 * - Phone numbers
 * - Street addresses
 * - Email addresses
 * - Provider names (detected via common title patterns)
 */

import type { DeIdentifyResult } from "./types";

// ─── Regex Patterns ────────────────────────────────────────

/** SSN: 123-45-6789 or 123456789 */
const SSN_PATTERN = /\b\d{3}-?\d{2}-?\d{4}\b/g;

/** MRN: common formats like MRN-001234, MRN 001234, MRN:001234, or bare MRN followed by digits */
const MRN_PATTERN = /\bMRN[\s:#-]*\d{3,10}\b/gi;

/** Phone: US formats (123) 456-7890, 123-456-7890, 123.456.7890 */
const PHONE_PATTERN =
  /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s./-]?\d{3}[\s./-]?\d{4}\b/g;

/** Email */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Street address: number + street name + type */
const ADDRESS_PATTERN =
  /\b\d{1,6}\s+(?:[A-Z][a-z]+\s*){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir|Trail|Trl)\.?\b/gi;

/** Provider names: Dr./Doctor/NP/PA followed by name */
const PROVIDER_PATTERN =
  /\b(?:Dr\.?|Doctor|NP|PA-C|PA|MD|DO|RN|NP-C)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;

/**
 * Patient name detection: capitalized word sequences that appear near
 * contextual keywords (Patient, Name, Mr., Mrs., Ms., etc.)
 * This is intentionally conservative to reduce false positives.
 */
const PATIENT_NAME_CONTEXT_PATTERN =
  /\b(?:Patient|Name|Mr\.?|Mrs\.?|Ms\.?|Miss)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;

// ─── De-identification ─────────────────────────────────────

/**
 * Strips PHI from text, replacing with tokens. Returns sanitized text
 * and a bidirectional mapping for re-identification.
 *
 * @param text - Raw clinical text that may contain PHI
 * @returns Sanitized text and a Map of token → original value
 */
export function deIdentify(text: string): DeIdentifyResult {
  if (!text || text.trim().length === 0) {
    return { sanitized: "", mappings: new Map() };
  }

  const mappings = new Map<string, string>();
  let sanitized = text;

  // SSN — replace first, never re-identified
  sanitized = sanitized.replace(SSN_PATTERN, (match) => {
    // Store with a special key prefix so reIdentify knows to skip it
    const token = "[SSN_REDACTED]";
    mappings.set(token, `__SSN_NO_REIDENTIFY__${match}`);
    return token;
  });

  // MRN
  sanitized = sanitized.replace(MRN_PATTERN, (match) => {
    const token = "[MRN_REDACTED]";
    if (!mappings.has(token)) {
      mappings.set(token, match);
    }
    return token;
  });

  // DOB — match DOB-prefixed dates first
  const dobPrefixPattern = /\bDOB[\s:]*(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{2,4})\b/gi;
  sanitized = sanitized.replace(dobPrefixPattern, (match) => {
    const token = "[DOB_REDACTED]";
    if (!mappings.has(token)) {
      mappings.set(token, match);
    }
    return token;
  });

  // Email
  let emailCounter = 0;
  sanitized = sanitized.replace(EMAIL_PATTERN, (match) => {
    emailCounter++;
    const token = emailCounter === 1 ? "[EMAIL_REDACTED]" : `[EMAIL_REDACTED_${emailCounter}]`;
    mappings.set(token, match);
    return token;
  });

  // Phone
  let phoneCounter = 0;
  sanitized = sanitized.replace(PHONE_PATTERN, (match) => {
    // Avoid matching numbers that are clearly not phones (e.g., short digit sequences already replaced)
    if (match.replace(/\D/g, "").length < 10) return match;
    phoneCounter++;
    const token = phoneCounter === 1 ? "[PHONE_REDACTED]" : `[PHONE_REDACTED_${phoneCounter}]`;
    mappings.set(token, match);
    return token;
  });

  // Address
  let addrCounter = 0;
  sanitized = sanitized.replace(ADDRESS_PATTERN, (match) => {
    addrCounter++;
    const token = addrCounter === 1 ? "[ADDR_REDACTED]" : `[ADDR_REDACTED_${addrCounter}]`;
    mappings.set(token, match);
    return token;
  });

  // Provider names
  let providerCounter = 0;
  sanitized = sanitized.replace(PROVIDER_PATTERN, (match, name) => {
    providerCounter++;
    const token = `[PROVIDER_${String(providerCounter).padStart(3, "0")}]`;
    mappings.set(token, name);
    // Replace the full match but keep the title prefix
    return match.replace(name, token);
  });

  // Patient names (context-based)
  let patientCounter = 0;
  sanitized = sanitized.replace(PATIENT_NAME_CONTEXT_PATTERN, (match, name) => {
    patientCounter++;
    const token = `[PATIENT_${String(patientCounter).padStart(3, "0")}]`;
    mappings.set(token, name);
    return match.replace(name, token);
  });

  return { sanitized, mappings };
}

// ─── Re-identification ─────────────────────────────────────

/**
 * Restores original PHI values in LLM-generated text using the mapping
 * from deIdentify(). SSN tokens are left redacted (never re-inserted).
 *
 * @param text - LLM response containing PHI tokens
 * @param mappings - Token → original value map from deIdentify()
 * @returns Text with PHI restored (except SSN)
 */
export function reIdentify(
  text: string,
  mappings: Map<string, string>
): string {
  if (!text || mappings.size === 0) {
    return text;
  }

  let result = text;

  for (const [token, original] of mappings) {
    // Never re-identify SSN
    if (original.startsWith("__SSN_NO_REIDENTIFY__")) {
      continue;
    }

    // Replace all occurrences of the token with the original value
    result = result.split(token).join(original);
  }

  return result;
}
