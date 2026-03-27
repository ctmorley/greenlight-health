export interface TimelineEntry {
  id: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  changedBy: string;
  createdAt: string;
}

export interface DocumentEntry {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: string;
  uploadedBy: string;
  createdAt: string;
}

export interface DenialEntry {
  id: string;
  denialDate: string;
  reasonCode: string | null;
  reasonCategory: string;
  reasonDescription: string | null;
  payerNotes: string | null;
}

export interface AppealEntry {
  id: string;
  appealLevel: string;
  filedDate: string;
  filedBy: string;
  appealReason: string;
  status: string;
  decisionDate: string | null;
  decisionNotes: string | null;
}

export interface RequestDetail {
  id: string;
  referenceNumber: string;
  status: string;
  urgency: string;
  serviceCategory: string | null;
  serviceType: string | null;
  cptCodes: string[];
  icd10Codes: string[];
  procedureDescription: string | null;
  clinicalNotes: string | null;
  renderingPhysicianNpi: string | null;
  facilityName: string | null;
  rbmVendor: string | null;
  rbmReferenceNumber: string | null;
  approvedUnits: number | null;
  approvedCptCodes: string[] | null;
  patient: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    mrn: string;
    dob: string;
    gender: string;
    phone: string | null;
    email: string | null;
  };
  payer: {
    id: string;
    name: string;
    payerId: string;
    type: string;
    rbmVendor: string | null;
  } | null;
  insurance: {
    id: string;
    planName: string;
    planType: string;
    memberId: string;
    groupNumber: string | null;
  } | null;
  orderingPhysician: {
    id: string;
    name: string;
    npi: string | null;
  } | null;
  createdBy: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  scheduledDate: string | null;
  expiresAt: string | null;
  timeline: TimelineEntry[];
  documents: DocumentEntry[];
  denials: DenialEntry[];
  appeals: AppealEntry[];
}

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}
