import { Card } from "@/components/ui/card";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Organization and system configuration</p>
      </div>

      {/* Tab skeleton */}
      <div className="flex gap-4 border-b border-white/10 pb-px">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse h-10 w-28 bg-white/10 rounded-lg" />
        ))}
      </div>

      {/* Content skeleton */}
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
    </div>
  );
}
