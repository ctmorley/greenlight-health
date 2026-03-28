"use client";

import { useState, useEffect } from "react";
import { WizardState, AuditIssue, ClinicalCriteriaResult } from "../types";

export function useAuditPreview(currentStep: number, state: WizardState) {
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
  const [clinicalCriteria, setClinicalCriteria] = useState<ClinicalCriteriaResult | null>(null);
  const [loadingCriteria, setLoadingCriteria] = useState(false);

  useEffect(() => {
    if (currentStep !== 5) return;

    // Run client-side audit checks
    const issues: AuditIssue[] = [];
    if (state.cptCodes.length === 0) {
      issues.push({ severity: "error", field: "cptCodes", message: "At least one CPT code is required" });
    }
    if (state.icd10Codes.length === 0) {
      issues.push({ severity: "warning", field: "icd10Codes", message: "No ICD-10 diagnosis codes provided. Most payers require at least one." });
    }
    if (!state.clinicalNotes && state.files.length === 0) {
      issues.push({ severity: "warning", field: "documentation", message: "No clinical notes or supporting documents attached. This may delay authorization." });
    }
    if (!state.procedureDescription) {
      issues.push({ severity: "warning", field: "procedureDescription", message: "No procedure description provided. Adding one improves approval likelihood." });
    }
    if (!state.scheduledDate) {
      issues.push({ severity: "info", field: "scheduledDate", message: "No scheduled procedure date set." });
    }
    if (!state.orderingPhysicianId) {
      issues.push({ severity: "info", field: "orderingPhysician", message: "No ordering physician specified." });
    }
    // Code-combination check
    if (state.serviceCategory === "imaging" && state.icd10Codes.length > 0) {
      const hasScreeningOnly = state.icd10Codes.every((c) => c.startsWith("Z12"));
      if (hasScreeningOnly && state.serviceType !== "mammography") {
        issues.push({
          severity: "warning",
          field: "icd10Codes",
          message: "Only screening diagnosis codes provided for a non-screening procedure. Consider adding clinical indication codes.",
        });
      }
    }
    setAuditIssues(issues);

    // Fetch ACR clinical criteria
    if (state.cptCodes.length > 0 || state.icd10Codes.length > 0) {
      setLoadingCriteria(true);
      const params = new URLSearchParams();
      if (state.cptCodes.length > 0) params.set("cpt", state.cptCodes.join(","));
      if (state.icd10Codes.length > 0) params.set("icd10", state.icd10Codes.join(","));
      if (state.payerId) params.set("payerId", state.payerId);

      fetch(`/api/clinical-criteria?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: ClinicalCriteriaResult | null) => {
          if (data) {
            setClinicalCriteria(data);
            // Add ACR-based audit issues
            if (data.audit.hasGuidelines) {
              if (data.audit.riskLevel === "high") {
                setAuditIssues((prev) => [
                  {
                    severity: "error",
                    field: "acr",
                    message: data.audit.message,
                  },
                  ...prev,
                ]);
              } else if (data.audit.riskLevel === "medium") {
                setAuditIssues((prev) => [
                  {
                    severity: "warning",
                    field: "acr",
                    message: data.audit.message,
                  },
                  ...prev,
                ]);
              }
            }
            // Add denial pattern warnings
            if (data.denialPatterns.length > 0) {
              const topDenial = data.denialPatterns[0];
              setAuditIssues((prev) => [
                ...prev,
                {
                  severity: "warning",
                  field: "denialPattern",
                  message: `Common denial: ${topDenial.reasonDescription}${topDenial.preventionTip ? `. Tip: ${topDenial.preventionTip}` : ""}`,
                },
              ]);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingCriteria(false));
    }
  }, [
    currentStep,
    state.cptCodes,
    state.icd10Codes,
    state.clinicalNotes,
    state.files,
    state.procedureDescription,
    state.scheduledDate,
    state.orderingPhysicianId,
    state.serviceCategory,
    state.serviceType,
    state.payerId,
  ]);

  return { auditIssues, setAuditIssues, clinicalCriteria, loadingCriteria };
}
