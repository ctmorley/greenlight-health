import { Card } from "@/components/ui/card";

export default function RequestsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">PA Requests</h1>
          <p className="text-text-secondary mt-1">Manage prior authorization requests</p>
        </div>
        <div className="animate-pulse h-10 w-36 bg-white/10 rounded-lg" />
      </div>

      <Card variant="glass" padding="md">
        <div className="animate-pulse flex flex-col sm:flex-row gap-3">
          <div className="flex-1 h-10 bg-white/5 rounded-lg" />
          <div className="h-10 w-24 bg-white/5 rounded-lg" />
        </div>
      </Card>

      <Card variant="glass" padding="none">
        <div className="p-6 space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4">
              <div className="h-4 w-28 bg-white/10 rounded" />
              <div className="h-4 w-32 bg-white/10 rounded" />
              <div className="h-4 w-20 bg-white/10 rounded" />
              <div className="h-5 w-24 bg-white/10 rounded-full" />
              <div className="h-4 w-20 bg-white/10 rounded" />
              <div className="h-5 w-20 bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
