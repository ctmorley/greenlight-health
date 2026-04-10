/**
 * Auth-related email sending (invite + password reset).
 *
 * Uses Resend. Gracefully falls back to console logging when
 * RESEND_API_KEY is not configured (dev/test).
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  _resend = new Resend(apiKey);
  return _resend;
}

const FROM =
  process.env.NOTIFICATION_FROM_EMAIL || "GreenLight Health <notifications@greenlighthealth.com>";

const APP_URL = () =>
  process.env.NEXT_PUBLIC_APP_URL || "https://app.greenlighthealth.com";

/**
 * Send an invite email with a link to set the initial password.
 */
export async function sendInviteEmail(
  email: string,
  firstName: string,
  token: string,
  organizationName: string,
): Promise<boolean> {
  const link = `${APP_URL()}/app/set-password?token=${encodeURIComponent(token)}`;

  const subject = `You've been invited to ${organizationName} on GreenLight`;
  const body = buildEmail({
    heading: "Welcome to GreenLight",
    message: `Hi ${firstName},<br><br>You've been invited to join <strong>${organizationName}</strong> on GreenLight Health. Click the button below to set your password and get started.`,
    buttonText: "Set Your Password",
    buttonUrl: link,
    footer: "This link expires in 24 hours. If you didn't expect this email, you can safely ignore it.",
  });

  return sendEmail(email, subject, body);
}

/**
 * Send a password-reset email.
 */
export async function sendResetEmail(
  email: string,
  firstName: string,
  token: string,
): Promise<boolean> {
  const link = `${APP_URL()}/app/set-password?token=${encodeURIComponent(token)}`;

  const subject = "Reset your GreenLight password";
  const body = buildEmail({
    heading: "Password Reset",
    message: `Hi ${firstName},<br><br>We received a request to reset your password. Click the button below to choose a new one.`,
    buttonText: "Reset Password",
    buttonUrl: link,
    footer: "This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.",
  });

  return sendEmail(email, subject, body);
}

// ─── Helpers ─────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.log(`[AUTH EMAIL] (no RESEND_API_KEY) To: ${to}, Subject: ${subject}`);
    return true; // Treat as success in dev
  }

  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error("[AUTH EMAIL] Failed to send:", err);
    return false;
  }
}

function buildEmail(opts: {
  heading: string;
  message: string;
  buttonText: string;
  buttonUrl: string;
  footer: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
      <h2 style="color: #111; margin-bottom: 16px;">${opts.heading}</h2>
      <p style="color: #333; line-height: 1.6; margin-bottom: 24px;">${opts.message}</p>
      <a href="${opts.buttonUrl}" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        ${opts.buttonText}
      </a>
      <p style="color: #888; font-size: 13px; margin-top: 32px;">${opts.footer}</p>
    </div>
  `;
}
