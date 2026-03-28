/**
 * Notification Service
 *
 * Dispatches in-app and email notifications for PA lifecycle events.
 * In-app notifications are stored in the database. Email sending is
 * stubbed for now (logs to console) — plug in a transactional email
 * provider (e.g., Resend, SendGrid) in production.
 */

import { prisma } from "@/lib/prisma";
import { getEmailTemplate } from "./templates";

// ─── Notification Event Types ─────────────────────────────

export const NOTIFICATION_EVENTS = [
  "pa_submitted",
  "pa_approved",
  "pa_denied",
  "pa_pended",
  "appeal_filed",
  "appeal_decided",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Returns the list of subscribable notification event types
 * with human-readable labels.
 */
export function getNotificationEvents(): Array<{
  value: NotificationEventType;
  label: string;
}> {
  return [
    { value: "pa_submitted", label: "PA Submitted" },
    { value: "pa_approved", label: "PA Approved" },
    { value: "pa_denied", label: "PA Denied" },
    { value: "pa_pended", label: "PA Pended for Review" },
    { value: "appeal_filed", label: "Appeal Filed" },
    { value: "appeal_decided", label: "Appeal Decision" },
  ];
}

// ─── Dispatch Notification ────────────────────────────────

export interface DispatchNotificationParams {
  userId: string;
  organizationId: string;
  type: NotificationEventType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
  referenceNumber?: string;
  patientName?: string;
}

/**
 * Creates an in-app notification and optionally sends an email.
 * Checks user preferences before sending.
 *
 * Non-blocking — failures are logged but never throw.
 */
export async function dispatchNotification(
  params: DispatchNotificationParams
): Promise<void> {
  try {
    // Look up user preferences
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: params.userId },
    });

    // Default: both in-app and email enabled, subscribed to all events
    const inAppEnabled = prefs?.inAppEnabled ?? true;
    const emailEnabled = prefs?.emailEnabled ?? true;
    const subscribedEvents = prefs?.events ?? NOTIFICATION_EVENTS.map(String);

    // Check if user is subscribed to this event type
    if (!subscribedEvents.includes(params.type)) {
      return;
    }

    // Create in-app notification
    let emailSent = false;
    if (inAppEnabled) {
      // If email is also enabled, we'll mark it after attempting to send
      const notification = await prisma.notification.create({
        data: {
          userId: params.userId,
          organizationId: params.organizationId,
          type: params.type,
          title: params.title,
          message: params.message,
          resourceType: params.resourceType || null,
          resourceId: params.resourceId || null,
          read: false,
          emailSent: false,
        },
      });

      // Send email if enabled
      if (emailEnabled) {
        emailSent = await sendNotificationEmail(
          params.userId,
          params.type,
          {
            title: params.title,
            message: params.message,
            referenceNumber: params.referenceNumber,
            patientName: params.patientName,
            resourceType: params.resourceType,
            resourceId: params.resourceId,
          }
        );

        // Update the notification record with email status
        if (emailSent) {
          await prisma.notification.update({
            where: { id: notification.id },
            data: { emailSent: true },
          });
        }
      }
    } else if (emailEnabled && subscribedEvents.includes(params.type)) {
      // In-app disabled but email enabled — still send email
      await sendNotificationEmail(params.userId, params.type, {
        title: params.title,
        message: params.message,
        referenceNumber: params.referenceNumber,
        patientName: params.patientName,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      });
    }
  } catch (error) {
    // Notification failures must not break the calling operation
    console.error("[NOTIFICATION DISPATCH FAILURE]", error, params);
  }
}

// ─── Email Sending (Stub) ─────────────────────────────────

/**
 * Sends a notification email to the user. Currently logs to console.
 * Replace with a transactional email provider in production.
 *
 * @returns true if email was "sent" successfully
 */
async function sendNotificationEmail(
  userId: string,
  type: string,
  data: {
    title: string;
    message: string;
    referenceNumber?: string;
    patientName?: string;
    resourceType?: string;
    resourceId?: string;
  }
): Promise<boolean> {
  try {
    // Look up user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (!user?.email) {
      return false;
    }

    const template = getEmailTemplate(type, data);

    // Production: Replace with actual email sending (Resend, SendGrid, etc.)
    console.log(
      `[NOTIFICATION EMAIL] To: ${user.email} | Subject: ${template.subject}`
    );

    return true;
  } catch (error) {
    console.error("[NOTIFICATION EMAIL FAILURE]", error);
    return false;
  }
}
