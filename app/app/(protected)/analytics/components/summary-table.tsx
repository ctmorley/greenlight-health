"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryRow } from "./analytics-types";

export function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Summary Table</CardTitle>
      {rows.length === 0 ? (
        <EmptyState icon="📋" title="No data" description="No PA requests found in this period" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Reference</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Service Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Patient</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Payer</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Created</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Decided</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2 font-mono text-text-primary text-xs">{row.referenceNumber}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      row.status === "approved" ? "bg-emerald-500/20 text-emerald-300"
                        : row.status === "denied" ? "bg-red-500/20 text-red-300"
                        : row.status === "pending_review" || row.status === "submitted" ? "bg-amber-500/20 text-amber-300"
                        : "bg-white/10 text-text-secondary"
                    }`}>
                      {row.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.serviceType.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-text-primary">{row.patientName}</td>
                  <td className="px-3 py-2 text-text-secondary">{row.payer}</td>
                  <td className="px-3 py-2 text-text-muted">{row.createdDate}</td>
                  <td className="px-3 py-2 text-text-muted">{row.decidedDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length >= 50 && (
            <p className="text-xs text-text-muted text-center py-2">Showing first 50 records. Export CSV for full data.</p>
          )}
        </div>
      )}
    </Card>
  );
}
