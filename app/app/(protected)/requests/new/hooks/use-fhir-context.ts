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

/** IDs resolved during the EHR callback (no PHI stored in browser) */
interface FhirMatchedIds {
  matchedPatientId: string | null;
  matchedInsuranceId: string | null;
  matchedPayerId: string | null;
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
  /** Server-matched IDs from EHR callback (no PHI in browser) */
  matchedIds: FhirMatchedIds | null;
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
  const [matchedIds, setMatchedIds] = useState<FhirMatchedIds | null>(null);
  const [fhirFilledFields, setFhirFilledFields] = useState<Set<string>>(
    new Set()
  );

  // Read FHIR context from sessionStorage on mount
  // Note: patient and coverage fields are null (PHI stripped at callback time).
  // Server-matched IDs are stored instead.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FHIR_CONTEXT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify it's recent (within last 30 minutes)
        const age =
          Date.now() - new Date(parsed.createdAt).getTime();
        if (age < 30 * 60 * 1000) {
          setFhirContext(parsed as FhirContext);
          if (parsed.matchedPatientId || parsed.matchedInsuranceId || parsed.matchedPayerId) {
            setMatchedIds({
              matchedPatientId: parsed.matchedPatientId || null,
              matchedInsuranceId: parsed.matchedInsuranceId || null,
              matchedPayerId: parsed.matchedPayerId || null,
            });
          }
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

      // ── Practitioner (Step 3) ──
      if (fhirContext.practitioner) {
        if (fhirContext.practitioner.npi && !currentState.renderingPhysicianNpi) {
          updates.renderingPhysicianNpi = fhirContext.practitioner.npi;
          filled.add("renderingPhysicianNpi");
        }
      }

      // ── Clinical Notes from Documents (Step 4) ──
      if (fhirContext.documents.length > 0 && !currentState.clinicalNotes) {
        const docSummary = fhirContext.documents
          .slice(0, 5)
          .map((d) => `[${d.type}] ${d.description || "No description"} (${d.date?.split("T")[0] || "unknown date"})`)
          .join("\n");
        if (docSummary) {
          updates.clinicalNotes = `--- EHR Clinical Documents ---\n${docSummary}`;
          filled.add("clinicalNotes");
        }
      }

      // ── Lab Values from Observations (Step 4 context) ──
      if (fhirContext.observations.length > 0 && !currentState.clinicalNotes) {
        const labSummary = fhirContext.observations
          .filter((o) => o.value)
          .slice(0, 10)
          .map((o) => `${o.display}: ${o.value}${o.unit ? ` ${o.unit}` : ""} (${o.date?.split("T")[0] || ""})`)
          .join("\n");
        if (labSummary) {
          const existing = updates.clinicalNotes || "";
          updates.clinicalNotes = `${existing}\n\n--- EHR Lab Results ---\n${labSummary}`.trim();
          filled.add("clinicalNotes");
        }
      }

      setFhirFilledFields(filled);
      return { ...currentState, ...updates };
    },
    [fhirContext]
  );

  /**
   * Returns the patient that was matched/created during the EHR callback.
   * Patient matching now happens eagerly at callback time — no PHI is stored
   * in the browser. This fetches the matched patient record by ID.
   */
  const matchPatient = useCallback(async (): Promise<MatchPatientResult | null> => {
    if (!matchedIds?.matchedPatientId) return null;

    try {
      const res = await fetch(`/api/patients/${matchedIds.matchedPatientId}`);
      if (!res.ok) return null;
      const patient = await res.json();
      return {
        matched: true,
        matchType: "mrn" as const,
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          name: `${patient.firstName} ${patient.lastName}`,
          mrn: patient.mrn,
          dob: patient.dob,
          gender: patient.gender,
          phone: patient.phone,
          email: patient.email,
          insurances: patient.insurances || [],
        },
        payerMatched: matchedIds.matchedPayerId
          ? { id: matchedIds.matchedPayerId, name: "" }
          : null,
      };
    } catch {
      return null;
    }
  }, [matchedIds]);

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
    matchedIds,
  };
}
