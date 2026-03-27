"use client";

import { Card } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
}

export function MetricCard({ label, value, color, icon }: MetricCardProps) {
  return (
    <Card variant="glass" padding="md" className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
        </div>
        <span className="text-2xl opacity-50">{icon}</span>
      </div>
    </Card>
  );
}
