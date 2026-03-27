"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusDonutChart } from "@/components/dashboard/status-donut-chart";
import { TurnaroundTrendChart } from "@/components/dashboard/turnaround-trend-chart";
import { DenialReasonsChart } from "@/components/dashboard/denial-reasons-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { MetricCard } from "@/components/dashboard/metric-card";

interface DashboardStats {
  totalPAs: number;
  approvalRate: number;
  denialRate: number;
  avgTurnaround: number;
  pendingCount: number;
  statusDistribution: { name: string; value: number; status: string }[];
  activityFeed: {
    id: string;
    user: string;
    referenceNumber: string;
    patientName: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[];
  turnaroundTrend: { week: string; avgDays: number }[];
  topDenialReasons: { category: string; rawCategory: string; count: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (!res.ok) throw new Error("Failed to fetch dashboard stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">Dashboard</h1>
          <p className="text-text-secondary mt-1">Overview of your prior authorization operations</p>
        </div>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-red-400">
            <p>{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Dashboard</h1>
        <p className="text-text-secondary mt-1">
          Overview of your prior authorization operations
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Total PAs"
          value={stats.totalPAs.toLocaleString()}
          color="text-text-primary"
          icon="📋"
        />
        <MetricCard
          label="Approval Rate"
          value={`${stats.approvalRate}%`}
          color="text-emerald-400"
          icon="✅"
        />
        <MetricCard
          label="Avg Turnaround"
          value={`${stats.avgTurnaround} biz days`}
          color="text-sky-400"
          icon="⏱️"
        />
        <MetricCard
          label="Pending"
          value={stats.pendingCount.toLocaleString()}
          color="text-amber-400"
          icon="⏳"
        />
        <MetricCard
          label="Denial Rate"
          value={`${stats.denialRate}%`}
          color="text-red-400"
          icon="❌"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">Status Distribution</CardTitle>
          <div className="h-72">
            <StatusDonutChart data={stats.statusDistribution} />
          </div>
        </Card>

        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">Turnaround Trend</CardTitle>
          <div className="h-72">
            <TurnaroundTrendChart data={stats.turnaroundTrend} />
          </div>
        </Card>
      </div>

      {/* Denial Reasons & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">Top Denial Reasons</CardTitle>
          <div className="h-72">
            <DenialReasonsChart data={stats.topDenialReasons} />
          </div>
        </Card>

        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">Recent Activity</CardTitle>
          <div className="h-72 overflow-y-auto pr-1">
            <ActivityFeed items={stats.activityFeed} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Dashboard</h1>
        <p className="text-text-secondary mt-1">Overview of your prior authorization operations</p>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} variant="glass" padding="md">
            <div className="animate-pulse">
              <div className="h-3 w-20 bg-white/10 rounded mb-3" />
              <div className="h-7 w-16 bg-white/10 rounded" />
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} variant="glass" padding="md">
            <div className="animate-pulse">
              <div className="h-4 w-32 bg-white/10 rounded mb-4" />
              <div className="h-64 bg-white/5 rounded-xl" />
            </div>
          </Card>
        ))}
      </div>

      {/* Bottom Row Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} variant="glass" padding="md">
            <div className="animate-pulse">
              <div className="h-4 w-32 bg-white/10 rounded mb-4" />
              <div className="h-64 bg-white/5 rounded-xl" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
