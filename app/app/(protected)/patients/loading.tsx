import { Card } from "@/components/ui/card";

export default function PatientsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Patients</h1>
        <p className="text-text-secondary mt-1">Patient directory</p>
      </div>

      <Card variant="glass" padding="md">
        <div className="animate-pulse h-10 bg-white/5 rounded-lg" />
      </Card>

      <Card variant="glass" padding="none">
        <div className="p-6 space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4">
              <div className="h-4 w-32 bg-white/10 rounded" />
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-4 w-20 bg-white/10 rounded" />
              <div className="h-4 w-28 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
