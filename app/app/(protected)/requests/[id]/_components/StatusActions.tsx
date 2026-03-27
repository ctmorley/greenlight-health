"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Dropdown, DropdownItem, DropdownDivider } from "@/components/ui/dropdown";
import { Modal } from "@/components/ui/modal";
import { ChevronDownIcon } from "./icons";
import { TRANSITION_ACTIONS } from "@/lib/status-transitions";
import { DENIAL_REASON_CATEGORIES, getCodeOptionsForCategory } from "@/lib/denial-reasons";

interface StatusActionsProps {
  requestId: string;
  referenceNumber: string;
  currentStatus: string;
  canChangeStatus: boolean;
  onStatusChanged: () => void;
  addToast: (message: string, type: "success" | "error") => void;
}

export function StatusActions({
  requestId,
  referenceNumber,
  currentStatus,
  canChangeStatus,
  onStatusChanged,
  addToast,
}: StatusActionsProps) {
  const [statusConfirm, setStatusConfirm] = useState<{ status: string; label: string } | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  // Denial-specific fields
  const [denialCategory, setDenialCategory] = useState("");
  const [denialCode, setDenialCode] = useState("");
  const [denialDescription, setDenialDescription] = useState("");
  const [denialPayerNotes, setDenialPayerNotes] = useState("");

  const availableTransitions = TRANSITION_ACTIONS[currentStatus] || [];
  const isDenying = statusConfirm?.status === "denied";

  const resetForm = () => {
    setStatusConfirm(null);
    setStatusNote("");
    setDenialCategory("");
    setDenialCode("");
    setDenialDescription("");
    setDenialPayerNotes("");
  };

  const handleStatusChange = async (newStatus: string) => {
    // Validate denial fields — category, code, and description all required
    if (newStatus === "denied") {
      if (!denialCategory) {
        addToast("Please select a denial reason category", "error");
        return;
      }
      if (!denialCode) {
        addToast("Please select a denial reason code", "error");
        return;
      }
      if (!denialDescription.trim()) {
        addToast("Please enter a denial reason description", "error");
        return;
      }
    }

    setStatusLoading(true);
    try {
      const payload: Record<string, unknown> = {
        status: newStatus,
        note: statusNote || undefined,
      };

      if (newStatus === "denied") {
        payload.denialReasonCategory = denialCategory;
        payload.denialReasonCode = denialCode || undefined;
        payload.denialReasonDescription = denialDescription;
        payload.denialPayerNotes = denialPayerNotes || undefined;
      }

      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      addToast(`Status updated to ${newStatus.replace(/_/g, " ")}`, "success");
      resetForm();
      onStatusChanged();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setStatusLoading(false);
    }
  };

  if (!canChangeStatus || availableTransitions.length === 0) return null;

  const availableCodesForCategory = denialCategory ? getCodeOptionsForCategory(denialCategory) : [];

  return (
    <>
      <Dropdown
        trigger={
          <Button variant="primary" size="sm">
            Update Status
            <ChevronDownIcon />
          </Button>
        }
        align="right"
      >
        {availableTransitions.map((transition, idx) => (
          <div key={transition.status}>
            {idx > 0 && transition.variant === "danger" &&
              availableTransitions[idx - 1]?.variant !== "danger" && (
                <DropdownDivider />
              )}
            <DropdownItem
              variant={transition.variant === "danger" ? "danger" : "default"}
              onClick={() => setStatusConfirm(transition)}
            >
              {transition.label}
            </DropdownItem>
          </div>
        ))}
      </Dropdown>

      {/* Status Change Confirmation Modal */}
      <Modal
        isOpen={!!statusConfirm}
        onClose={resetForm}
        title={statusConfirm?.label || "Update Status"}
        size={isDenying ? "lg" : "sm"}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to change the status of{" "}
            <span className="font-mono text-text-primary">{referenceNumber}</span>{" "}
            from <StatusBadge status={currentStatus} /> to{" "}
            <StatusBadge status={statusConfirm?.status || ""} />?
          </p>

          {/* Denial-specific fields */}
          {isDenying && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <p className="text-xs font-medium text-amber-400">
                Denial details are required to proceed.
              </p>

              <div>
                <Select
                  label="Reason Category *"
                  options={DENIAL_REASON_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                  placeholder="Select a reason category..."
                  value={denialCategory}
                  onChange={(e) => {
                    setDenialCategory(e.target.value);
                    setDenialCode(""); // Reset code when category changes
                  }}
                />
              </div>

              {availableCodesForCategory.length > 0 && (
                <div>
                  <Select
                    label="Reason Code *"
                    options={availableCodesForCategory}
                    placeholder="Select a reason code..."
                    value={denialCode}
                    onChange={(e) => setDenialCode(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Reason Description *
                </label>
                <textarea
                  value={denialDescription}
                  onChange={(e) => setDenialDescription(e.target.value)}
                  placeholder="Describe the reason for denial..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Payer Notes <span className="text-text-muted">(optional)</span>
                </label>
                <textarea
                  value={denialPayerNotes}
                  onChange={(e) => setDenialPayerNotes(e.target.value)}
                  placeholder="Any notes from the payer..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 resize-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted mb-1">
              Note <span className="text-text-muted">(optional)</span>
            </label>
            <textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Add a note about this status change..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              variant={statusConfirm?.label?.includes("Deny") || statusConfirm?.label?.includes("Cancel") ? "danger" : "primary"}
              size="sm"
              isLoading={statusLoading}
              disabled={isDenying && (!denialCategory || !denialCode || !denialDescription.trim())}
              onClick={() => statusConfirm && handleStatusChange(statusConfirm.status)}
            >
              {statusConfirm?.label || "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
