import type { CdsCard, CdsLink } from "./types";

const GREENLIGHT_SOURCE = {
  label: "GreenLight PA Intelligence",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://greenlight-health.vercel.app",
};

interface PaCheckResult {
  requiresPA: boolean;
  riskLevel: "low" | "medium" | "high" | "unknown";
  acrRating: number | null;
  acrMessage: string | null;
  payerName: string | null;
  rbmVendor: string | null;
  avgResponseDays: number | null;
  documentationNeeded: string[];
  denialWarnings: string[];
  topRecommendation: string | null;
}

/**
 * Builds CDS Cards from a PA check result.
 * Returns 1-3 cards depending on the complexity of the situation.
 */
export function buildPaCards(
  result: PaCheckResult,
  appLaunchUrl: string,
  organizationId?: string | null,
): CdsCard[] {
  const cards: CdsCard[] = [];
  const appContext = organizationId
    ? `new-pa-request&org=${organizationId}`
    : "new-pa-request";
  const launchLink: CdsLink = {
    label: "Open GreenLight",
    url: appLaunchUrl,
    type: "smart",
    appContext,
  };

  // ── Card 1: PA Requirement ──
  if (result.requiresPA) {
    cards.push({
      summary: `Prior Authorization Required${result.payerName ? ` — ${result.payerName}` : ""}`,
      detail: buildPaDetailMarkdown(result),
      indicator: result.riskLevel === "high" ? "critical" : "warning",
      source: GREENLIGHT_SOURCE,
      suggestions: [
        {
          label: "Start PA Request in GreenLight",
          isRecommended: true,
        },
      ],
      links: [launchLink],
      overrideReasons: [
        { display: "PA already obtained", code: "already-obtained" },
        { display: "Emergency/urgent situation", code: "emergency" },
        { display: "Peer-to-peer review scheduled", code: "peer-review" },
      ],
    });
  } else {
    cards.push({
      summary: `No Prior Authorization Required${result.payerName ? ` — ${result.payerName}` : ""}`,
      detail: "Based on current payer rules, this service does not require prior authorization. Proceed with scheduling.",
      indicator: "info",
      source: GREENLIGHT_SOURCE,
    });
  }

  // ── Card 2: ACR Appropriateness (if we have data) ──
  if (result.acrRating !== null) {
    const acrIndicator = result.riskLevel === "high" ? "critical"
      : result.riskLevel === "medium" ? "warning"
      : "info";

    cards.push({
      summary: `ACR Appropriateness: ${result.acrRating}/9 — ${ratingLabel(result.acrRating)}`,
      detail: result.acrMessage || undefined,
      indicator: acrIndicator,
      source: {
        ...GREENLIGHT_SOURCE,
        topic: {
          system: "https://acsearch.acr.org",
          code: "appropriateness-criteria",
          display: "ACR Appropriateness Criteria",
        },
      },
      ...(result.topRecommendation
        ? {
            suggestions: [
              {
                label: result.topRecommendation,
                isRecommended: result.acrRating >= 7,
              },
            ],
          }
        : {}),
    });
  }

  // ── Card 3: Documentation Requirements (if PA required and docs needed) ──
  if (result.requiresPA && result.documentationNeeded.length > 0) {
    const docList = result.documentationNeeded
      .map((d) => `- ${d}`)
      .join("\n");

    cards.push({
      summary: `Documentation Required (${result.documentationNeeded.length} items)`,
      detail: `The following documentation is required for this prior authorization:\n\n${docList}${
        result.denialWarnings.length > 0
          ? `\n\n**Denial Risk Warnings:**\n${result.denialWarnings.map((w) => `- ${w}`).join("\n")}`
          : ""
      }`,
      indicator: "warning",
      source: GREENLIGHT_SOURCE,
      links: [launchLink],
    });
  }

  return cards;
}

function buildPaDetailMarkdown(result: PaCheckResult): string {
  const lines: string[] = [];

  if (result.payerName) {
    lines.push(`**Payer:** ${result.payerName}`);
  }
  if (result.rbmVendor) {
    lines.push(`**RBM Routing:** ${result.rbmVendor.toUpperCase()}`);
  }
  if (result.avgResponseDays) {
    lines.push(`**Average Response:** ${result.avgResponseDays} business days`);
  }
  if (result.acrRating !== null) {
    lines.push(`**ACR Rating:** ${result.acrRating}/9 (${ratingLabel(result.acrRating)})`);
  }

  lines.push("");
  lines.push("Submit through GreenLight for automated clinical criteria matching and pre-submission audit.");

  return lines.join("\n");
}

function ratingLabel(rating: number): string {
  if (rating >= 7) return "Usually Appropriate";
  if (rating >= 4) return "May Be Appropriate";
  return "Usually Not Appropriate";
}
