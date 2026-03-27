"use client";

import { useState, useEffect } from "react";
import { WizardState, AuditIssue } from "../types";

export function useAuditPreview(currentStep: number, state: WizardState) {
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);

  useEffect(() => {
    if (currentStep !== 5) return;
    // Run client-side audit preview
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
    // Code-combination check: screening-only ICD-10 for non-screening procedures
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
  }, [currentStep, state.cptCodes, state.icd10Codes, state.clinicalNotes, state.files, state.procedureDescription, state.scheduledDate, state.orderingPhysicianId, state.serviceCategory, state.serviceType]);

  return { auditIssues, setAuditIssues };
}
