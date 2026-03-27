import { Card } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Dashboard</h1>
        <p className="text-text-secondary mt-1">Overview of your prior authorization operations</p>
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
