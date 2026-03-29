"use client";

import { useState, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import type { RequestDetail, DenialEntry } from "./types";

// ─── Icons ──────────────────────────────────────────────────

function SparklesIcon() {
  return (
    <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function DocumentTextIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
    </svg>
  );
}

// ─── Types ──────────────────────────────────────────────────

interface PredictionResult {
  probability: number;
  riskLevel: "low" | "medium" | "high";
  factors: {
    positive: string[];
    negative: string[];
    missing: string[];
  };
  recommendations: string[];
  metadata: { model: string; tokensUsed: number; processingTimeMs: number };
}

interface LmnResult {
  letter: string;
  metadata: { model: string; tokensUsed: number; processingTimeMs: number };
}

interface SummaryResult {
  summary: string;
  keyFindings: string[];
  supportingDiagnoses: string[];
  metadata: { model: string; tokensUsed: number; processingTimeMs: number };
}

interface AppealDraftResult {
  letter: string;
  suggestedEvidence: string[];
  metadata: { model: string; tokensUsed: number; processingTimeMs: number };
}

interface AiAssistantPanelProps {
  request: RequestDetail;
  addToast: (message: string, type: "success" | "error") => void;
}

// ─── Probability Ring ───────────────────────────────────────

function ProbabilityRing({ probability, riskLevel }: { probability: number; riskLevel: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (probability / 100) * circumference;

  const colorMap: Record<string, string> = {
    low: "text-red-400",
    medium: "text-amber-400",
    high: "text-emerald-400",
  };
  const strokeColorMap: Record<string, string> = {
    low: "stroke-red-400",
    medium: "stroke-amber-400",
    high: "stroke-emerald-400",
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
        <circle
          cx="50" cy="50" r={radius} fill="none" strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${strokeColorMap[riskLevel] || "stroke-white/30"} transition-all duration-1000`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold font-mono ${colorMap[riskLevel] || "text-text-primary"}`}>
          {probability}%
        </span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">approval</span>
      </div>
    </div>
  );
}

// ─── Factor List ────────────────────────────────────────────

function FactorList({ label, items, variant }: { label: string; items: string[]; variant: "positive" | "negative" | "missing" }) {
  if (items.length === 0) return null;

  const config = {
    positive: { dot: "bg-emerald-400", text: "text-emerald-400" },
    negative: { dot: "bg-red-400", text: "text-red-400" },
    missing: { dot: "bg-amber-400", text: "text-amber-400" },
  };
  const { dot, text } = config[variant];

  return (
    <div>
      <p className={`text-xs font-medium mb-1.5 ${text}`}>{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
            <span className={`w-1.5 h-1.5 rounded-full ${dot} mt-1.5 flex-shrink-0`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Copy Button ────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      <ClipboardIcon />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function AiAssistantPanel({ request, addToast }: AiAssistantPanelProps) {
  // Prediction state
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  // LMN state
  const [lmn, setLmn] = useState<LmnResult | null>(null);
  const [lmnLoading, setLmnLoading] = useState(false);
  const [lmnModalOpen, setLmnModalOpen] = useState(false);

  // Summary state
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Appeal draft state
  const [appealDraft, setAppealDraft] = useState<AppealDraftResult | null>(null);
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const [selectedDenialId, setSelectedDenialId] = useState<string | null>(null);

  const isDraft = request.status === "draft";
  const hasDenials = request.denials.length > 0;

  // ── Predict Approval ──
  const handlePredict = useCallback(async () => {
    setPredictionLoading(true);
    try {
      const res = await fetch("/api/ai/predict-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to predict approval");
      }
      const data = await res.json();
      setPrediction(data);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Prediction failed", "error");
    } finally {
      setPredictionLoading(false);
    }
  }, [request.id, addToast]);

  // ── Generate LMN ──
  const handleGenerateLmn = useCallback(async () => {
    setLmnLoading(true);
    try {
      const res = await fetch("/api/ai/generate-lmn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate LMN");
      }
      const data = await res.json();
      setLmn(data);
      setLmnModalOpen(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "LMN generation failed", "error");
    } finally {
      setLmnLoading(false);
    }
  }, [request.id, addToast]);

  // ── Summarize Clinical ──
  const handleSummarize = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/ai/summarize-clinical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to summarize");
      }
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Summarization failed", "error");
    } finally {
      setSummaryLoading(false);
    }
  }, [request.id, addToast]);

  // ── Draft Appeal ──
  const handleDraftAppeal = useCallback(async (denialId: string) => {
    setAppealLoading(true);
    setSelectedDenialId(denialId);
    try {
      const res = await fetch("/api/ai/draft-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ denialId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to draft appeal");
      }
      const data = await res.json();
      setAppealDraft(data);
      setAppealModalOpen(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Appeal draft failed", "error");
    } finally {
      setAppealLoading(false);
    }
  }, [addToast]);

  return (
    <>
      <Card variant="glass" padding="md" className="border-violet-500/20">
        <CardTitle className="mb-5">
          <span className="flex items-center gap-2">
            <SparklesIcon />
            AI Assistant
          </span>
        </CardTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── Approval Prediction ── */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <ChartIcon />
              <h4 className="text-sm font-semibold text-text-primary">Approval Prediction</h4>
            </div>

            {!prediction ? (
              <>
                <p className="text-xs text-text-muted mb-3">
                  Analyze approval probability based on codes, payer history, and documentation completeness. No PHI sent to AI.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePredict}
                  isLoading={predictionLoading}
                  disabled={isDraft}
                >
                  <ChartIcon />
                  Predict Approval
                </Button>
                {isDraft && (
                  <p className="text-xs text-text-muted mt-2">Submit request first to predict approval.</p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <ProbabilityRing probability={prediction.probability} riskLevel={prediction.riskLevel} />
                  <div className="flex-1 space-y-2">
                    <FactorList label="Supporting" items={prediction.factors.positive} variant="positive" />
                    <FactorList label="Against" items={prediction.factors.negative} variant="negative" />
                    <FactorList label="Missing" items={prediction.factors.missing} variant="missing" />
                  </div>
                </div>
                {prediction.recommendations.length > 0 && (
                  <div className="pt-3 border-t border-white/5">
                    <p className="text-xs font-medium text-violet-400 mb-1.5">Recommendations</p>
                    <ul className="space-y-1">
                      {prediction.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                          <span className="text-violet-400 mt-0.5">&#8227;</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[10px] text-text-muted">
                    {prediction.metadata.processingTimeMs}ms
                  </span>
                  <Button variant="ghost" size="sm" onClick={handlePredict} isLoading={predictionLoading}>
                    Refresh
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Clinical Summary ── */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheckIcon />
              <h4 className="text-sm font-semibold text-text-primary">Clinical Summary</h4>
            </div>

            {!summary ? (
              <>
                <p className="text-xs text-text-muted mb-3">
                  Generate a concise clinical justification summary with key findings and supporting diagnoses.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSummarize}
                  isLoading={summaryLoading}
                  disabled={isDraft}
                >
                  <ShieldCheckIcon />
                  Summarize Clinical
                </Button>
                {isDraft && (
                  <p className="text-xs text-text-muted mt-2">Submit request first to generate summary.</p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary leading-relaxed">{summary.summary}</p>
                {summary.keyFindings.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-emerald-400 mb-1">Key Findings</p>
                    <ul className="space-y-1">
                      {summary.keyFindings.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.supportingDiagnoses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-sky-400 mb-1">Supporting Diagnoses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.supportingDiagnoses.map((d, i) => (
                        <Badge key={i} variant="info" size="sm">{d}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[10px] text-text-muted">
                    {summary.metadata.processingTimeMs}ms
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleSummarize} isLoading={summaryLoading}>
                    Refresh
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Generate LMN ── */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <DocumentTextIcon />
              <h4 className="text-sm font-semibold text-text-primary">Letter of Medical Necessity</h4>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Generate a physician-ready LMN using clinical data, ACR guidelines, and payer requirements.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateLmn}
                isLoading={lmnLoading}
                disabled={isDraft}
              >
                <DocumentTextIcon />
                Generate LMN
              </Button>
              {lmn && (
                <Button variant="ghost" size="sm" onClick={() => setLmnModalOpen(true)}>
                  View Letter
                </Button>
              )}
            </div>
            {isDraft && (
              <p className="text-xs text-text-muted mt-2">Submit request first to generate LMN.</p>
            )}
            {lmn && (
              <p className="text-xs text-emerald-400 mt-2">
                LMN generated ({lmn.metadata.processingTimeMs}ms)
              </p>
            )}
          </div>

          {/* ── Draft Appeal ── */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <ScaleIcon />
              <h4 className="text-sm font-semibold text-text-primary">Appeal Drafter</h4>
            </div>
            {hasDenials ? (
              <>
                <p className="text-xs text-text-muted mb-3">
                  Draft an evidence-based appeal letter referencing the denial reason, clinical guidelines, and prior decisions.
                </p>
                <div className="space-y-2">
                  {request.denials.map((denial) => (
                    <Button
                      key={denial.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleDraftAppeal(denial.id)}
                      isLoading={appealLoading && selectedDenialId === denial.id}
                      disabled={appealLoading && selectedDenialId !== denial.id}
                    >
                      <ScaleIcon />
                      Draft Appeal — {denial.reasonCategory.replace(/_/g, " ")}
                    </Button>
                  ))}
                </div>
                {appealDraft && (
                  <button
                    className="text-xs text-violet-400 hover:text-violet-300 mt-2 transition-colors"
                    onClick={() => setAppealModalOpen(true)}
                  >
                    View latest draft &rarr;
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-text-muted">
                No denials on this request. Appeal drafting will be available if the request is denied.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── LMN Modal ── */}
      <Modal isOpen={lmnModalOpen} onClose={() => setLmnModalOpen(false)} title="Letter of Medical Necessity" size="lg">
        {lmn && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 max-h-[60vh] overflow-y-auto">
              <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                {lmn.letter}
              </pre>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">
                {lmn.metadata.tokensUsed.toLocaleString()} tokens &middot; {lmn.metadata.processingTimeMs}ms
              </span>
              <div className="flex gap-2">
                <CopyButton text={lmn.letter} />
                <Button variant="primary" size="sm" onClick={handleGenerateLmn} isLoading={lmnLoading}>
                  Regenerate
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Appeal Draft Modal ── */}
      <Modal isOpen={appealModalOpen} onClose={() => setAppealModalOpen(false)} title="AI-Drafted Appeal Letter" size="lg">
        {appealDraft && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 max-h-[60vh] overflow-y-auto">
              <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                {appealDraft.letter}
              </pre>
            </div>
            {appealDraft.suggestedEvidence.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-400 mb-2">Suggested Supporting Evidence</p>
                <ul className="space-y-1">
                  {appealDraft.suggestedEvidence.map((ev, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">
                {appealDraft.metadata.tokensUsed.toLocaleString()} tokens &middot; {appealDraft.metadata.processingTimeMs}ms
              </span>
              <div className="flex gap-2">
                <CopyButton text={appealDraft.letter} />
                {selectedDenialId && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleDraftAppeal(selectedDenialId)}
                    isLoading={appealLoading}
                  >
                    Regenerate
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
