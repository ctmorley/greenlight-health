// ─── Vendor Configuration Types ─────────────────────────────────
// Type definitions for multi-vendor EHR adapter system.

import type { EhrVendor } from "@prisma/client";

/**
 * Complete configuration for an EHR vendor, including developer portal,
 * FHIR capabilities, certification requirements, and known quirks.
 */
export interface VendorConfig {
  vendor: EhrVendor;
  displayName: string;
  description: string;
  marketShare: string;

  // Developer portal
  registrationUrl: string;
  sandboxUrl: string;
  documentationUrl: string;
  marketplaceName: string;

  // FHIR capabilities
  fhirVersion: string;
  supportedScopes: string[];
  supportsCrd: boolean;
  supportsDtr: boolean;
  supportsPas: boolean;
  supportsSmartV2: boolean;

  // Certification
  certificationSteps: string[];
  estimatedCertTimeline: string;
  annualListingCost: string;
  requiresCustomerSponsor: boolean;

  // Technical notes
  knownQuirks: string[];
  customExtensions: string[];
}

/**
 * Result from testing a connection to a FHIR server.
 * Returned by the /api/fhir/test-connection endpoint.
 */
export interface ConnectionTestResult {
  success: boolean;
  fhirVersion: string | null;
  smartConfigFound: boolean;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  supportedScopes: string[];
  vendor: string | null;
  responseTimeMs: number;
  error: string | null;
}
