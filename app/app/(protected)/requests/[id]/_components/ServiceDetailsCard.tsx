"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { ServiceIcon } from "./icons";
import { serviceTypeLabels } from "./helpers";
import type { RequestDetail } from "./types";

interface ServiceDetailsCardProps {
  request: RequestDetail;
}

export function ServiceDetailsCard({ request }: ServiceDetailsCardProps) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">
        <span className="flex items-center gap-2">
          <ServiceIcon />
          Service Details
        </span>
      </CardTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-4 mb-4">
        <div>
          <p className="text-xs text-text-muted">Category</p>
          <p className="text-sm text-text-primary capitalize">{request.serviceCategory || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Type</p>
          <p className="text-sm text-text-primary">
            {request.serviceType ? serviceTypeLabels[request.serviceType] || request.serviceType : "—"}
          </p>
        </div>
        {request.facilityName && (
          <div>
            <p className="text-xs text-text-muted">Facility</p>
            <p className="text-sm text-text-primary">{request.facilityName}</p>
          </div>
        )}
        {request.renderingPhysicianNpi && (
          <div>
            <p className="text-xs text-text-muted">Rendering NPI</p>
            <p className="text-sm text-text-primary font-mono">{request.renderingPhysicianNpi}</p>
          </div>
        )}
      </div>

      {/* Approved info */}
      {request.approvedUnits != null && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-400 font-medium mb-1">Approved</p>
          <p className="text-sm text-emerald-300">
            {request.approvedUnits} unit{request.approvedUnits !== 1 ? "s" : ""} approved
            {request.approvedCptCodes && request.approvedCptCodes.length > 0 && (
              <span> for CPT: {request.approvedCptCodes.join(", ")}</span>
            )}
          </p>
        </div>
      )}

      {/* CPT Codes */}
      {request.cptCodes.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-text-muted mb-2">CPT Codes</p>
          <div className="flex flex-wrap gap-2">
            {request.cptCodes.map((code) => (
              <span
                key={code}
                className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-mono font-medium border border-emerald-500/20"
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ICD-10 Codes */}
      {request.icd10Codes.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-text-muted mb-2">ICD-10 Codes</p>
          <div className="flex flex-wrap gap-2">
            {request.icd10Codes.map((code) => (
              <span
                key={code}
                className="px-3 py-1 rounded-lg bg-sky-500/10 text-sky-400 text-xs font-mono font-medium border border-sky-500/20"
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Procedure Description */}
      {request.procedureDescription && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <p className="text-xs text-text-muted mb-1">Procedure Description</p>
          <p className="text-sm text-text-secondary">{request.procedureDescription}</p>
        </div>
      )}

      {/* Clinical Notes */}
      {request.clinicalNotes && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-xs text-text-muted mb-1">Clinical Notes</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{request.clinicalNotes}</p>
        </div>
      )}
    </Card>
  );
}
