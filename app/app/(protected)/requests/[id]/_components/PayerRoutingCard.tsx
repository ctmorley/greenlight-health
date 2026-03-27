"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PayerIcon } from "./icons";
import { formatDate } from "./helpers";
import type { RequestDetail } from "./types";

interface PayerRoutingCardProps {
  request: RequestDetail;
}

export function PayerRoutingCard({ request }: PayerRoutingCardProps) {
  return (
    <Card variant="glass" padding="md">
      <CardTitle className="mb-4">
        <span className="flex items-center gap-2">
          <PayerIcon />
          Payer &amp; Routing
        </span>
      </CardTitle>
      <div className="space-y-3">
        {request.payer ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-text-muted">Payer</p>
                <p className="text-sm text-text-primary font-medium">{request.payer.name}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Payer ID</p>
                <p className="text-sm text-text-secondary font-mono">{request.payer.payerId}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Payer Type</p>
                <p className="text-sm text-text-secondary capitalize">{request.payer.type}</p>
              </div>
              {request.payer.rbmVendor && (
                <div>
                  <p className="text-xs text-text-muted">RBM Vendor</p>
                  <Badge variant="info" size="md">{request.payer.rbmVendor.toUpperCase()}</Badge>
                </div>
              )}
            </div>
            {request.rbmReferenceNumber && (
              <div>
                <p className="text-xs text-text-muted">RBM Reference</p>
                <p className="text-sm text-text-secondary font-mono">{request.rbmReferenceNumber}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-text-muted">No payer assigned</p>
        )}

        {/* Dates subsection */}
        <div className="pt-3 border-t border-white/5">
          <p className="text-xs text-text-muted font-medium mb-2">Key Dates</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-text-muted">Created</p>
              <p className="text-sm text-text-primary">{formatDate(request.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Due Date</p>
              <p className="text-sm text-text-primary">{formatDate(request.dueDate)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Submitted</p>
              <p className="text-sm text-text-primary">{formatDate(request.submittedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Decided</p>
              <p className="text-sm text-text-primary">{formatDate(request.decidedAt)}</p>
            </div>
            {request.scheduledDate && (
              <div>
                <p className="text-xs text-text-muted">Scheduled</p>
                <p className="text-sm text-text-primary">{formatDate(request.scheduledDate)}</p>
              </div>
            )}
            {request.expiresAt && (
              <div>
                <p className="text-xs text-text-muted">Expires</p>
                <p className="text-sm text-text-primary">{formatDate(request.expiresAt)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Staff */}
        <div className="pt-3 border-t border-white/5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-text-muted">Created By</p>
              <p className="text-sm text-text-primary">{request.createdBy}</p>
            </div>
            {request.assignedTo && (
              <div>
                <p className="text-xs text-text-muted">Assigned To</p>
                <p className="text-sm text-text-primary">{request.assignedTo}</p>
              </div>
            )}
            {request.orderingPhysician && (
              <div>
                <p className="text-xs text-text-muted">Ordering Physician</p>
                <p className="text-sm text-text-primary">
                  {request.orderingPhysician.name}
                  {request.orderingPhysician.npi && (
                    <span className="text-text-muted text-xs ml-1">(NPI: {request.orderingPhysician.npi})</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
