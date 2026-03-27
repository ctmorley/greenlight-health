"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { useToast } from "@/components/ui/toast";
import { AnalyticsData, SummaryRow } from "./components/analytics-types";
import { AnalyticsSkeleton } from "./components/analytics-skeleton";
import { SummaryTable } from "./components/summary-table";
import {
  ApprovalRateChart,
  VolumeByTypeChart,
  VolumeByPayerChart,
  TurnaroundByPayerChart,
  DenialReasonsChart,
  AppealSuccessChart,
} from "./components/analytics-charts";

export default function AnalyticsPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);

  // Default to last 6 months
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const [analyticsRes, summaryRes] = await Promise.all([
        fetch(`/api/analytics?${params.toString()}`),
        fetch(`/api/analytics/summary?${params.toString()}`),
      ]);

      if (!analyticsRes.ok) throw new Error("Failed to fetch analytics data");
      const json = await analyticsRes.json();
      setData(json);

      // Fetch summary table rows as JSON (avoids fragile CSV parsing)
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummaryRows(summaryData.rows || []);
      } else {
        setSummaryRows([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/analytics/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pa-requests-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("CSV exported successfully", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to export CSV", "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">Analytics</h1>
          <p className="text-text-secondary mt-1">Reporting and performance insights</p>
        </div>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-red-400">
            <p>{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">Analytics</h1>
          <p className="text-text-secondary mt-1">Reporting and performance insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all [color-scheme:dark]"
            />
            <span className="text-text-muted text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all [color-scheme:dark]"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport} isLoading={exporting}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Total PAs" value={data.summary.totalPAs.toLocaleString()} color="text-text-primary" icon="📋" />
        <MetricCard label="Approval Rate" value={`${data.summary.approvalRate}%`} color="text-emerald-400" icon="✅" />
        <MetricCard label="Denial Rate" value={`${data.summary.denialRate}%`} color="text-red-400" icon="❌" />
        <MetricCard label="Total Appeals" value={data.summary.totalAppeals.toLocaleString()} color="text-amber-400" icon="⚖️" />
        <MetricCard label="Appeal Success" value={`${data.summary.overallAppealSuccessRate}%`} color="text-sky-400" icon="🏆" />
      </div>

      {/* Row 1: Approval Rate Over Time + Volume by Service Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ApprovalRateChart data={data.approvalRateOverTime} />
        <VolumeByTypeChart data={data.volumeByType} />
      </div>

      {/* Row 2: Volume by Payer + Avg Turnaround by Payer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VolumeByPayerChart data={data.volumeByPayer} />
        <TurnaroundByPayerChart data={data.avgTurnaroundByPayer} />
      </div>

      {/* Row 3: Denial Reasons + Appeal Success Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DenialReasonsChart data={data.denialReasonsBreakdown} />
        <AppealSuccessChart data={data.appealSuccessRate} />
      </div>

      {/* Summary Table */}
      <SummaryTable rows={summaryRows} />
    </div>
  );
}
