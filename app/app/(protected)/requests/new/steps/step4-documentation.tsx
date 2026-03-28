"use client";

import { useState, useEffect, useCallback } from "react";
import { FileUpload } from "@/components/wizard/file-upload";
import { QuestionnaireRenderer } from "@/components/wizard/questionnaire-renderer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { findMatchingQuestionnaires, autoPopulateAnswers } from "@/lib/dtr";
import type { PayerQuestionnaire, QuestionnaireAnswer } from "@/lib/dtr/types";
import type { FhirContext } from "@/lib/fhir/types";
import { FHIR_CONTEXT_KEY } from "@/lib/fhir/types";
import { WizardState } from "../types";

interface Step4DocumentationProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function Step4Documentation({ state, setState }: Step4DocumentationProps) {
  const [questionnaires, setQuestionnaires] = useState<PayerQuestionnaire[]>([]);
  const [answerSets, setAnswerSets] = useState<Map<string, QuestionnaireAnswer[]>>(new Map());
  const [fhirContext, setFhirContext] = useState<FhirContext | null>(null);

  // Load FHIR context for auto-population
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FHIR_CONTEXT_KEY);
      if (stored) setFhirContext(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Find matching questionnaires when service info is available
  useEffect(() => {
    if (!state.serviceCategory || state.cptCodes.length === 0) {
      setQuestionnaires([]);
      return;
    }

    const matches = findMatchingQuestionnaires(state.cptCodes, state.serviceCategory);
    setQuestionnaires(matches);

    // Auto-populate answers for each questionnaire
    const newAnswerSets = new Map<string, QuestionnaireAnswer[]>();
    for (const q of matches) {
      const allItems = q.item.flatMap((item) =>
        item.type === "group" && item.item ? item.item : [item]
      );
      const answers = autoPopulateAnswers(allItems, fhirContext);
      newAnswerSets.set(q.id, answers);
    }
    setAnswerSets(newAnswerSets);
  }, [state.serviceCategory, state.cptCodes, fhirContext]);

  // Update DTR response summaries in wizard state when answers change
  useEffect(() => {
    const summaries = questionnaires.map((q) => {
      const answers = answerSets.get(q.id) || [];
      const answered = answers.filter((a) => a.value !== null).length;
      return {
        questionnaireId: q.id,
        questionnaireTitle: q.title,
        status: answered === answers.length ? "completed" as const : "in-progress" as const,
        answeredCount: answered,
        totalCount: answers.length,
      };
    });

    setState((prev) => {
      if (JSON.stringify(prev.dtrResponses) === JSON.stringify(summaries)) return prev;
      return { ...prev, dtrResponses: summaries };
    });
  }, [answerSets, questionnaires, setState]);

  const handleAnswerChange = useCallback(
    (questionnaireId: string, linkId: string, value: string | boolean | number | null) => {
      setAnswerSets((prev) => {
        const next = new Map(prev);
        const answers = [...(next.get(questionnaireId) || [])];
        const idx = answers.findIndex((a) => a.linkId === linkId);
        if (idx >= 0) {
          answers[idx] = { ...answers[idx], value, autoPopulated: false };
        }
        next.set(questionnaireId, answers);
        return next;
      });
    },
    []
  );

  const autoFilledCount = Array.from(answerSets.values())
    .flat()
    .filter((a) => a.autoPopulated).length;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-text-primary">Clinical Documentation</h2>

      {/* DTR Questionnaires */}
      {questionnaires.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-text-secondary">Payer Documentation Requirements</h3>
            <Badge variant="info" size="sm">Da Vinci DTR</Badge>
            {autoFilledCount > 0 && (
              <span className="text-xs text-sky-400">
                {autoFilledCount} field{autoFilledCount !== 1 ? "s" : ""} auto-populated from EHR
              </span>
            )}
          </div>

          {questionnaires.map((q) => {
            const answers = answerSets.get(q.id) || [];
            const answered = answers.filter((a) => a.value !== null).length;

            return (
              <Card key={q.id} variant="glass" padding="md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{q.publisher || "Payer"}</span>
                    <Badge
                      variant={answered === answers.length ? "success" : "warning"}
                      size="sm"
                    >
                      {answered}/{answers.length} completed
                    </Badge>
                  </div>
                </div>
                <QuestionnaireRenderer
                  title={q.title}
                  items={q.item}
                  answers={answers}
                  onAnswerChange={(linkId, value) =>
                    handleAnswerChange(q.id, linkId, value)
                  }
                />
              </Card>
            );
          })}
        </div>
      )}

      {/* Clinical Notes */}
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

      {/* File Upload */}
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
