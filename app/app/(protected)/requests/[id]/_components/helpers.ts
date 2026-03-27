export const serviceTypeLabels: Record<string, string> = {
  mri: "MRI",
  ct: "CT",
  pet_ct: "PET/CT",
  ultrasound: "Ultrasound",
  xray: "X-Ray",
  fluoroscopy: "Fluoroscopy",
  mammography: "Mammography",
  dexa: "DEXA",
  nuclear: "Nuclear",
  surgical_procedure: "Surgical Procedure",
  medical_procedure: "Medical Procedure",
};

export const urgencyConfig: Record<string, { variant: "default" | "warning" | "danger"; label: string }> = {
  routine: { variant: "default", label: "Routine" },
  urgent: { variant: "warning", label: "Urgent" },
  emergent: { variant: "danger", label: "Emergent" },
};

export const categoryLabels: Record<string, string> = {
  clinical_notes: "Clinical Notes",
  imaging_order: "Imaging Order",
  lab_results: "Lab Results",
  referral: "Referral",
  medical_records: "Medical Records",
  letter_of_necessity: "Letter of Necessity",
  other: "Other",
};

export const denialCategoryLabels: Record<string, string> = {
  medical_necessity: "Medical Necessity",
  incomplete_documentation: "Incomplete Documentation",
  out_of_network: "Out of Network",
  service_not_covered: "Service Not Covered",
  missing_precert: "Missing Pre-certification",
  coding_error: "Coding Error",
  other: "Other",
};

export const appealLevelLabels: Record<string, string> = {
  first: "First Level",
  second: "Second Level",
  external_review: "External Review",
};

export const appealStatusConfig: Record<string, { variant: "default" | "success" | "warning" | "danger" | "info"; label: string }> = {
  draft: { variant: "default", label: "Draft" },
  filed: { variant: "info", label: "Filed" },
  in_review: { variant: "warning", label: "In Review" },
  won: { variant: "success", label: "Won" },
  lost: { variant: "danger", label: "Lost" },
  withdrawn: { variant: "default", label: "Withdrawn" },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Format an ISO date string as an absolute timestamp, e.g. "Mar 27, 2026 10:42 AM"
 */
export function absoluteTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
