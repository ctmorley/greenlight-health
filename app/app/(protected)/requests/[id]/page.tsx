"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { STATUS_CHANGE_ROLES } from "@/lib/status-transitions";

import {
  PatientInfoCard,
  PayerRoutingCard,
  ServiceDetailsCard,
  AiAssistantPanel,
  DocumentsCard,
  TimelineCard,
  DenialsCard,
  AppealsCard,
  StatusActions,
  serviceTypeLabels,
  urgencyConfig,
} from "./_components";
import type { RequestDetail } from "./_components";
import { ArrowLeftIcon, ChatBubbleIcon } from "./_components/icons";

// ─── Loading Skeleton ───────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 bg-white/10 rounded animate-pulse" />
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-48 bg-white/10 rounded animate-pulse" />
        <div className="h-6 w-20 bg-white/10 rounded-full animate-pulse" />
        <div className="h-6 w-16 bg-white/10 rounded-full animate-pulse" />
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="glass" padding="md">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-24 bg-white/10 rounded" />
            <div className="h-4 w-48 bg-white/5 rounded" />
            <div className="h-4 w-36 bg-white/5 rounded" />
            <div className="h-px bg-white/5" />
            <div className="h-4 w-56 bg-white/5 rounded" />
          </div>
        </Card>
        <Card variant="glass" padding="md">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-24 bg-white/10 rounded" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-16 bg-white/5 rounded" />
                  <div className="h-4 w-24 bg-white/10 rounded" />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      {/* Service details skeleton */}
      <Card variant="glass" padding="md">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-6 w-16 bg-white/5 rounded" />
            ))}
          </div>
          <div className="h-16 bg-white/5 rounded-xl" />
        </div>
      </Card>
      {/* Timeline skeleton */}
      <Card variant="glass" padding="md">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-24 bg-white/10 rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-white/10" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 bg-white/5 rounded" />
                <div className="h-3 w-24 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const { addToast } = useToast();

  const userRole = session?.user?.role || "viewer";
  const canChangeStatus = STATUS_CHANGE_ROLES.includes(userRole);
  const canAddNotes = ["admin", "pa_coordinator", "physician"].includes(userRole);

  const fetchRequest = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${params.id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Request not found");
        throw new Error("Failed to fetch request");
      }
      const data = await res.json();
      setRequest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchRequest();
  }, [params.id, fetchRequest]);

  // ── Add Note Handler ──
  const handleAddNote = async () => {
    if (!request || !noteText.trim()) return;
    setNoteLoading(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add note");
      }

      const newEntry = await res.json();
      setRequest((prev) =>
        prev ? { ...prev, timeline: [newEntry, ...prev.timeline] } : prev
      );
      setNoteText("");
      setShowNoteForm(false);
      addToast("Note added to timeline", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to add note", "error");
    } finally {
      setNoteLoading(false);
    }
  };

  // ── Rendering ──

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error || !request) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/app/requests")}>
          <ArrowLeftIcon />
          Back to Requests
        </Button>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-red-400">
            <p>{error || "Request not found"}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/app/requests")}>
        <ArrowLeftIcon />
        Back to Requests
      </Button>

      {/* ═══════════════ Header ═══════════════ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-display text-text-primary font-mono">
              {request.referenceNumber}
            </h1>
            <StatusBadge status={request.status} data-testid="header-status-badge" />
            <Badge variant={urgencyConfig[request.urgency]?.variant || "default"}>
              {urgencyConfig[request.urgency]?.label || request.urgency}
            </Badge>
          </div>
          <p className="text-text-secondary mt-1">
            {request.serviceType
              ? serviceTypeLabels[request.serviceType] || request.serviceType
              : "—"}
            <span className="text-text-muted mx-2">|</span>
            {request.payer?.name || "No payer"}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {request.status === "draft" && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push(`/app/requests/new?draft=${request.id}`)}
            >
              Edit Draft
            </Button>
          )}
          {request.status === "denied" && canChangeStatus && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push(`/app/requests/${request.id}/appeal`)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              File Appeal
            </Button>
          )}
          {canAddNotes && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowNoteForm(!showNoteForm)}
            >
              <ChatBubbleIcon />
              Add Note
            </Button>
          )}

          <StatusActions
            requestId={request.id}
            referenceNumber={request.referenceNumber}
            currentStatus={request.status}
            canChangeStatus={canChangeStatus}
            onStatusChanged={fetchRequest}
            addToast={addToast}
          />
        </div>
      </div>

      {/* ═══════════════ Note Form (inline, below header) ═══════════════ */}
      {showNoteForm && (
        <Card variant="glass" padding="md">
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-primary">Add a Note</label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here... (e.g., 'Spoke with payer rep')"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 resize-none"
              maxLength={2000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{noteText.length}/2000</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNoteForm(false);
                    setNoteText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!noteText.trim()}
                  isLoading={noteLoading}
                  onClick={handleAddNote}
                >
                  Add Note
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ═══════════════ Main Content Grid ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PatientInfoCard
          patient={request.patient}
          insurance={request.insurance}
          payerName={request.payer?.name}
        />
        <PayerRoutingCard request={request} />
      </div>

      {/* ═══════════════ Service Details ═══════════════ */}
      <ServiceDetailsCard request={request} />

      {/* ═══════════════ AI Assistant ═══════════════ */}
      <AiAssistantPanel request={request} addToast={addToast} />

      {/* ═══════════════ Denials (if any) ═══════════════ */}
      <DenialsCard
        denials={request.denials}
        requestId={request.id}
        requestStatus={request.status}
        canFileAppeal={canChangeStatus && request.status === "denied"}
      />

      {/* ═══════════════ Appeals (if any) ═══════════════ */}
      <AppealsCard
        appeals={request.appeals}
        canManage={canChangeStatus}
        onAppealUpdated={fetchRequest}
        addToast={addToast}
      />

      {/* ═══════════════ Documents ═══════════════ */}
      <DocumentsCard requestId={request.id} documents={request.documents} />

      {/* ═══════════════ Timeline ═══════════════ */}
      <TimelineCard timeline={request.timeline} />
    </div>
  );
}
