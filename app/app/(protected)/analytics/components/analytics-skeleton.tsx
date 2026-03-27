"use client";

import { Card } from "@/components/ui/card";

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">Analytics</h1>
          <p className="text-text-secondary mt-1">Reporting and performance insights</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="animate-pulse h-9 w-36 bg-white/10 rounded-lg" />
          <div className="animate-pulse h-9 w-36 bg-white/10 rounded-lg" />
          <div className="animate-pulse h-9 w-28 bg-white/10 rounded-lg" />
        </div>
      </div>

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

      {Array.from({ length: 3 }).map((_, row) => (
        <div key={row} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} variant="glass" padding="md">
              <div className="animate-pulse">
                <div className="h-4 w-40 bg-white/10 rounded mb-4" />
                <div className="h-64 bg-white/5 rounded-xl" />
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
