"use client";

import { useCallback } from "react";
import { Select } from "@/components/ui/select";
import { CodeSearchInput } from "@/components/wizard/code-search-input";
import { WizardState, SERVICE_CATEGORY_OPTIONS, SERVICE_TYPE_MAP, URGENCY_OPTIONS } from "../types";

interface Step2ServiceDetailsProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function Step2ServiceDetails({ state, setState }: Step2ServiceDetailsProps) {
  const serviceTypes = SERVICE_TYPE_MAP[state.serviceCategory] || [];

  const searchCptCodes = useCallback(
    async (query: string) => {
      // Client-side search from bundled data
      const { searchCptCodes: search } = await import("@/lib/cpt-codes");
      return search(query, state.serviceCategory || undefined);
    },
    [state.serviceCategory]
  );

  const searchIcd10Codes = useCallback(async (query: string) => {
    const { searchIcd10Codes: search } = await import("@/lib/cpt-codes");
    return search(query);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-text-primary">Service Details</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Service Category *"
          options={SERVICE_CATEGORY_OPTIONS}
          placeholder="Select category"
          value={state.serviceCategory}
          onChange={(e) => {
            const cat = e.target.value;
            setState((prev) => ({
              ...prev,
              serviceCategory: cat,
              serviceType: SERVICE_TYPE_MAP[cat]?.length === 1 ? SERVICE_TYPE_MAP[cat][0].value : "",
            }));
          }}
        />
        <Select
          label="Service Type *"
          options={serviceTypes}
          placeholder="Select type"
          value={state.serviceType}
          onChange={(e) => setState((prev) => ({ ...prev, serviceType: e.target.value }))}
          disabled={!state.serviceCategory}
        />
        <Select
          label="Urgency"
          options={URGENCY_OPTIONS}
          value={state.urgency}
          onChange={(e) => setState((prev) => ({ ...prev, urgency: e.target.value }))}
        />
      </div>

      <div className="space-y-4">
        <CodeSearchInput
          label="CPT Codes"
          placeholder="Search by code or description (e.g., 70553 or MRI brain)..."
          selectedCodes={state.cptCodes}
          onCodesChange={(codes) => setState((prev) => ({ ...prev, cptCodes: codes }))}
          searchFn={searchCptCodes}
        />

        <CodeSearchInput
          label="ICD-10 Diagnosis Codes"
          placeholder="Search by code or description (e.g., M54.5 or back pain)..."
          selectedCodes={state.icd10Codes}
          onCodesChange={(codes) => setState((prev) => ({ ...prev, icd10Codes: codes }))}
          searchFn={searchIcd10Codes}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">Procedure Description</label>
        <textarea
          value={state.procedureDescription}
          onChange={(e) => setState((prev) => ({ ...prev, procedureDescription: e.target.value }))}
          placeholder="Describe the procedure or service being requested..."
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 resize-none"
        />
      </div>
    </div>
  );
}
