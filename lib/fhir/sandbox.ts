// ─── FHIR Sandbox Configurations ────────────────────────────
// Pre-configured FHIR test servers for development and testing.

export interface FhirSandbox {
  name: string;
  fhirBaseUrl: string;
  /** Whether the server supports SMART on FHIR OAuth (some public servers are open-access) */
  smartEnabled: boolean;
  /** Test patient IDs available on this server */
  testPatientIds: string[];
  description: string;
}

/**
 * Known FHIR sandbox servers for development testing.
 * HAPI FHIR is the most commonly used public test server.
 */
export const FHIR_SANDBOXES: Record<string, FhirSandbox> = {
  hapi_r4: {
    name: "HAPI FHIR R4 (Public)",
    fhirBaseUrl: "https://hapi.fhir.org/baseR4",
    smartEnabled: false, // HAPI public server is open-access (no OAuth)
    testPatientIds: ["592912", "592918", "592920"],
    description: "Public HAPI FHIR R4 server. Open access, no auth required. Good for FHIR data mapping testing.",
  },
  smart_r4: {
    name: "SMART Health IT Sandbox",
    fhirBaseUrl: "https://launch.smarthealthit.org/v/r4/fhir",
    smartEnabled: true,
    testPatientIds: [
      "smart-1288992", // Daniel Adams
      "smart-1482713", // Lisa P. Coleman
    ],
    description: "SMART Health IT launcher. Full SMART on FHIR OAuth flow with synthetic patients.",
  },
};

/**
 * Returns the default sandbox for development testing.
 */
export function getDefaultSandbox(): FhirSandbox {
  return FHIR_SANDBOXES.smart_r4;
}
