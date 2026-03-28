// ─── EHR Vendor Registry ────────────────────────────────────────
// Research-accurate configurations for all 6 supported EHR vendors.
// Data sourced from vendor developer documentation as of 2025.

import type { EhrVendor } from "@prisma/client";
import type { VendorConfig } from "./types";

/**
 * Complete vendor registry with configurations for all supported EHR systems.
 * Keyed by the Prisma EhrVendor enum values.
 */
export const VENDOR_REGISTRY: Record<Exclude<EhrVendor, "other">, VendorConfig> = {
  epic: {
    vendor: "epic",
    displayName: "Epic",
    description: "Largest US EHR vendor, dominant in academic medical centers and large health systems.",
    marketShare: "~38%",

    registrationUrl: "https://fhir.epic.com/",
    sandboxUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
    documentationUrl: "https://fhir.epic.com/Documentation",
    marketplaceName: "App Orchard / Showroom",

    fhirVersion: "R4 (4.0.1)",
    supportedScopes: [
      "launch",
      "openid",
      "fhirUser",
      "patient/Patient.read",
      "patient/Coverage.read",
      "patient/Condition.read",
      "patient/ServiceRequest.read",
      "user/Practitioner.read",
      "patient/DocumentReference.read",
      "patient/Observation.read",
      "patient/MedicationRequest.read",
      "patient/AllergyIntolerance.read",
      "patient/Procedure.read",
    ],
    supportsCrd: true,
    supportsDtr: true,
    supportsPas: true,
    supportsSmartV2: true,

    certificationSteps: [
      "Register application at fhir.epic.com",
      "Develop and test against Epic sandbox (open.epic.com)",
      "Complete Epic App Orchard / Showroom review",
      "Obtain customer sponsor for production testing",
      "Pass Epic security and privacy review",
      "Complete production validation with sponsor site",
      "Publish listing in App Orchard / Showroom",
    ],
    estimatedCertTimeline: "6-12 months",
    annualListingCost: "~$500/yr",
    requiresCustomerSponsor: true,

    knownQuirks: [
      "Custom extensions use http://open.epic.com/ namespace",
      "Specific scope formatting requirements (e.g., patient/*.read vs granular)",
      "Launch context may include encounter ID in non-standard extension",
      "Token refresh behavior differs from spec in some configurations",
      "Binary resources require separate authentication flow",
    ],
    customExtensions: [
      "http://open.epic.com/FHIR/StructureDefinition/extension/ip-visit-type",
      "http://open.epic.com/FHIR/StructureDefinition/extension/patient-class",
    ],
  },

  oracle_health: {
    vendor: "oracle_health",
    displayName: "Oracle Health (Cerner)",
    description: "Second-largest US EHR vendor, strong in federal/VA systems and large hospitals.",
    marketShare: "~25%",

    registrationUrl: "https://code.cerner.com/",
    sandboxUrl: "https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d",
    documentationUrl: "https://fhir.cerner.com/millennium/r4/",
    marketplaceName: "Code Console / App Gallery",

    fhirVersion: "R4 (4.0.1)",
    supportedScopes: [
      "launch",
      "openid",
      "fhirUser",
      "online_access",
      "patient/Patient.read",
      "patient/Coverage.read",
      "patient/Condition.read",
      "patient/ServiceRequest.read",
      "user/Practitioner.read",
      "patient/DocumentReference.read",
      "patient/Observation.read",
      "patient/MedicationRequest.read",
      "patient/AllergyIntolerance.read",
    ],
    supportsCrd: false,
    supportsDtr: false,
    supportsPas: false,
    supportsSmartV2: true,

    certificationSteps: [
      "Register at code.cerner.com developer portal",
      "Create application in Code Console",
      "Develop and test against public sandbox",
      "Submit for Cerner validation review",
      "Complete security assessment",
      "Publish in App Gallery (optional)",
    ],
    estimatedCertTimeline: "4-8 weeks",
    annualListingCost: "Free (Code Console)",
    requiresCustomerSponsor: false,

    knownQuirks: [
      "Uses Ignite APIs alongside FHIR for some resources",
      "Token handling differs from standard — uses online_access scope for refresh",
      "CapabilityStatement may list resources not yet fully implemented",
      "Patient search requires minimum 2 demographics parameters",
      "Date search parameters use different precision than other vendors",
    ],
    customExtensions: [
      "https://fhir-ehr.cerner.com/r4/StructureDefinition/patient-merge-indicator",
    ],
  },

  meditech: {
    vendor: "meditech",
    displayName: "MEDITECH",
    description: "Third-largest US EHR vendor, strong in community hospitals and international markets.",
    marketShare: "~16%",

    registrationUrl: "https://ehr.meditech.com/alliance-program",
    sandboxUrl: "https://ehr.meditech.com/alliance-program",
    documentationUrl: "https://ehr.meditech.com/alliance-program",
    marketplaceName: "Alliance Program",

    fhirVersion: "R4 (4.0.1)",
    supportedScopes: [
      "launch",
      "openid",
      "fhirUser",
      "patient/Patient.read",
      "patient/Coverage.read",
      "patient/Condition.read",
      "patient/Observation.read",
      "patient/DocumentReference.read",
    ],
    supportsCrd: false,
    supportsDtr: false,
    supportsPas: false,
    supportsSmartV2: false,

    certificationSteps: [
      "Apply for MEDITECH Alliance Program membership",
      "Execute partnership agreement",
      "Obtain sandbox access through Alliance Program",
      "Develop against MEDITECH Expanse FHIR APIs",
      "Complete MEDITECH validation and testing",
      "Deploy through Alliance Program channel",
    ],
    estimatedCertTimeline: "3-6 months",
    annualListingCost: "Varies (Alliance Program fee)",
    requiresCustomerSponsor: false,

    knownQuirks: [
      "Greenfield (legacy) and Expanse have different FHIR implementations",
      "Limited FHIR scope support compared to Epic/Cerner",
      "ServiceRequest resource may not be fully available on older versions",
      "Sandbox access requires Alliance Program membership",
      "SMART on FHIR v1.0 on some installations, v2.0 on Expanse",
    ],
    customExtensions: [],
  },

  athenahealth: {
    vendor: "athenahealth",
    displayName: "athenahealth",
    description: "Cloud-native EHR focused on ambulatory practices, with 800+ marketplace apps.",
    marketShare: "~10% (ambulatory)",

    registrationUrl: "https://developer.athenahealth.com/",
    sandboxUrl: "https://developer.athenahealth.com/",
    documentationUrl: "https://docs.athenahealth.com/api/",
    marketplaceName: "Marketplace",

    fhirVersion: "R4 (4.0.1)",
    supportedScopes: [
      "launch",
      "openid",
      "fhirUser",
      "patient/Patient.read",
      "patient/Coverage.read",
      "patient/Condition.read",
      "patient/ServiceRequest.read",
      "user/Practitioner.read",
      "patient/DocumentReference.read",
      "patient/Observation.read",
      "patient/Encounter.read",
    ],
    supportsCrd: true,
    supportsDtr: false,
    supportsPas: false,
    supportsSmartV2: true,

    certificationSteps: [
      "Register at developer.athenahealth.com",
      "Create application and obtain sandbox credentials",
      "Develop and test against athenahealth sandbox",
      "Submit for marketplace review",
      "Complete HITRUST self-assessment within 90 days of GA",
      "Pass security review and publish in Marketplace",
    ],
    estimatedCertTimeline: "4-8 weeks",
    annualListingCost: "Free (developer program)",
    requiresCustomerSponsor: false,

    knownQuirks: [
      "Rate limiting enforced on API calls (varies by endpoint)",
      "Requires HITRUST self-assessment within 90 days of going live",
      "Uses proprietary athenaNet API alongside FHIR for some operations",
      "Patient matching uses athenahealth-specific algorithm",
      "Bulk data export has specific scheduling constraints",
    ],
    customExtensions: [],
  },

  veradigm: {
    vendor: "veradigm",
    displayName: "Veradigm (Allscripts)",
    description: "Mid-market EHR vendor formerly known as Allscripts, serving hospitals and ambulatory practices.",
    marketShare: "~5%",

    registrationUrl: "https://developer.veradigm.com/",
    sandboxUrl: "https://developer.veradigm.com/",
    documentationUrl: "https://developer.veradigm.com/",
    marketplaceName: "App Expo",

    fhirVersion: "R4 (4.0.1)",
    supportedScopes: [
      "launch",
      "openid",
      "fhirUser",
      "patient/Patient.read",
      "patient/Coverage.read",
      "patient/Condition.read",
      "patient/Observation.read",
      "patient/DocumentReference.read",
    ],
    supportsCrd: false,
    supportsDtr: false,
    supportsPas: false,
    supportsSmartV2: false,

    certificationSteps: [
      "Register at developer.veradigm.com",
      "Request sandbox access",
      "Develop against Veradigm FHIR R4 APIs",
      "Submit for App Expo review",
      "Complete security and compliance validation",
      "Publish in App Expo",
    ],
    estimatedCertTimeline: "4-8 weeks",
    annualListingCost: "Varies",
    requiresCustomerSponsor: false,

    knownQuirks: [
      "Legacy Allscripts APIs (TouchWorks, Professional) alongside FHIR",
      "FHIR implementation depth varies between TouchWorks and Professional EHR",
      "Some resources only available through proprietary Unity API",
      "SMART on FHIR support is v2.0 but may not be available on all installations",
      "Developer portal is being migrated from Allscripts to Veradigm branding",
    ],
    customExtensions: [],
  },

  eclinicalworks: {
    vendor: "eclinicalworks",
    displayName: "eClinicalWorks",
    description: "Large ambulatory EHR serving 150,000+ physicians, ONC certified for FHIR R4.",
    marketShare: "~5% (ambulatory)",

    registrationUrl: "https://developer.eclinicalworks.com/",
    sandboxUrl: "https://developer.eclinicalworks.com/",
    documentationUrl: "https://developer.eclinicalworks.com/",
    marketplaceName: "Developer Portal",

    fhirVersion: "R4 (4.0.1)",
    supportedScopes: [
      "launch",
      "openid",
      "fhirUser",
      "patient/Patient.read",
      "patient/Coverage.read",
      "patient/Condition.read",
      "patient/Observation.read",
    ],
    supportsCrd: false,
    supportsDtr: false,
    supportsPas: false,
    supportsSmartV2: false,

    certificationSteps: [
      "Register at developer.eclinicalworks.com",
      "Request API access and sandbox credentials",
      "Develop against eClinicalWorks FHIR R4 sandbox",
      "Submit application for review",
      "Complete security validation",
      "Deploy through eClinicalWorks channel",
    ],
    estimatedCertTimeline: "4-12 weeks",
    annualListingCost: "Varies",
    requiresCustomerSponsor: false,

    knownQuirks: [
      "ONC certified for FHIR R4 but limited implementation depth",
      "Some USCDI data classes only available through proprietary API",
      "DTR and PAS support is minimal — primarily manual PA workflows",
      "SMART on FHIR support varies between v10e and v11e versions",
      "Patient search capabilities are more limited than larger vendors",
    ],
    customExtensions: [],
  },
};

/**
 * Returns the vendor configuration for a given EhrVendor.
 * Returns undefined for "other" vendor type.
 */
export function getVendorConfig(vendor: EhrVendor): VendorConfig | undefined {
  if (vendor === "other") return undefined;
  return VENDOR_REGISTRY[vendor];
}

/**
 * Returns all vendor configurations as an array.
 */
export function getAllVendorConfigs(): VendorConfig[] {
  return Object.values(VENDOR_REGISTRY);
}

/**
 * Returns vendor configurations that support a specific Da Vinci capability.
 */
export function getVendorsByCapability(
  capability: "crd" | "dtr" | "pas"
): VendorConfig[] {
  const key = `supports${capability.charAt(0).toUpperCase()}${capability.slice(1)}` as
    "supportsCrd" | "supportsDtr" | "supportsPas";
  return getAllVendorConfigs().filter((config) => config[key]);
}
