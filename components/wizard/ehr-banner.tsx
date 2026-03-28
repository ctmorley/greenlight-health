"use client";

import type { FhirContext } from "@/lib/fhir/types";

interface EhrBannerProps {
  fhirContext: FhirContext;
  filledFieldCount: number;
  onDismiss: () => void;
}

/**
 * Banner shown at the top of the PA wizard when launched from an EHR.
 * Shows the FHIR server origin, patient name, and how many fields were auto-filled.
 */
export function EhrBanner({ fhirContext, filledFieldCount, onDismiss }: EhrBannerProps) {
  const serverHost = (() => {
    try {
      return new URL(fhirContext.fhirBaseUrl).hostname;
    } catch {
      return fhirContext.fhirBaseUrl;
    }
  })();

  return (
    <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wide">EHR Connected</span>
            <span className="text-xs text-text-muted">{serverHost}</span>
          </div>
          <p className="text-sm text-text-secondary truncate">
            {fhirContext.patient
              ? `Patient: ${fhirContext.patient.fullName}`
              : `Patient ID: ${fhirContext.patientId}`}
            {filledFieldCount > 0 && (
              <span className="text-sky-400 ml-2">
                {filledFieldCount} field{filledFieldCount !== 1 ? "s" : ""} auto-filled
              </span>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 p-1 rounded hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors"
        title="Dismiss EHR connection banner"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Small inline badge indicating a field was auto-filled from EHR data.
 */
export function EhrFieldBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-sky-500/10 text-sky-400 border border-sky-500/20">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
      EHR
    </span>
  );
}
