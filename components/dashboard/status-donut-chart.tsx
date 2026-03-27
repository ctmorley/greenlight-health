"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface StatusItem {
  name: string;
  value: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#64748B",
  submitted: "#0EA5E9",
  pending_review: "#F59E0B",
  approved: "#10B981",
  partially_approved: "#34D399",
  denied: "#F43F5E",
  appealed: "#0EA5E9",
  expired: "#6B7280",
  cancelled: "#475569",
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: StatusItem }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="glass px-3 py-2 text-sm">
      <p className="text-text-primary font-medium">{data.name}</p>
      <p className="text-text-secondary">{data.value} requests</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLegend(props: any) {
  const { payload } = props as { payload?: Array<{ value: string; color: string }> };
  if (!payload) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </div>
      ))}
    </div>
  );
}

export function StatusDonutChart({ data }: { data: StatusItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-text-muted">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#64748B"} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={renderLegend} />
      </PieChart>
    </ResponsiveContainer>
  );
}
