"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartTooltip } from "./chart-tooltip";
import { AnalyticsData, CHART_COLORS, DENIAL_COLORS } from "./analytics-types";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const AXIS_STYLE = { fill: "#94A3B8", fontSize: 11 };
const AXIS_LINE = { stroke: "rgba(255,255,255,0.1)" };
const GRID_STROKE = "rgba(255,255,255,0.06)";

export function ApprovalRateChart({ data }: { data: AnalyticsData["approvalRateOverTime"] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Approval Rate Over Time</CardTitle>
      <div className="h-72">
        {data.length === 0 ? (
          <EmptyState icon="📈" title="No data" description="No decided requests in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} domain={[0, 100]} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="approvalRate" name="Approval Rate" stroke="#10B981" strokeWidth={2} dot={{ fill: "#10B981", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function VolumeByTypeChart({ data }: { data: AnalyticsData["volumeByType"] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Volume by Service Type</CardTitle>
      <div className="h-72">
        {data.length === 0 ? (
          <EmptyState icon="🏥" title="No data" description="No requests in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis type="number" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis type="category" dataKey="type" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} width={90} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Requests" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function VolumeByPayerChart({ data }: { data: AnalyticsData["volumeByPayer"] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Volume by Payer</CardTitle>
      <div className="h-72">
        {data.length === 0 ? (
          <EmptyState icon="🏦" title="No data" description="No requests with payers in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="payer" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={AXIS_LINE} tickLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Requests" radius={[4, 4, 0, 0]}>
                {data.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function TurnaroundByPayerChart({ data }: { data: AnalyticsData["avgTurnaroundByPayer"] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Avg Turnaround by Payer</CardTitle>
      <div className="h-72">
        {data.length === 0 ? (
          <EmptyState icon="⏱️" title="No data" description="No decided requests in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis type="number" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} unit=" d" />
              <YAxis type="category" dataKey="payer" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={AXIS_LINE} tickLine={false} width={100} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avgDays" name="Avg Days" fill="#F59E0B" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function DenialReasonsChart({ data }: { data: AnalyticsData["denialReasonsBreakdown"] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Denial Reasons Breakdown</CardTitle>
      <div className="h-72">
        {data.length === 0 ? (
          <EmptyState icon="📊" title="No denials" description="No denials in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="category"
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell key={entry.rawCategory} fill={DENIAL_COLORS[entry.rawCategory] || "#64748B"} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(value: string) => <span className="text-xs text-text-secondary">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function AppealSuccessChart({ data }: { data: AnalyticsData["appealSuccessRate"] }) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">Appeal Success Rate</CardTitle>
      <div className="h-72">
        {data.length === 0 ? (
          <EmptyState icon="⚖️" title="No appeals" description="No decided appeals in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="level" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(value: string) => <span className="text-xs text-text-secondary">{value}</span>} />
              <Bar dataKey="won" name="Won" fill="#10B981" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="lost" name="Lost" fill="#F43F5E" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
