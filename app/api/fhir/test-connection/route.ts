import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { audit, extractRequestInfo } from "@/lib/security/audit-log";
import { z } from "zod";
import type { ConnectionTestResult } from "@/lib/fhir/vendors/types";
import { log } from "@/lib/logger";

/**
 * POST /api/fhir/test-connection
 *
 * Tests connectivity to a FHIR server by:
 * 1. Fetching /.well-known/smart-configuration
 * 2. Fetching /metadata (CapabilityStatement)
 * 3. Detecting vendor and FHIR version
 *
 * Returns a ConnectionTestResult with discovered capabilities.
 */

const testConnectionSchema = z.object({
  fhirBaseUrl: z.string().url(),
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
    const parsed = testConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { fhirBaseUrl } = parsed.data;
    const startTime = Date.now();

    // Normalize the base URL (strip trailing slash)
    const baseUrl = fhirBaseUrl.replace(/\/+$/, "");

    // Fetch SMART configuration and CapabilityStatement in parallel
    const [smartConfigResult, metadataResult] = await Promise.allSettled([
      fetchSmartConfig(baseUrl),
      fetchCapabilityStatement(baseUrl),
    ]);

    const responseTimeMs = Date.now() - startTime;

    const smartConfig =
      smartConfigResult.status === "fulfilled" ? smartConfigResult.value : null;
    const metadata =
      metadataResult.status === "fulfilled" ? metadataResult.value : null;

    // Determine success — at least one endpoint must respond
    const success = smartConfig !== null || metadata !== null;

    // Extract FHIR version from CapabilityStatement
    const fhirVersion = metadata?.fhirVersion || null;

    // Extract auth endpoints
    const authorizationEndpoint =
      smartConfig?.authorization_endpoint ||
      extractSecurityEndpoint(metadata, "authorize") ||
      null;

    const tokenEndpoint =
      smartConfig?.token_endpoint ||
      extractSecurityEndpoint(metadata, "token") ||
      null;

    // Extract supported scopes
    const supportedScopes: string[] =
      smartConfig?.scopes_supported || [];

    // Detect vendor from metadata or URL
    const vendor = detectVendorFromMetadata(metadata, baseUrl);

    const result: ConnectionTestResult = {
      success,
      fhirVersion,
      smartConfigFound: smartConfig !== null,
      authorizationEndpoint,
      tokenEndpoint,
      supportedScopes,
      vendor,
      responseTimeMs,
      error: success
        ? null
        : "Could not connect to the FHIR server. Verify the URL and that the server is accessible.",
    };

    // Audit log the connection test (non-PHI, but important for security tracking)
    const { ipAddress, userAgent, requestPath } = extractRequestInfo(request);
    await audit({
      organizationId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: "fhir_read",
      resourceType: "EhrConnection",
      description: `FHIR connection test to ${baseUrl} — ${success ? "success" : "failed"}`,
      ipAddress,
      userAgent,
      requestPath,
      metadata: {
        fhirBaseUrl: baseUrl,
        success,
        fhirVersion,
        smartConfigFound: smartConfig !== null,
        vendor,
        responseTimeMs,
      },
      phiAccessed: false,
    });

    return NextResponse.json(result);
  } catch (error) {
    log.error("FHIR connection test error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to test connection" }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────

interface SmartConfig {
  authorization_endpoint?: string;
  token_endpoint?: string;
  scopes_supported?: string[];
  capabilities?: string[];
  [key: string]: unknown;
}

interface CapabilityStatement {
  resourceType?: string;
  fhirVersion?: string;
  software?: { name?: string; version?: string };
  implementation?: { description?: string; url?: string };
  rest?: Array<{
    security?: {
      extension?: Array<{
        url?: string;
        extension?: Array<{ url?: string; valueUri?: string }>;
      }>;
    };
  }>;
  [key: string]: unknown;
}

async function fetchSmartConfig(baseUrl: string): Promise<SmartConfig | null> {
  try {
    const response = await fetch(`${baseUrl}/.well-known/smart-configuration`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    return (await response.json()) as SmartConfig;
  } catch {
    return null;
  }
}

async function fetchCapabilityStatement(
  baseUrl: string
): Promise<CapabilityStatement | null> {
  try {
    const response = await fetch(`${baseUrl}/metadata`, {
      headers: { Accept: "application/fhir+json,application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as CapabilityStatement;

    // Validate it's actually a CapabilityStatement
    if (data.resourceType !== "CapabilityStatement") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Extracts the authorize or token endpoint from the CapabilityStatement
 * security extension (SMART on FHIR extension in rest[0].security).
 */
function extractSecurityEndpoint(
  metadata: CapabilityStatement | null,
  type: "authorize" | "token"
): string | null {
  if (!metadata?.rest?.[0]?.security?.extension) return null;

  const smartExtension = metadata.rest[0].security.extension.find(
    (ext) =>
      ext.url ===
      "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris"
  );

  if (!smartExtension?.extension) return null;

  const endpoint = smartExtension.extension.find((ext) => ext.url === type);
  return endpoint?.valueUri || null;
}

/**
 * Detects the EHR vendor from the CapabilityStatement metadata or URL.
 */
function detectVendorFromMetadata(
  metadata: CapabilityStatement | null,
  baseUrl: string
): string | null {
  // Check software name in CapabilityStatement
  const softwareName = metadata?.software?.name?.toLowerCase() || "";
  const implDescription = metadata?.implementation?.description?.toLowerCase() || "";
  const combined = `${softwareName} ${implDescription}`;

  if (combined.includes("epic")) return "epic";
  if (combined.includes("cerner") || combined.includes("millennium") || combined.includes("oracle"))
    return "oracle_health";
  if (combined.includes("meditech")) return "meditech";
  if (combined.includes("athena")) return "athenahealth";
  if (combined.includes("veradigm") || combined.includes("allscripts")) return "veradigm";
  if (combined.includes("eclinical") || combined.includes("ecw")) return "eclinicalworks";

  // Fallback to URL-based detection
  const url = baseUrl.toLowerCase();
  if (url.includes("epic")) return "epic";
  if (url.includes("cerner") || url.includes("oracle")) return "oracle_health";
  if (url.includes("meditech")) return "meditech";
  if (url.includes("athena")) return "athenahealth";
  if (url.includes("veradigm") || url.includes("allscripts")) return "veradigm";
  if (url.includes("eclinical") || url.includes("ecw")) return "eclinicalworks";

  return null;
}
