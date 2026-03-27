"use client";

import { WizardState, AuditIssue, serviceTypeLabels } from "../types";

const CATEGORY_LABELS: Record<string, string> = {
  clinical_notes: "Clinical Notes",
  imaging_order: "Imaging Order",
  lab_results: "Lab Results",
  referral: "Referral",
  medical_records: "Medical Records",
  letter_of_necessity: "Letter of Medical Necessity",
  other: "Other",
};

interface Step5ReviewProps {
  state: WizardState;
  auditIssues: AuditIssue[];
  submitError: string | null;
}

export function Step5Review({ state, auditIssues, submitError }: Step5ReviewProps) {
  const p = state.patientDetail;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-text-primary">Review & Submit</h2>

      {/* AI Audit Results */}
      {auditIssues.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
            AI Pre-Submission Audit
          </h3>
          {auditIssues.map((issue, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border text-sm ${
                issue.severity === "error"
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : issue.severity === "warning"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-sky-500/10 border-sky-500/20 text-sky-400"
              }`}
            >
              <span className="font-medium uppercase text-xs mr-2">
                {issue.severity === "error" ? "Error" : issue.severity === "warning" ? "Warning" : "Info"}
              </span>
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {submitError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {submitError}
        </div>
      )}

      {/* Patient Summary */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Patient</h3>
        {p ? (
          <div className="space-y-1">
            <p className="text-text-primary font-medium">{p.name}</p>
            <p className="text-sm text-text-muted">
              MRN: {p.mrn} | DOB: {new Date(p.dob).toLocaleDateString()} | {p.gender}
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No patient selected</p>
        )}
      </div>

      {/* Service Summary */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Service Details</h3>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          <div>
            <p className="text-xs text-text-muted">Category</p>
            <p className="text-sm text-text-primary capitalize">{state.serviceCategory || "\u2014"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Type</p>
            <p className="text-sm text-text-primary">{serviceTypeLabels[state.serviceType] || "\u2014"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Urgency</p>
            <p className="text-sm text-text-primary capitalize">{state.urgency}</p>
          </div>
        </div>
        {state.cptCodes.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1">CPT Codes</p>
            <div className="flex flex-wrap gap-1.5">
              {state.cptCodes.map((code) => (
                <span key={code} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs font-mono border border-emerald-500/20">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
        {state.icd10Codes.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1">ICD-10 Codes</p>
            <div className="flex flex-wrap gap-1.5">
              {state.icd10Codes.map((code) => (
                <span key={code} className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 text-xs font-mono border border-sky-500/20">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
        {state.procedureDescription && (
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1">Procedure Description</p>
            <p className="text-sm text-text-secondary">{state.procedureDescription}</p>
          </div>
        )}
      </div>

      {/* Insurance & Routing Summary */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Insurance & Payer</h3>
        {p?.insurances && state.insuranceId ? (
          (() => {
            const ins = p.insurances.find((i) => i.id === state.insuranceId);
            return ins ? (
              <div className="space-y-1">
                <p className="text-sm text-text-primary">{ins.payer.name} - {ins.planName}</p>
                <p className="text-xs text-text-muted">
                  Member: {ins.memberId}
                  {ins.groupNumber ? ` | Group: ${ins.groupNumber}` : ""}
                  {" | "}{ins.planType.toUpperCase()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Insurance selected</p>
            );
          })()
        ) : state.payerId ? (
          <div className="space-y-1">
            <p className="text-sm text-text-primary">{state.payerName || "Payer selected"}</p>
            <p className="text-xs text-amber-400">No insurance on file — payer selected manually</p>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No insurance selected</p>
        )}
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3 pt-3 border-t border-white/5">
          <div>
            <p className="text-xs text-text-muted">Ordering Physician</p>
            <p className="text-sm text-text-primary">{state.orderingPhysicianName || (state.orderingPhysicianId ? "Selected" : "\u2014")}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Rendering NPI</p>
            <p className="text-sm text-text-primary">{state.renderingPhysicianNpi || "\u2014"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Facility</p>
            <p className="text-sm text-text-primary">{state.facilityName || "\u2014"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Scheduled Date</p>
            <p className="text-sm text-text-primary">
              {state.scheduledDate ? new Date(state.scheduledDate).toLocaleDateString() : "\u2014"}
            </p>
          </div>
        </div>
      </div>

      {/* Documentation Summary */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Clinical Documentation</h3>
        {state.clinicalNotes ? (
          <div className="mb-3">
            <p className="text-xs text-text-muted mb-1">Clinical Notes</p>
            <p className="text-sm text-text-secondary whitespace-pre-wrap line-clamp-4">{state.clinicalNotes}</p>
          </div>
        ) : (
          <p className="text-sm text-text-muted mb-3">No clinical notes provided</p>
        )}
        {state.files.length > 0 ? (
          <div>
            <p className="text-xs text-text-muted mb-1">{state.files.length} document{state.files.length !== 1 ? "s" : ""} attached</p>
            <div className="space-y-1">
              {state.files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                  <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <span className="truncate">{f.fileName}</span>
                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-white/5 text-xs text-text-muted border border-white/10">
                    {CATEGORY_LABELS[f.category] || f.category}
                  </span>
                  {f.uploaded && (
                    <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No documents attached</p>
        )}
      </div>
    </div>
  );
}
