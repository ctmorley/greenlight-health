import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";

const createTransportSchema = z.object({
  method: z.enum(["fhir_pas", "edi_278", "rpa_portal", "fax_manual", "simulated"]),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  endpointUrl: z.string().url().nullable().optional(),
  statusEndpointUrl: z.string().url().nullable().optional(),
  externalPayerId: z.string().nullable().optional(),
  clearinghousePayerId: z.string().nullable().optional(),
  credentialRef: z.string().nullable().optional(),
  supportsAttachments: z.boolean().default(false),
  supportsStatusCheck: z.boolean().default(false),
  requiresHumanReview: z.boolean().default(true),
  metadata: z.record(z.unknown()).nullable().optional(),
});

/**
 * GET /api/payers/[id]/transports
 * List transports for a payer. Returns org-specific + global transports.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { id } = await params;

  // Verify payer is visible to org
  const payer = await prisma.payer.findFirst({
    where: {
      id,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { id: true },
  });

  if (!payer) {
    return NextResponse.json({ error: "Payer not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const envFilter = url.searchParams.get("environment");

  const transports = await prisma.payerTransport.findMany({
    where: {
      payerId: id,
      OR: [{ organizationId }, { organizationId: null }],
      ...(envFilter ? { environment: envFilter as "sandbox" | "production" } : {}),
    },
    orderBy: [
      { environment: "asc" },
      { organizationId: { sort: "asc", nulls: "last" } },
      { priority: "asc" },
    ],
  });

  return NextResponse.json({ transports });
}

/**
 * POST /api/payers/[id]/transports
 * Create a new transport config. Always org-scoped (not global).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = createTransportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid transport data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify payer is visible to org
    const payer = await prisma.payer.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
      select: { id: true },
    });

    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    auditPhiAccess(request, session, "create", "PayerTransport", null, `Created ${parsed.data.method} transport for payer`).catch(() => {});

    const { metadata, ...rest } = parsed.data;
    const transport = await prisma.payerTransport.create({
      data: {
        payerId: id,
        organizationId,
        ...rest,
        metadata: metadata === null
          ? Prisma.JsonNull
          : metadata
            ? (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue)
            : undefined,
      },
    });

    return NextResponse.json({ transport }, { status: 201 });
  } catch (error) {
    // Handle COALESCE unique index violation
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A transport with this method and environment already exists for this payer" },
        { status: 409 }
      );
    }
    log.error("Create transport error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create transport" }, { status: 500 });
  }
}
