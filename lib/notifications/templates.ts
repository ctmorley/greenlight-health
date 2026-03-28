/**
 * Notification Email Templates
 *
 * HTML email body templates for each notification event type.
 * Templates are intentionally simple and inline-styled for
 * maximum email client compatibility.
 */

export interface EmailTemplate {
  subject: string;
  body: string;
}

/**
 * Returns an email template for the given notification type.
 */
export function getEmailTemplate(
  type: string,
  data: {
    title: string;
    message: string;
    referenceNumber?: string;
    patientName?: string;
    resourceType?: string;
    resourceId?: string;
  }
): EmailTemplate {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.greenlighthealth.com";

  const detailLink =
    data.resourceType === "PriorAuthRequest" && data.resourceId
      ? `${appUrl}/app/requests/${data.resourceId}`
      : `${appUrl}/app/dashboard`;

  switch (type) {
    case "pa_approved":
      return {
        subject: `PA Approved — ${data.referenceNumber || "Prior Authorization"}`,
        body: buildEmailBody({
          heading: "Prior Authorization Approved",
          statusColor: "#16a34a",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };

    case "pa_denied":
      return {
        subject: `PA Denied — ${data.referenceNumber || "Prior Authorization"}`,
        body: buildEmailBody({
          heading: "Prior Authorization Denied",
          statusColor: "#dc2626",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };

    case "pa_pended":
      return {
        subject: `PA Pended — ${data.referenceNumber || "Prior Authorization"}`,
        body: buildEmailBody({
          heading: "Prior Authorization Pended for Review",
          statusColor: "#d97706",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };

    case "pa_submitted":
      return {
        subject: `PA Submitted — ${data.referenceNumber || "Prior Authorization"}`,
        body: buildEmailBody({
          heading: "Prior Authorization Submitted",
          statusColor: "#2563eb",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };

    case "appeal_filed":
      return {
        subject: `Appeal Filed — ${data.referenceNumber || "Prior Authorization"}`,
        body: buildEmailBody({
          heading: "Appeal Filed",
          statusColor: "#7c3aed",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };

    case "appeal_decided":
      return {
        subject: `Appeal Decision — ${data.referenceNumber || "Prior Authorization"}`,
        body: buildEmailBody({
          heading: "Appeal Decision Received",
          statusColor: "#7c3aed",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };

    default:
      return {
        subject: data.title,
        body: buildEmailBody({
          heading: data.title,
          statusColor: "#6b7280",
          message: data.message,
          detailLink,
          patientName: data.patientName,
          referenceNumber: data.referenceNumber,
        }),
      };
  }
}

function buildEmailBody(params: {
  heading: string;
  statusColor: string;
  message: string;
  detailLink: string;
  patientName?: string;
  referenceNumber?: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:${params.statusColor};padding:20px 24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;">${params.heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              ${params.referenceNumber ? `<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Reference: ${params.referenceNumber}</p>` : ""}
              ${params.patientName ? `<p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Patient: ${params.patientName}</p>` : ""}
              <p style="margin:0 0 24px;color:#1f2937;font-size:15px;line-height:1.6;">${params.message}</p>
              <a href="${params.detailLink}" style="display:inline-block;background:${params.statusColor};color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">View Details</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">GreenLight Health - Prior Authorization Management</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
