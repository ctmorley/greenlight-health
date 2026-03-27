"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExclamationIcon } from "./icons";
import { denialCategoryLabels, formatDate } from "./helpers";
import type { DenialEntry } from "./types";

interface DenialsCardProps {
  denials: DenialEntry[];
  requestId?: string;
  requestStatus?: string;
  canFileAppeal?: boolean;
}

export function DenialsCard({ denials, requestId, requestStatus, canFileAppeal }: DenialsCardProps) {
  if (denials.length === 0) return null;

  return (
    <Card variant="glass" padding="md" className="border-red-500/20">
      <div className="flex items-center justify-between mb-4">
        <CardTitle>
          <span className="flex items-center gap-2">
            <ExclamationIcon />
            Denial Information
          </span>
        </CardTitle>
        {canFileAppeal && requestId && requestStatus === "denied" && (
          <Link href={`/app/requests/${requestId}/appeal`}>
            <Button variant="primary" size="sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              File Appeal
            </Button>
          </Link>
        )}
      </div>
      <div className="space-y-4">
        {denials.map((denial) => (
          <div
            key={denial.id}
            className="p-4 rounded-xl bg-red-500/5 border border-red-500/10"
          >
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="danger" size="md">
                {denialCategoryLabels[denial.reasonCategory] || denial.reasonCategory}
              </Badge>
              <span className="text-xs text-text-muted">{formatDate(denial.denialDate)}</span>
            </div>
            {denial.reasonCode && (
              <p className="text-xs text-text-muted mb-1">
                Code: <span className="font-mono text-text-secondary">{denial.reasonCode}</span>
              </p>
            )}
            {denial.reasonDescription && (
              <p className="text-sm text-text-secondary">{denial.reasonDescription}</p>
            )}
            {denial.payerNotes && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-xs text-text-muted">Payer Notes</p>
                <p className="text-sm text-text-secondary italic">{denial.payerNotes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
