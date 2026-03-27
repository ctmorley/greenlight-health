"use client";

import { StatusBadge } from "@/components/ui/badge";

interface ActivityItem {
  id: string;
  user: string;
  referenceNumber: string;
  patientName: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates
  if (diffMs < 0) {
    const futureMins = Math.floor(-diffMs / 60000);
    const futureHours = Math.floor(-diffMs / 3600000);
    const futureDays = Math.floor(-diffMs / 86400000);
    if (futureMins < 1) return "just now";
    if (futureMins < 60) return `in ${futureMins}m`;
    if (futureHours < 24) return `in ${futureHours}h`;
    if (futureDays < 7) return `in ${futureDays}d`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActivityFeed({ items, data }: { items?: ActivityItem[]; data?: ActivityItem[] }) {
  const feedData = items || data || [];
  if (feedData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-text-muted">
        No recent activity
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {feedData.map((item) => (
        <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          {/* Timeline dot */}
          <div className="mt-1.5 w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-text-primary font-medium truncate">
                {item.user}
              </span>
              <span className="text-xs text-text-muted">
                updated
              </span>
              <span className="text-sm text-accent-sky font-mono">
                {item.referenceNumber}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={item.fromStatus} />
              <svg
                className="w-3 h-3 text-text-muted flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <StatusBadge status={item.toStatus} />
            </div>

            {item.note && (
              <p className="text-xs text-text-muted mt-1 truncate">{item.note}</p>
            )}

            <p className="text-xs text-text-muted mt-0.5">
              {item.patientName}
            </p>
          </div>

          <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">
            {relativeTime(item.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
