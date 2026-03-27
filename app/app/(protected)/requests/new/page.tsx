"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/wizard/step-indicator";

import { STEPS, WizardState } from "./types";
import { useDraftPersistence } from "./hooks/use-draft-persistence";
import { useAuditPreview } from "./hooks/use-audit-preview";
import { useSubmitFlow } from "./hooks/use-submit-flow";
import { Step1Patient } from "./steps/step1-patient";
import { Step2ServiceDetails } from "./steps/step2-service-details";
import { Step3Insurance } from "./steps/step3-insurance";
import { Step4Documentation } from "./steps/step4-documentation";
import { Step5Review } from "./steps/step5-review";

// ─── Step Validation ───────────────────────────────────────────

function canProceedFromStep(step: number, state: WizardState): boolean {
  switch (step) {
    case 1:
      return !!state.patientId;
    case 2:
      return !!state.serviceCategory && !!state.serviceType;
    case 3:
      return !!state.payerId;
    case 4:
      return true; // Documentation is optional
    default:
      return true;
  }
}

// ─── Skeleton ──────────────────────────────────────────────────

function WizardSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-white/10 rounded" />
      <div className="h-16 bg-white/5 rounded-2xl" />
      <div className="h-96 bg-white/5 rounded-2xl" />
    </div>
  );
}

// ─── Page Component ────────────────────────────────────────────

export default function NewPARequestPage() {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <NewPARequestWizard />
    </Suspense>
  );
}

function NewPARequestWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editDraftId = searchParams.get("draft");

  const {
    state,
    setState,
    currentStep,
    completedSteps,
    saving,
    loadingDraft,
    saveDraft,
    nextStep,
    prevStep,
    goToStep,
  } = useDraftPersistence({ editDraftId });

  const { auditIssues, setAuditIssues } = useAuditPreview(currentStep, state);

  const {
    submitting,
    submitError,
    saveError,
    handleSubmit,
    handleSaveAsDraft,
  } = useSubmitFlow({ state, saveDraft, setAuditIssues });

  if (loadingDraft) {
    return <WizardSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">
            {state.draftId ? "Edit PA Request" : "New PA Request"}
          </h1>
          {state.referenceNumber && (
            <p className="text-sm font-mono text-emerald-400 mt-1">{state.referenceNumber}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-text-muted flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => router.push("/app/requests")}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Save Error Banner */}
      {saveError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          Failed to save draft: {saveError}
        </div>
      )}

      {/* Step Indicator */}
      <Card variant="glass" padding="md">
        <StepIndicator
          steps={STEPS}
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={(step) => {
            if (completedSteps.includes(step) || step < currentStep) {
              goToStep(step);
            }
          }}
        />
      </Card>

      {/* Step Content */}
      <Card variant="glass" padding="lg">
        {currentStep === 1 && (
          <Step1Patient state={state} setState={setState} onPatientSelected={() => nextStep()} />
        )}
        {currentStep === 2 && (
          <Step2ServiceDetails state={state} setState={setState} />
        )}
        {currentStep === 3 && (
          <Step3Insurance state={state} setState={setState} />
        )}
        {currentStep === 4 && (
          <Step4Documentation state={state} setState={setState} />
        )}
        {currentStep === 5 && (
          <Step5Review
            state={state}
            auditIssues={auditIssues}
            submitError={submitError}
          />
        )}
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <div>
          {currentStep > 1 && (
            <Button variant="secondary" onClick={prevStep}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Previous
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {(state.patientId && state.serviceCategory && state.serviceType && state.payerId) && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => handleSaveAsDraft(currentStep)}
              isLoading={saving}
            >
              Save as Draft
            </Button>
          )}

          {currentStep < 5 ? (
            <Button
              variant="primary"
              onClick={nextStep}
              disabled={!canProceedFromStep(currentStep, state)}
            >
              Next Step
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={auditIssues.some((i) => i.severity === "error")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              Submit PA Request
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
