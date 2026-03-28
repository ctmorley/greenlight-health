import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

/**
 * POST /api/fhir/session
 *
 * Records an EHR launch session. Called after successful SMART on FHIR
 * authentication to track which FHIR server was connected, update the
 * EhrConnection record, and log usage.
 */

const sessionSchema = z.object({
  fhirBaseUrl: z.string().url(),
  patientId: z.string().min(1),
  scopes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = sessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid session data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { fhirBaseUrl, scopes } = parsed.data;

    // Find or update the EHR connection record
    const connection = await prisma.ehrConnection.upsert({
      where: {
        organizationId_fhirBaseUrl: {
          organizationId,
          fhirBaseUrl,
        },
      },
      update: {
        lastUsedAt: new Date(),
        ...(scopes ? { scopes } : {}),
      },
      create: {
        organizationId,
        label: extractLabel(fhirBaseUrl),
        vendor: detectVendor(fhirBaseUrl),
        fhirBaseUrl,
        clientId: process.env.NEXT_PUBLIC_SMART_CLIENT_ID || "greenlight-health",
        scopes: scopes || null,
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({
      connectionId: connection.id,
      label: connection.label,
      vendor: connection.vendor,
      fhirBaseUrl: connection.fhirBaseUrl,
    });
  } catch (error) {
    console.error("FHIR session error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to record session" }, { status: 500 });
  }
}

/**
 * GET /api/fhir/session
 *
 * Returns the organization's EHR connections.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const connections = await prisma.ehrConnection.findMany({
      where: { organizationId, isActive: true },
      orderBy: { lastUsedAt: "desc" },
      select: {
        id: true,
        label: true,
        vendor: true,
        fhirBaseUrl: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("FHIR connections list error:", error);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function extractLabel(fhirBaseUrl: string): string {
  try {
    const hostname = new URL(fhirBaseUrl).hostname;
    // Strip common prefixes/suffixes
    return hostname
      .replace(/^(fhir|api|ehr)\./i, "")
      .replace(/\.(fhir|api)$/i, "")
      .split(".")[0]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Unknown EHR";
  }
}

type EhrVendor = "epic" | "oracle_health" | "meditech" | "athenahealth" | "veradigm" | "eclinicalworks" | "other";

function detectVendor(fhirBaseUrl: string): EhrVendor {
  const url = fhirBaseUrl.toLowerCase();
  if (url.includes("epic")) return "epic";
  if (url.includes("cerner") || url.includes("oracle")) return "oracle_health";
  if (url.includes("meditech")) return "meditech";
  if (url.includes("athena")) return "athenahealth";
  if (url.includes("veradigm") || url.includes("allscripts")) return "veradigm";
  if (url.includes("eclinical") || url.includes("ecw")) return "eclinicalworks";
  return "other";
}
