"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { WizardState, INITIAL_STATE, LOCAL_STORAGE_KEY, PatientDetail } from "../types";

interface UseDraftPersistenceOptions {
  editDraftId: string | null;
}

interface UseDraftPersistenceReturn {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  completedSteps: number[];
  setCompletedSteps: React.Dispatch<React.SetStateAction<number[]>>;
  saving: boolean;
  loadingDraft: boolean;
  saveDraft: (nextStep?: number) => Promise<string | null>;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  goToStep: (step: number) => void;
}

export function useDraftPersistence({ editDraftId }: UseDraftPersistenceOptions): UseDraftPersistenceReturn {
  const router = useRouter();

  const [currentStep, setCurrentStepRaw] = useState(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!editDraftId);

  // Load existing draft
  useEffect(() => {
    if (!editDraftId) return;
    setLoadingDraft(true);
    (async () => {
      try {
        const res = await fetch(`/api/requests/${editDraftId}`);
        if (!res.ok) throw new Error("Failed to load draft");
        const data = await res.json();

        if (data.status !== "draft") {
          router.push(`/app/requests/${editDraftId}`);
          return;
        }

        // Load patient detail
        let patientDetail: PatientDetail | null = null;
        if (data.patient?.id) {
          const pRes = await fetch(`/api/patients/${data.patient.id}`);
          if (pRes.ok) {
            patientDetail = await pRes.json();
          }
        }

        // Determine saved step (from draftMetadata, with fallback to legacy aiAuditResult)
        const savedStep =
          (data.draftMetadata as Record<string, number>)?.currentStep ||
          (data.aiAuditResult as Record<string, number>)?.currentStep ||
          1;

        setState({
          patientId: data.patient?.id || "",
          patientDetail,
          serviceCategory: data.serviceCategory || "",
          serviceType: data.serviceType || "",
          cptCodes: data.cptCodes || [],
          icd10Codes: data.icd10Codes || [],
          procedureDescription: data.procedureDescription || "",
          urgency: data.urgency || "routine",
          insuranceId: data.insurance?.id || "",
          payerId: data.payer?.id || "",
          payerName: data.payer?.name || "",
          orderingPhysicianId: data.orderingPhysician?.id || "",
          orderingPhysicianName: data.orderingPhysician
            ? `${data.orderingPhysician.name || ""}`.trim() +
              (data.orderingPhysician.npi ? ` (NPI: ${data.orderingPhysician.npi})` : "")
            : "",
          renderingPhysicianNpi: data.renderingPhysicianNpi || "",
          facilityName: data.facilityName || "",
          scheduledDate: data.scheduledDate ? data.scheduledDate.slice(0, 10) : "",
          clinicalNotes: data.clinicalNotes || "",
          files: (data.documents || []).map((d: { id: string; fileName: string; fileSize: number; fileType: string; category: string }) => ({
            id: d.id,
            fileName: d.fileName,
            fileSize: d.fileSize,
            fileType: d.fileType,
            category: d.category,
            uploaded: true,
          })),
          draftId: editDraftId,
          referenceNumber: data.referenceNumber,
        });

        // Mark steps up to savedStep as completed
        const completed = [];
        for (let i = 1; i < savedStep; i++) completed.push(i);
        setCompletedSteps(completed);
        setCurrentStepRaw(savedStep);
      } catch (err) {
        console.error("Failed to load draft:", err);
      } finally {
        setLoadingDraft(false);
      }
    })();
  }, [editDraftId, router]);

  // ─── Local storage persistence for early steps ──────────────────

  const saveToLocalStorage = useCallback((nextStep?: number) => {
    try {
      const data = {
        ...state,
        patientDetail: state.patientDetail,
        _savedStep: nextStep || currentStep,
        _savedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch { /* localStorage may be full or unavailable */ }
  }, [state, currentStep]);

  // Load from local storage on mount (or when editDraftId changes)
  useEffect(() => {
    if (editDraftId) return;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.patientId && !data.draftId) {
          setState((prev) => ({
            ...prev,
            ...data,
            draftId: null,
            referenceNumber: null,
          }));
          if (data._savedStep) {
            setCurrentStepRaw(data._savedStep);
            const completed: number[] = [];
            for (let i = 1; i < data._savedStep; i++) completed.push(i);
            setCompletedSteps(completed);
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }, [editDraftId]);

  // ─── Auto-save draft ──────────────────────────────────────────

  const saveDraft = useCallback(
    async (nextStep?: number): Promise<string | null> => {
      // Need at minimum a patient for server draft creation
      if (!state.patientId) {
        // Save to local storage if we don't even have a patient yet
        saveToLocalStorage(nextStep);
        return state.draftId;
      }

      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          patientId: state.patientId,
          cptCodes: state.cptCodes,
          icd10Codes: state.icd10Codes,
          procedureDescription: state.procedureDescription,
          urgency: state.urgency,
          insuranceId: state.insuranceId || null,
          clinicalNotes: state.clinicalNotes,
          orderingPhysicianId: state.orderingPhysicianId || null,
          renderingPhysicianNpi: state.renderingPhysicianNpi || null,
          facilityName: state.facilityName || null,
          scheduledDate: state.scheduledDate || null,
          currentStep: nextStep || currentStep,
        };

        // Only include optional fields when they have values
        if (state.serviceCategory) payload.serviceCategory = state.serviceCategory;
        if (state.serviceType) payload.serviceType = state.serviceType;
        if (state.payerId) payload.payerId = state.payerId;

        if (state.draftId) {
          // Update existing draft
          const res = await fetch(`/api/requests/${state.draftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to save draft");
          }
          return state.draftId;
        } else {
          // Create new draft
          const res = await fetch("/api/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to create draft");
          }
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            draftId: data.id,
            referenceNumber: data.referenceNumber,
          }));
          // Clear local storage now that server draft exists
          try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch { /* ignore */ }
          return data.id;
        }
      } catch (err) {
        console.error("Save draft error:", err);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [state, currentStep, saveToLocalStorage]
  );

  // ─── Navigation ───────────────────────────────────────────────

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 5) {
      setCurrentStepRaw(step);
    }
  };

  const nextStepFn = async () => {
    const next = Math.min(currentStep + 1, 5);
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps((prev) => [...prev, currentStep]);
    }
    // Auto-save after every step completion (don't block navigation on failure)
    try {
      await saveDraft(next);
    } catch (err) {
      console.error("Auto-save failed during step navigation:", err);
    }
    setCurrentStepRaw(next);
  };

  const prevStep = () => {
    setCurrentStepRaw(Math.max(currentStep - 1, 1));
  };

  return {
    state,
    setState,
    currentStep,
    setCurrentStep: setCurrentStepRaw,
    completedSteps,
    setCompletedSteps,
    saving,
    loadingDraft,
    saveDraft,
    nextStep: nextStepFn,
    prevStep,
    goToStep,
  };
}
