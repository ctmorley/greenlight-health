"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatientIcon } from "./icons";
import { formatDate } from "./helpers";
import type { RequestDetail } from "./types";

interface PatientInfoCardProps {
  patient: RequestDetail["patient"];
  insurance: RequestDetail["insurance"];
  payerName: string | undefined;
}

export function PatientInfoCard({ patient, insurance, payerName }: PatientInfoCardProps) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">
        <span className="flex items-center gap-2">
          <PatientIcon />
          Patient Information
        </span>
      </CardTitle>
      <div className="space-y-2">
        <p className="text-sm text-text-primary font-medium">{patient.name}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-text-muted">MRN</p>
            <p className="text-sm text-text-secondary font-mono">{patient.mrn}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">DOB</p>
            <p className="text-sm text-text-secondary">{formatDate(patient.dob)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Gender</p>
            <p className="text-sm text-text-secondary capitalize">{patient.gender}</p>
          </div>
          {patient.phone && (
            <div>
              <p className="text-xs text-text-muted">Phone</p>
              <p className="text-sm text-text-secondary">{patient.phone}</p>
            </div>
          )}
        </div>
        {patient.email && (
          <p className="text-xs text-text-muted">
            Email: <span className="text-text-secondary">{patient.email}</span>
          </p>
        )}

        {insurance && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-text-muted font-medium mb-2">Insurance</p>
            <p className="text-sm text-text-secondary">
              {payerName || "Unknown"} — {insurance.planName}
            </p>
            <p className="text-xs text-text-muted mt-1">
              <Badge variant="outline" size="sm">
                {insurance.planType.toUpperCase()}
              </Badge>
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-xs text-text-muted">Member ID</p>
                <p className="text-sm text-text-secondary font-mono">{insurance.memberId}</p>
              </div>
              {insurance.groupNumber && (
                <div>
                  <p className="text-xs text-text-muted">Group Number</p>
                  <p className="text-sm text-text-secondary font-mono">{insurance.groupNumber}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
