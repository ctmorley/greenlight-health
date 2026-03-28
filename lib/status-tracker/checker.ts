/**
 * PA Status Checker
 *
 * Checks the current status of a PA request with the payer,
 * records the result, and triggers notifications when status changes.
 *
 * Uses the simulator in development/staging. In production, this
 * would integrate with actual payer APIs or portal scraping.
 */

import { prisma } from "@/lib/prisma";
import { simulatePayerResponse } from "./simulator";
import { dispatchNotification } from "@/lib/notifications/service";
import type { AuthStatus } from "@prisma/client";

export interface StatusCheckResult {
  id: string;
  requestId: string;
  checkType: string;
  payerResponseCode: string | null;
  payerMessage: string | null;
  previousStatus: string;
  newStatus: string | null;
  statusChanged: boolean;
  responseTimeMs: number | null;
  createdAt: string;
}

/**
 * Checks the status of a PA request with the payer.
 *
 * 1. Fetches the current PA request
 * 2. Simulates a payer response
 * 3. Creates a PaStatusCheck record
 * 4. If status changed: updates PA request and dispatches notification
 *
 * @param requestId - The PA request ID
 * @param checkedById - The user who triggered the check
 * @param checkType - "manual" or "scheduled"
 * @returns The status check result
 */
export async function checkPaStatus(
  requestId: string,
  checkedById: string,
  checkType: string = "manual"
): Promise<StatusCheckResult> {
  // Fetch the PA request with related data
  const paRequest = await prisma.priorAuthRequest.findUnique({
    where: { id: requestId },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      payer: { select: { name: true } },
    },
  });

  if (!paRequest) {
    throw new Error("PA request not found");
  }

  // Look up best ACR rating for the CPT codes
  let acrRating: number | null = null;
  if (paRequest.cptCodes.length > 0) {
    const guideline = await prisma.clinicalGuideline.findFirst({
      where: { cptCodes: { hasSome: paRequest.cptCodes } },
      orderBy: { rating: "desc" },
      select: { rating: true },
    });
    acrRating = guideline?.rating ?? null;
  }

  // Simulate payer response
  const payerResponse = simulatePayerResponse({
    status: paRequest.status,
    submittedAt: paRequest.submittedAt,
    urgency: paRequest.urgency,
    cptCodes: paRequest.cptCodes,
    serviceCategory: paRequest.serviceCategory,
    acrRating,
  });

  const statusChanged =
    payerResponse.newStatus !== null &&
    payerResponse.newStatus !== paRequest.status;

  // Create status check record and optionally update PA in a transaction
  const [statusCheck] = await prisma.$transaction(async (tx) => {
    const check = await tx.paStatusCheck.create({
      data: {
        requestId,
        organizationId: paRequest.organizationId,
        checkedBy: checkedById,
        checkType,
        payerResponseCode: payerResponse.responseCode,
        payerMessage: payerResponse.message,
        previousStatus: paRequest.status,
        newStatus: statusChanged ? payerResponse.newStatus : null,
        statusChanged,
        responseTimeMs: payerResponse.responseTimeMs,
      },
    });

    // Update PA request if status changed
    if (statusChanged && payerResponse.newStatus) {
      const updateData: Record<string, unknown> = {
        status: payerResponse.newStatus as AuthStatus,
      };

      // Set decidedAt for terminal decisions
      if (
        ["approved", "denied"].includes(payerResponse.newStatus) &&
        !paRequest.decidedAt
      ) {
        updateData.decidedAt = new Date();
      }

      // Set expiresAt for approvals (90 days)
      if (payerResponse.newStatus === "approved" && !paRequest.expiresAt) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 90);
        updateData.expiresAt = expiry;
      }

      await tx.priorAuthRequest.update({
        where: { id: requestId },
        data: updateData,
      });

      // Create audit trail entry
      await tx.authStatusChange.create({
        data: {
          priorAuthId: requestId,
          changedById: checkedById,
          fromStatus: paRequest.status,
          toStatus: payerResponse.newStatus as AuthStatus,
          note: `Status updated via ${checkType} check: ${payerResponse.message}`,
        },
      });
    }

    return [check] as const;
  });

  // Dispatch notification for status changes (non-blocking)
  if (statusChanged && payerResponse.newStatus) {
    const notificationType = mapStatusToNotificationType(payerResponse.newStatus);
    if (notificationType) {
      const patientName = `${paRequest.patient.firstName} ${paRequest.patient.lastName}`;

      dispatchNotification({
        userId: paRequest.createdById,
        organizationId: paRequest.organizationId,
        type: notificationType,
        title: `PA ${payerResponse.newStatus.replace("_", " ").toUpperCase()} — ${paRequest.referenceNumber}`,
        message: payerResponse.message,
        resourceType: "PriorAuthRequest",
        resourceId: requestId,
        referenceNumber: paRequest.referenceNumber,
        patientName,
      }).catch((err) => {
        console.error("[STATUS CHECK NOTIFICATION FAILURE]", err);
      });
    }
  }

  return {
    id: statusCheck.id,
    requestId: statusCheck.requestId,
    checkType: statusCheck.checkType,
    payerResponseCode: statusCheck.payerResponseCode,
    payerMessage: statusCheck.payerMessage,
    previousStatus: statusCheck.previousStatus,
    newStatus: statusCheck.newStatus,
    statusChanged: statusCheck.statusChanged,
    responseTimeMs: statusCheck.responseTimeMs,
    createdAt: statusCheck.createdAt.toISOString(),
  };
}

/**
 * Maps a PA status to the corresponding notification event type.
 */
function mapStatusToNotificationType(
  status: string
): "pa_approved" | "pa_denied" | "pa_pended" | null {
  switch (status) {
    case "approved":
      return "pa_approved";
    case "denied":
      return "pa_denied";
    case "pending_review":
      return "pa_pended";
    default:
      return null;
  }
}
