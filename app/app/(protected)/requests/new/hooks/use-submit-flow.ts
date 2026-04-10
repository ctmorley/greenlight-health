"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { WizardState, AuditIssue, LOCAL_STORAGE_KEY } from "../types";

interface UseSubmitFlowOptions {
  state: WizardState;
  saveDraft: (nextStep?: number) => Promise<string | null>;
  setAuditIssues: (issues: AuditIssue[]) => void;
}

export function useSubmitFlow({ state, saveDraft, setAuditIssues }: UseSubmitFlowOptions) {
  const router = useRouter();
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    setAuditIssues([]);

    try {
      // Ensure draft is saved first and get the effective draft ID
      const draftId = await saveDraft(5);
      if (!draftId) {
        throw new Error("Draft must be saved before submitting");
      }

      // Upload any pending files
      const pendingFiles = state.files.filter((f) => !f.uploaded && f.file);
      const uploadFailures: string[] = [];
      for (const fileEntry of pendingFiles) {
        const formData = new FormData();
        formData.append("file", fileEntry.file!);
        formData.append("category", fileEntry.category);
        const uploadRes = await fetch(`/api/requests/${draftId}/documents`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          uploadFailures.push(fileEntry.fileName);
        }
      }
      if (uploadFailures.length > 0) {
        const msg = `Failed to upload ${uploadFailures.length} file(s): ${uploadFailures.join(", ")}. Please retry.`;
        setSubmitError(msg);
        addToast(msg, "error");
        return;
      }

      // Submit
      const res = await fetch(`/api/requests/${draftId}/submit`, {
        method: "POST",
      });
      const data = await res.json();

      if (
        (res.status === 400 || res.status === 422) &&
        data?.submitted === false &&
        data?.auditResult
      ) {
        // Audit failed — show issues
        setAuditIssues(data.auditResult?.issues || []);
        setSubmitError("Resolve the blocking issues before submitting this request.");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      if (data.submitted) {
        // Success! Clear local storage and navigate to the request detail
        try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch { /* ignore */ }
        if (data.auditResult?.issues?.length > 0) {
          setAuditIssues(data.auditResult.issues);
        }
        addToast("PA request submitted successfully", "success");
        router.push(`/app/requests/${draftId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit request";
      setSubmitError(msg);
      addToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }, [state.files, saveDraft, setAuditIssues, router]);

  const handleSaveAsDraft = useCallback(async (currentStep: number) => {
    setSaveError(null);
    try {
      await saveDraft(currentStep);
      try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch { /* ignore */ }
      addToast("Draft saved successfully", "success");
      router.push("/app/requests");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft";
      console.error("Save draft error:", err);
      setSaveError(message);
      addToast(message, "error");
    }
  }, [saveDraft, router, addToast]);

  return {
    submitting,
    submitError,
    saveError,
    handleSubmit,
    handleSaveAsDraft,
  };
}
