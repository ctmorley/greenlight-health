// ─── FHIR / SMART on FHIR Types ────────────────────────────────

/**
 * Represents the data extracted from FHIR resources during an EHR launch.
 * Stored in sessionStorage and consumed by the PA wizard for auto-fill.
 */
export interface FhirContext {
  /** FHIR server base URL (the `iss` from the launch) */
  fhirBaseUrl: string;

  /** FHIR Patient resource ID from launch context */
  patientId: string;

  /** Extracted patient demographics */
  patient: FhirPatientData | null;

  /** Extracted insurance/coverage data */
  coverage: FhirCoverageData | null;

  /** Active conditions (ICD-10 codes) from the patient's problem list */
  conditions: FhirConditionData[];

  /** The service request / order that triggered the PA (if available) */
  serviceRequest: FhirServiceRequestData | null;

  /** Practitioner who placed the order */
  practitioner: FhirPractitionerData | null;

  /** Timestamp when this context was created */
  createdAt: string;
}

export interface FhirPatientData {
  fhirId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  mrn: string | null;
  dob: string; // ISO date
  gender: string;
  phone: string | null;
  email: string | null;
}

export interface FhirCoverageData {
  fhirId: string;
  payerName: string;
  payerIdentifier: string | null;
  planName: string | null;
  memberId: string | null;
  groupNumber: string | null;
  subscriberId: string | null;
  relationship: string | null;
}

export interface FhirConditionData {
  fhirId: string;
  code: string; // ICD-10 code
  display: string;
  clinicalStatus: string;
  onsetDate: string | null;
}

export interface FhirServiceRequestData {
  fhirId: string;
  status: string;
  intent: string;
  cptCodes: string[];
  procedureDescription: string | null;
  reasonCodes: string[]; // ICD-10 codes from the order's reason
  priority: string | null;
  occurrenceDate: string | null;
}

export interface FhirPractitionerData {
  fhirId: string;
  name: string;
  npi: string | null;
}

/** Key for storing/retrieving FhirContext in sessionStorage */
export const FHIR_CONTEXT_KEY = "greenlight_fhir_context";
