/**
 * Centralized denial reason reference data.
 * Single source of truth consumed by seed script, API validation, and UI components.
 */

export const DENIAL_REASON_CATEGORIES = [
  { value: "medical_necessity", label: "Medical Necessity" },
  { value: "incomplete_documentation", label: "Incomplete Documentation" },
  { value: "out_of_network", label: "Out of Network" },
  { value: "service_not_covered", label: "Service Not Covered" },
  { value: "missing_precert", label: "Missing Pre-certification" },
  { value: "coding_error", label: "Coding Error" },
  { value: "other", label: "Other" },
] as const;

export type DenialReasonCategoryValue = (typeof DENIAL_REASON_CATEGORIES)[number]["value"];

export const VALID_DENIAL_CATEGORY_VALUES = DENIAL_REASON_CATEGORIES.map((c) => c.value);

export interface DenialReasonCode {
  code: string;
  label: string;
  description: string;
  category: DenialReasonCategoryValue;
}

/**
 * Known denial reason codes grouped by category.
 * These are the canonical codes — the API validates against them when a code is provided.
 */
export const DENIAL_REASON_CODES: DenialReasonCode[] = [
  // Medical necessity
  { code: "MN001", label: "MN001 — Does not support medical necessity", description: "Clinical documentation does not support medical necessity for the requested service", category: "medical_necessity" },
  { code: "MN002", label: "MN002 — Conservative treatment not exhausted", description: "Conservative treatment options have not been exhausted", category: "medical_necessity" },
  { code: "MN003", label: "MN003 — Does not meet clinical guidelines", description: "Requested imaging does not meet clinical guidelines for the diagnosis", category: "medical_necessity" },
  // Incomplete documentation
  { code: "ID001", label: "ID001 — Missing clinical notes", description: "Missing clinical notes from ordering physician", category: "incomplete_documentation" },
  { code: "ID002", label: "ID002 — Prior imaging results not provided", description: "Prior imaging results not provided for comparison", category: "incomplete_documentation" },
  // Out of network
  { code: "OON01", label: "OON01 — Facility is out of network", description: "Rendering facility is out of network for the patient's plan", category: "out_of_network" },
  // Service not covered
  { code: "SNC01", label: "SNC01 — Not a covered benefit", description: "Requested procedure is not a covered benefit under the patient's plan", category: "service_not_covered" },
  // Missing pre-certification
  { code: "MP001", label: "MP001 — Service without prior authorization", description: "Service was performed without obtaining prior authorization", category: "missing_precert" },
  // Coding error
  { code: "CE001", label: "CE001 — CPT code does not match diagnosis", description: "CPT code does not match the diagnosis codes provided", category: "coding_error" },
  { code: "CE002", label: "CE002 — Duplicate authorization request", description: "Duplicate authorization request for the same service", category: "coding_error" },
  // Other
  { code: "OTH01", label: "OTH01 — Eligibility could not be verified", description: "Patient eligibility could not be verified at time of request", category: "other" },
];

/** Get all valid reason code strings. */
export const VALID_DENIAL_CODES = DENIAL_REASON_CODES.map((r) => r.code);

/** Get denial reason codes for a specific category. */
export function getCodesForCategory(category: string): DenialReasonCode[] {
  return DENIAL_REASON_CODES.filter((r) => r.category === category);
}

/** Validate that a reason code belongs to the given category (if both provided). */
export function isValidCodeForCategory(code: string, category: string): boolean {
  const entry = DENIAL_REASON_CODES.find((r) => r.code === code);
  return !!entry && entry.category === category;
}

/** Get the UI-friendly options grouped by category for Select components. */
export function getCodeOptionsForCategory(category: string): { value: string; label: string }[] {
  return getCodesForCategory(category).map((r) => ({ value: r.code, label: r.label }));
}
