"use client";

import { Card } from "@/components/ui/card";

export function SettingsSkeleton() {
  return (
    <Card variant="glass" padding="lg">
      <div className="animate-pulse space-y-6">
        <div className="h-5 w-48 bg-white/10 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-white/10 rounded" />
              <div className="h-10 bg-white/5 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
