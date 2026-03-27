"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Something went wrong</h1>
        <p className="text-text-secondary mt-1">
          An unexpected error occurred while loading this page.
        </p>
      </div>

      <Card variant="glass" padding="lg">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary text-center max-w-md mb-2">
            {error.message || "We encountered an unexpected error. Please try again."}
          </p>
          {error.digest && (
            <p className="text-xs text-text-muted mb-6 font-mono">Error ID: {error.digest}</p>
          )}
          <Button variant="primary" onClick={reset}>
            Try Again
          </Button>
        </div>
      </Card>
    </div>
  );
}
