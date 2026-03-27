"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TimelineIcon, ArrowRightIcon, NoteIcon } from "./icons";
import { relativeTime, absoluteTime } from "./helpers";
import type { TimelineEntry } from "./types";

interface TimelineCardProps {
  timeline: TimelineEntry[];
}

export function TimelineCard({ timeline }: TimelineCardProps) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">
        <span className="flex items-center gap-2">
          <TimelineIcon />
          Timeline
        </span>
      </CardTitle>
      {timeline.length > 0 ? (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/10" />
          <div className="space-y-4">
            {timeline.map((entry) => {
              const isNote = entry.fromStatus === entry.toStatus;
              return (
                <div key={entry.id} className="flex gap-4 relative">
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center z-10 ${
                      isNote
                        ? "bg-sky-500/20 border border-sky-500/40"
                        : "bg-emerald-500/20 border border-emerald-500/40"
                    }`}
                  >
                    {isNote ? (
                      <NoteIcon />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    {isNote ? (
                      <div>
                        <p className="text-sm text-text-primary">{entry.note}</p>
                        <p className="text-xs text-text-muted mt-1">
                          <span className="text-sky-400">Note</span> by {entry.changedBy} · {relativeTime(entry.createdAt)}
                          <span className="ml-1 text-text-muted/60" title={absoluteTime(entry.createdAt)}>({absoluteTime(entry.createdAt)})</span>
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={entry.fromStatus} />
                          <ArrowRightIcon className="w-3 h-3 text-text-muted" />
                          <StatusBadge status={entry.toStatus} />
                        </div>
                        {entry.note && (
                          <p className="text-sm text-text-secondary mt-1">{entry.note}</p>
                        )}
                        <p className="text-xs text-text-muted mt-1">
                          {entry.changedBy} · {relativeTime(entry.createdAt)}
                          <span className="ml-1 text-text-muted/60" title={absoluteTime(entry.createdAt)}>({absoluteTime(entry.createdAt)})</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No timeline events yet</p>
      )}
    </Card>
  );
}
