"use client";

import { FileUpload } from "@/components/wizard/file-upload";
import { WizardState } from "../types";

interface Step4DocumentationProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function Step4Documentation({ state, setState }: Step4DocumentationProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-text-primary">Clinical Documentation</h2>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">Clinical Notes</label>
        <textarea
          value={state.clinicalNotes}
          onChange={(e) => setState((prev) => ({ ...prev, clinicalNotes: e.target.value }))}
          placeholder="Enter clinical notes, history, and medical justification..."
          rows={6}
          className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 resize-y"
        />
      </div>

      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Supporting Documents</h3>
        <FileUpload
          files={state.files}
          onFilesChange={(files) => setState((prev) => ({ ...prev, files }))}
          requestId={state.draftId || undefined}
        />
      </div>
    </div>
  );
}
