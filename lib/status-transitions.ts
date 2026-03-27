/**
 * Shared status-transition definitions consumed by both the API and the UI.
 * Single source of truth — prevents drift between layers.
 */

/**
 * Raw transition map: current status → allowed next statuses.
 * Note: draft → submitted is handled by the dedicated /submit endpoint, not the
 * generic status-change route, so it is intentionally excluded here.
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["cancelled"],
  submitted: ["pending_review", "cancelled"],
  pending_review: ["approved", "partially_approved", "denied", "cancelled"],
  approved: ["expired", "cancelled"],
  partially_approved: ["expired", "cancelled"],
  denied: [],
  appealed: ["approved", "denied", "cancelled"],
  expired: [],
  cancelled: [],
};

/**
 * UI-friendly transition descriptors used to render status-change buttons.
 * Each entry includes a human-readable label and an optional "danger" flag for
 * destructive actions (deny, cancel, expire).
 */
export interface TransitionAction {
  status: string;
  label: string;
  variant?: "danger";
}

export const TRANSITION_ACTIONS: Record<string, TransitionAction[]> = {
  draft: [
    { status: "cancelled", label: "Cancel", variant: "danger" },
  ],
  submitted: [
    { status: "pending_review", label: "Mark Pending Review" },
    { status: "cancelled", label: "Cancel", variant: "danger" },
  ],
  pending_review: [
    { status: "approved", label: "Approve" },
    { status: "partially_approved", label: "Partially Approve" },
    { status: "denied", label: "Deny", variant: "danger" },
    { status: "cancelled", label: "Cancel", variant: "danger" },
  ],
  approved: [
    { status: "expired", label: "Mark Expired", variant: "danger" },
    { status: "cancelled", label: "Cancel", variant: "danger" },
  ],
  partially_approved: [
    { status: "expired", label: "Mark Expired", variant: "danger" },
    { status: "cancelled", label: "Cancel", variant: "danger" },
  ],
  denied: [],
  appealed: [
    { status: "approved", label: "Approve" },
    { status: "denied", label: "Deny", variant: "danger" },
    { status: "cancelled", label: "Cancel", variant: "danger" },
  ],
};

/** Roles allowed to perform status changes. */
export const STATUS_CHANGE_ROLES = ["admin", "pa_coordinator"];

/**
 * Check whether a transition from `currentStatus` to `newStatus` is valid.
 */
export function isValidTransition(currentStatus: string, newStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus];
  return !!allowed && allowed.includes(newStatus);
}
