"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AppealsIcon } from "./icons";
import { appealLevelLabels, appealStatusConfig, formatDate } from "./helpers";
import type { AppealEntry } from "./types";

interface AppealsCardProps {
  appeals: AppealEntry[];
  canManage?: boolean;
  onAppealUpdated?: () => void;
  addToast?: (message: string, type: "success" | "error") => void;
}

export function AppealsCard({ appeals, canManage = false, onAppealUpdated, addToast }: AppealsCardProps) {
  const [outcomeModal, setOutcomeModal] = useState<{ appealId: string; action: "won" | "lost" } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  if (appeals.length === 0) return null;

  const handleOutcome = async () => {
    if (!outcomeModal) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/appeals/${outcomeModal.appealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: outcomeModal.action,
          decisionNotes: decisionNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update appeal");
      }

      addToast?.(`Appeal marked as ${outcomeModal.action}`, "success");
      setOutcomeModal(null);
      setDecisionNotes("");
      onAppealUpdated?.();
    } catch (err) {
      addToast?.(err instanceof Error ? err.message : "Failed to update appeal", "error");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Card variant="glass" padding="md">
        <CardTitle className="mb-4">
          <span className="flex items-center gap-2">
            <AppealsIcon />
            Appeals
          </span>
        </CardTitle>
        <div className="space-y-4">
          {appeals.map((appeal) => {
            const statusConf = appealStatusConfig[appeal.status] || { variant: "default" as const, label: appeal.status };
            const isActive = ["draft", "filed", "in_review"].includes(appeal.status);

            return (
              <div
                key={appeal.id}
                className="p-4 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="warning" size="md">
                      {appealLevelLabels[appeal.appealLevel] || appeal.appealLevel}
                    </Badge>
                    <Badge variant={statusConf.variant} size="md">{statusConf.label}</Badge>
                    <span className="text-xs text-text-muted">Filed {formatDate(appeal.filedDate)}</span>
                  </div>

                  {/* Outcome buttons for active appeals */}
                  {canManage && isActive && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setOutcomeModal({ appealId: appeal.id, action: "won" })}
                      >
                        Mark Won
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setOutcomeModal({ appealId: appeal.id, action: "lost" })}
                      >
                        Mark Lost
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-text-secondary">{appeal.appealReason}</p>
                <p className="text-xs text-text-muted mt-2">Filed by {appeal.filedBy}</p>
                {appeal.decisionDate && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-xs text-text-muted">
                      Decision: {formatDate(appeal.decisionDate)}
                    </p>
                    {appeal.decisionNotes && (
                      <p className="text-sm text-text-secondary mt-1">{appeal.decisionNotes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Outcome Modal */}
      <Modal
        isOpen={!!outcomeModal}
        onClose={() => {
          setOutcomeModal(null);
          setDecisionNotes("");
        }}
        title={outcomeModal?.action === "won" ? "Mark Appeal as Won" : "Mark Appeal as Lost"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {outcomeModal?.action === "won"
              ? "Marking this appeal as won will transition the PA request to approved status."
              : "Marking this appeal as lost will transition the PA request back to denied status."}
          </p>

          <div>
            <label className="block text-xs text-text-muted mb-1">
              Decision Notes <span className="text-text-muted">(optional)</span>
            </label>
            <textarea
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder="Notes about the appeal decision..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOutcomeModal(null);
                setDecisionNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant={outcomeModal?.action === "won" ? "primary" : "danger"}
              size="sm"
              isLoading={updating}
              onClick={handleOutcome}
            >
              {outcomeModal?.action === "won" ? "Confirm Won" : "Confirm Lost"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
