// ─── Types for PA Wizard ─────────────────────────────────────

export interface PatientResult {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  mrn: string;
  dob: string;
  primaryInsurance?: { planName: string; payerName: string } | null;
}

export interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  mrn: string;
  dob: string;
  gender: string;
  phone: string | null;
  email: string | null;
  insurances: Array<{
    id: string;
    planName: string;
    planType: string;
    memberId: string;
    groupNumber: string | null;
    isPrimary: boolean;
    effectiveDate: string;
    payer: { id: string; name: string };
  }>;
}

export interface PayerOption {
  id: string;
  name: string;
  payerId: string;
  type: string;
}

export interface PhysicianOption {
  id: string;
  name: string;
  npiNumber: string | null;
}

export interface PayerRulesResult {
  payer: {
    id: string;
    name: string;
    rbmVendor: string | null;
    avgResponseDays: number;
    electronicSubmission: boolean;
  };
  requiresPA: boolean;
  matchedRule: {
    serviceCategory: string;
    cptCode: string | null;
    requiresPA: boolean;
    clinicalCriteria: unknown;
  } | null;
}

export interface AuditIssue {
  severity: "error" | "warning" | "info";
  field: string;
  message: string;
}

export interface ClinicalCriteriaResult {
  guidelines: Array<{
    condition: string;
    variant: string;
    procedures: Array<{
      id: string;
      procedure: string;
      rating: number;
      ratingCategory: string;
      evidenceStrength: string;
      cptCodes: string[];
      radiationLevel: number | null;
      radiationDose: string | null;
    }>;
  }>;
  guidelineCount: number;
  audit: {
    hasGuidelines: boolean;
    highestRating?: number;
    avgRating?: number;
    appropriateCount?: number;
    mayBeCount?: number;
    notAppropriateCount?: number;
    riskLevel: "low" | "medium" | "high" | "unknown";
    message: string;
    topRecommendation?: string;
  };
  denialPatterns: Array<{
    reasonCategory: string;
    reasonDescription: string;
    frequency: number;
    preventionTip: string | null;
  }>;
}

export interface UploadedFile {
  id?: string;
  file?: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  category: string;
  uploading?: boolean;
  uploaded?: boolean;
  error?: string;
}

// ─── Draft State ───────────────────────────────────────────────

export interface WizardState {
  // Step 1 - Patient
  patientId: string;
  patientDetail: PatientDetail | null;
  // Step 2 - Service
  serviceCategory: string;
  serviceType: string;
  cptCodes: string[];
  icd10Codes: string[];
  procedureDescription: string;
  urgency: string;
  // Step 3 - Insurance & Payer
  insuranceId: string;
  payerId: string;
  payerName: string;
  orderingPhysicianId: string;
  orderingPhysicianName: string;
  renderingPhysicianNpi: string;
  facilityName: string;
  scheduledDate: string;
  // Step 4 - Documentation
  clinicalNotes: string;
  files: UploadedFile[];
  // Tracking
  draftId: string | null;
  referenceNumber: string | null;
}

export const INITIAL_STATE: WizardState = {
  patientId: "",
  patientDetail: null,
  serviceCategory: "",
  serviceType: "",
  cptCodes: [],
  icd10Codes: [],
  procedureDescription: "",
  urgency: "routine",
  insuranceId: "",
  payerId: "",
  payerName: "",
  orderingPhysicianId: "",
  orderingPhysicianName: "",
  renderingPhysicianNpi: "",
  facilityName: "",
  scheduledDate: "",
  clinicalNotes: "",
  files: [],
  draftId: null,
  referenceNumber: null,
};

// ─── Constants ─────────────────────────────────────────────────

export const STEPS = [
  { number: 1, title: "Patient", description: "Select or create" },
  { number: 2, title: "Service Details", description: "Procedure & codes" },
  { number: 3, title: "Insurance", description: "Payer & routing" },
  { number: 4, title: "Documents", description: "Clinical files" },
  { number: 5, title: "Review", description: "Submit request" },
];

export const SERVICE_CATEGORY_OPTIONS = [
  { value: "imaging", label: "Imaging" },
  { value: "surgical", label: "Surgical" },
  { value: "medical", label: "Medical" },
];

export const SERVICE_TYPE_MAP: Record<string, Array<{ value: string; label: string }>> = {
  imaging: [
    { value: "mri", label: "MRI" },
    { value: "ct", label: "CT" },
    { value: "pet_ct", label: "PET/CT" },
    { value: "ultrasound", label: "Ultrasound" },
    { value: "xray", label: "X-Ray" },
    { value: "fluoroscopy", label: "Fluoroscopy" },
    { value: "mammography", label: "Mammography" },
    { value: "dexa", label: "DEXA" },
    { value: "nuclear", label: "Nuclear Medicine" },
  ],
  surgical: [{ value: "surgical_procedure", label: "Surgical Procedure" }],
  medical: [{ value: "medical_procedure", label: "Medical Procedure" }],
};

export const URGENCY_OPTIONS = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "emergent", label: "Emergent" },
];

export const serviceTypeLabels: Record<string, string> = {
  mri: "MRI", ct: "CT", pet_ct: "PET/CT", ultrasound: "Ultrasound",
  xray: "X-Ray", fluoroscopy: "Fluoroscopy", mammography: "Mammography",
  dexa: "DEXA", nuclear: "Nuclear Medicine",
  surgical_procedure: "Surgical Procedure", medical_procedure: "Medical Procedure",
};

export const LOCAL_STORAGE_KEY = "greenlight_draft_wizard";
