"use client";

import { useState, useEffect, useCallback } from "react";
import type { FhirContext } from "@/lib/fhir/types";
import { FHIR_CONTEXT_KEY } from "@/lib/fhir/types";
import type { WizardState } from "../types";

interface UseFhirContextResult {
  /** The raw FHIR context from the EHR launch (null if not an EHR launch) */
  fhirContext: FhirContext | null;
  /** Whether this wizard session was initiated from an EHR launch */
  isEhrLaunch: boolean;
  /** Set of WizardState field names that were auto-filled from FHIR data */
  fhirFilledFields: Set<string>;
  /** Apply FHIR data to the wizard state. Returns the merged state. */
  applyFhirData: (currentState: WizardState) => WizardState;
  /** Clear the stored FHIR context (e.g., when the user wants to start fresh) */
  clearFhirContext: () => void;
}

/**
 * Hook that reads FHIR context from sessionStorage (set by /launch/callback)
 * and provides auto-fill data for the PA wizard.
 *
 * Usage in wizard:
 *   const { isEhrLaunch, applyFhirData, fhirFilledFields } = useFhirContext();
 *   // On mount or when fhirContext changes, apply to state
 */
export function useFhirContext(): UseFhirContextResult {
  const [fhirContext, setFhirContext] = useState<FhirContext | null>(null);
  const [fhirFilledFields, setFhirFilledFields] = useState<Set<string>>(
    new Set()
  );

  // Read FHIR context from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FHIR_CONTEXT_KEY);
      if (stored) {
        const parsed: FhirContext = JSON.parse(stored);
        // Verify it's recent (within last 30 minutes)
        const age =
          Date.now() - new Date(parsed.createdAt).getTime();
        if (age < 30 * 60 * 1000) {
          setFhirContext(parsed);
        } else {
          // Expired — clean up
          sessionStorage.removeItem(FHIR_CONTEXT_KEY);
        }
      }
    } catch {
      // Invalid data — clean up
      sessionStorage.removeItem(FHIR_CONTEXT_KEY);
    }
  }, []);

  const applyFhirData = useCallback(
    (currentState: WizardState): WizardState => {
      if (!fhirContext) return currentState;

      const filled = new Set<string>();
      const updates: Partial<WizardState> = {};

      // ── Patient Data (Step 1) ──
      // Note: We don't set patientId here because the FHIR patient ID doesn't
      // map directly to a GreenLight Patient record. Instead, we pre-populate
      // the create-patient form or match by MRN.
      // The fhirContext.patient data is used by Step1Patient for auto-fill.

      // ── Service Details (Step 2) ──
      if (fhirContext.serviceRequest) {
        const sr = fhirContext.serviceRequest;

        if (sr.cptCodes.length > 0 && currentState.cptCodes.length === 0) {
          updates.cptCodes = sr.cptCodes;
          filled.add("cptCodes");
        }

        if (sr.procedureDescription && !currentState.procedureDescription) {
          updates.procedureDescription = sr.procedureDescription;
          filled.add("procedureDescription");
        }

        if (sr.priority && currentState.urgency === "routine") {
          updates.urgency = sr.priority;
          filled.add("urgency");
        }

        if (sr.occurrenceDate && !currentState.scheduledDate) {
          updates.scheduledDate = sr.occurrenceDate.split("T")[0];
          filled.add("scheduledDate");
        }

        // Merge reason codes from ServiceRequest with Condition codes
        const reasonIcd10 = sr.reasonCodes;
        if (reasonIcd10.length > 0 && currentState.icd10Codes.length === 0) {
          updates.icd10Codes = reasonIcd10;
          filled.add("icd10Codes");
        }
      }

      // ── ICD-10 from Conditions (Step 2) ──
      if (
        fhirContext.conditions.length > 0 &&
        (updates.icd10Codes || currentState.icd10Codes).length === 0
      ) {
        const conditionCodes = fhirContext.conditions
          .map((c) => c.code)
          .filter(Boolean);
        if (conditionCodes.length > 0) {
          updates.icd10Codes = conditionCodes;
          filled.add("icd10Codes");
        }
      }

      setFhirFilledFields(filled);
      return { ...currentState, ...updates };
    },
    [fhirContext]
  );

  const clearFhirContext = useCallback(() => {
    sessionStorage.removeItem(FHIR_CONTEXT_KEY);
    setFhirContext(null);
    setFhirFilledFields(new Set());
  }, []);

  return {
    fhirContext,
    isEhrLaunch: fhirContext !== null,
    fhirFilledFields,
    applyFhirData,
    clearFhirContext,
  };
}
