"use client";

import { useState, useEffect, useCallback } from "react";
import type { FhirContext } from "@/lib/fhir/types";
import { FHIR_CONTEXT_KEY } from "@/lib/fhir/types";
import type { WizardState } from "../types";

interface MatchPatientResult {
  matched: boolean;
  matchType: "mrn" | "name_dob" | "created";
  patient: {
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
  };
  payerMatched?: { id: string; name: string } | null;
}

interface UseFhirContextResult {
  /** The raw FHIR context from the EHR launch (null if not an EHR launch) */
  fhirContext: FhirContext | null;
  /** Whether this wizard session was initiated from an EHR launch */
  isEhrLaunch: boolean;
  /** Set of WizardState field names that were auto-filled from FHIR data */
  fhirFilledFields: Set<string>;
  /** Apply FHIR data to the wizard state. Returns the merged state. */
  applyFhirData: (currentState: WizardState) => WizardState;
  /** Match FHIR patient server-side and return matched/created GreenLight patient */
  matchPatient: () => Promise<MatchPatientResult | null>;
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

  /**
   * Calls the server-side match-patient API to find or create a GreenLight
   * patient record from the FHIR data. This handles MRN matching, name+DOB
   * matching, payer fuzzy matching, and patient creation in one call.
   */
  const matchPatient = useCallback(async (): Promise<MatchPatientResult | null> => {
    if (!fhirContext?.patient) return null;

    try {
      const res = await fetch("/api/fhir/match-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fhirPatientId: fhirContext.patient.fhirId,
          firstName: fhirContext.patient.firstName,
          lastName: fhirContext.patient.lastName,
          mrn: fhirContext.patient.mrn,
          dob: fhirContext.patient.dob,
          gender: fhirContext.patient.gender,
          phone: fhirContext.patient.phone,
          email: fhirContext.patient.email,
          coverage: fhirContext.coverage
            ? {
                payerName: fhirContext.coverage.payerName,
                payerIdentifier: fhirContext.coverage.payerIdentifier,
                planName: fhirContext.coverage.planName,
                memberId: fhirContext.coverage.memberId,
                groupNumber: fhirContext.coverage.groupNumber,
              }
            : null,
        }),
      });

      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [fhirContext]);

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
    matchPatient,
    clearFhirContext,
  };
}
