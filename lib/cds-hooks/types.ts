// ─── CDS Hooks Specification Types (v2.0) ─────────────────────
// Based on: https://cds-hooks.hl7.org/ballots/2023Sep/specification/current/

/**
 * CDS Service descriptor returned in the discovery response.
 */
export interface CdsService {
  hook: string;
  title: string;
  description: string;
  id: string;
  prefetch?: Record<string, string>;
  usageRequirements?: string;
}

/**
 * CDS Hook request body sent by the EHR.
 */
export interface CdsHookRequest {
  hook: string;
  hookInstance: string;
  fhirServer?: string;
  fhirAuthorization?: {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    subject: string;
  };
  context: Record<string, unknown>;
  prefetch?: Record<string, unknown>;
}

/**
 * CDS Hook response containing cards and/or system actions.
 */
export interface CdsHookResponse {
  cards: CdsCard[];
  systemActions?: CdsSuggestionAction[];
}

/**
 * A CDS Card displayed to the clinician.
 */
export interface CdsCard {
  uuid?: string;
  summary: string;
  detail?: string;
  indicator: "info" | "warning" | "critical";
  source: CdsSource;
  suggestions?: CdsSuggestion[];
  selectionBehavior?: "at-most-one" | "any";
  overrideReasons?: CdsOverrideReason[];
  links?: CdsLink[];
}

export interface CdsSource {
  label: string;
  url?: string;
  icon?: string;
  topic?: CdsCoding;
}

export interface CdsSuggestion {
  label: string;
  uuid?: string;
  isRecommended?: boolean;
  actions?: CdsSuggestionAction[];
}

export interface CdsSuggestionAction {
  type: "create" | "update" | "delete";
  description: string;
  resource?: unknown;
}

export interface CdsOverrideReason {
  code?: string;
  system?: string;
  display: string;
}

export interface CdsLink {
  label: string;
  url: string;
  type: "absolute" | "smart";
  appContext?: string;
}

export interface CdsCoding {
  system: string;
  code: string;
  display?: string;
}
