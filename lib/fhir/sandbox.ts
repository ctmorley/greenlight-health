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

  // ── Vendor Sandboxes ──────────────────────────────────────────

  epic_r4: {
    name: "Epic Sandbox (FHIR R4)",
    fhirBaseUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
    smartEnabled: true,
    testPatientIds: ["Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB", "erXuFYUfucBZaryVksYEcMg3"],
    description: "Epic open sandbox. Requires App Orchard registration. Full SMART on FHIR support.",
  },

  oracle_health_r4: {
    name: "Oracle Health (Cerner) Sandbox",
    fhirBaseUrl: "https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d",
    smartEnabled: true,
    testPatientIds: ["12724066", "12724067"],
    description: "Cerner public sandbox (Code Console). SMART on FHIR with synthetic data.",
  },

  meditech_r4: {
    name: "MEDITECH Sandbox",
    fhirBaseUrl: "https://ehr.meditech.com/alliance-program",
    smartEnabled: false,
    testPatientIds: [],
    description: "MEDITECH Alliance Program sandbox. Requires Alliance Program membership for access.",
  },

  athenahealth_r4: {
    name: "athenahealth Sandbox",
    fhirBaseUrl: "https://developer.athenahealth.com/",
    smartEnabled: true,
    testPatientIds: [],
    description: "athenahealth developer sandbox. Requires developer portal registration.",
  },

  veradigm_r4: {
    name: "Veradigm Sandbox",
    fhirBaseUrl: "https://developer.veradigm.com/",
    smartEnabled: false,
    testPatientIds: [],
    description: "Veradigm developer sandbox. Requires developer portal registration.",
  },

  eclinicalworks_r4: {
    name: "eClinicalWorks Sandbox",
    fhirBaseUrl: "https://developer.eclinicalworks.com/",
    smartEnabled: false,
    testPatientIds: [],
    description: "eClinicalWorks developer sandbox. Requires developer portal registration.",
  },
};

/**
 * Returns the default sandbox for development testing.
 */
export function getDefaultSandbox(): FhirSandbox {
  return FHIR_SANDBOXES.smart_r4;
}
