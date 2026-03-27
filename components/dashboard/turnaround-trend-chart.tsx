"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TurnaroundItem {
  week: string;
  avgDays: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 text-sm">
      <p className="text-text-secondary text-xs">{label}</p>
      <p className="text-text-primary font-medium">
        {payload[0].value} business days
      </p>
    </div>
  );
}

export function TurnaroundTrendChart({ data }: { data: TurnaroundItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-text-muted">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="week"
          tick={{ fill: "#94A3B8", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#94A3B8", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          tickLine={false}
          label={{
            value: "Days",
            angle: -90,
            position: "insideLeft",
            style: { fill: "#64748B", fontSize: 11 },
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="avgDays"
          stroke="#10B981"
          strokeWidth={2}
          dot={{ fill: "#10B981", r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#34D399", strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
