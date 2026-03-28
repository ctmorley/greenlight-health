// ─── SMART on FHIR Configuration ───────────────────────────────

/**
 * FHIR scopes GreenLight requests during EHR launch.
 * Phase 1: Patient, Coverage, Condition, ServiceRequest (core PA data)
 */
export const SMART_SCOPES = [
  "launch",
  "openid",
  "fhirUser",
  "patient/Patient.read",
  "patient/Coverage.read",
  "patient/Condition.read",
  "patient/ServiceRequest.read",
].join(" ");

/**
 * Returns the SMART on FHIR authorize configuration for fhirclient.
 * The `iss` and `launch` parameters come from the EHR launch URL.
 */
export function getSmartAuthorizeParams(iss: string, launch: string) {
  return {
    iss,
    launch,
    clientId: process.env.NEXT_PUBLIC_SMART_CLIENT_ID || "greenlight-health",
    scope: SMART_SCOPES,
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || ""}/launch/callback`,
    // PKCE is enabled by default in fhirclient v2+
    completeInTarget: true,
  };
}

/**
 * Returns the standalone launch configuration (for testing / admin workflows).
 * Used when there's no EHR launch context but we want to connect to a FHIR server.
 */
export function getStandaloneLaunchParams(fhirBaseUrl: string) {
  return {
    iss: fhirBaseUrl,
    clientId: process.env.NEXT_PUBLIC_SMART_CLIENT_ID || "greenlight-health",
    scope: SMART_SCOPES.replace("launch ", "launch/patient "),
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || ""}/launch/callback`,
    completeInTarget: true,
  };
}
