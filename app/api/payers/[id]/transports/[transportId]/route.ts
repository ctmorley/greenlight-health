import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const updateTransportSchema = z.object({
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
  endpointUrl: z.string().url().nullable().optional(),
  statusEndpointUrl: z.string().url().nullable().optional(),
  externalPayerId: z.string().nullable().optional(),
  clearinghousePayerId: z.string().nullable().optional(),
  credentialRef: z.string().nullable().optional(),
  supportsAttachments: z.boolean().optional(),
  supportsStatusCheck: z.boolean().optional(),
  requiresHumanReview: z.boolean().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

type RouteParams = { params: Promise<{ id: string; transportId: string }> };

/**
 * Verify payer + transport belong to org and transport belongs to payer.
 */
async function resolveTransportForRoute(
  payerId: string,
  transportId: string,
  organizationId: string
) {
  const payer = await prisma.payer.findFirst({
    where: {
      id: payerId,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { id: true },
  });

  if (!payer) return { error: "Payer not found", status: 404 as const };

  const transport = await prisma.payerTransport.findFirst({
    where: {
      id: transportId,
      payerId,
      OR: [{ organizationId }, { organizationId: null }],
    },
  });

  if (!transport) return { error: "Transport not found", status: 404 as const };

  return { transport };
}

/**
 * GET /api/payers/[id]/transports/[transportId]
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
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

  const { id, transportId } = await params;
  const resolved = await resolveTransportForRoute(id, transportId, organizationId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  return NextResponse.json({ transport: resolved.transport });
}

/**
 * PATCH /api/payers/[id]/transports/[transportId]
 * Cannot modify global transports or change method/environment.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
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

  const { id, transportId } = await params;

  try {
    const resolved = await resolveTransportForRoute(id, transportId, organizationId);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    // Global transports are immutable
    if (!resolved.transport.organizationId) {
      return NextResponse.json(
        { error: "Global transports cannot be modified. Create an org-specific override instead." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateTransportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid transport data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    auditPhiAccess(request, session, "update", "PayerTransport", transportId, "Updated transport config").catch(() => {});

    const { metadata, ...rest } = parsed.data;
    const updated = await prisma.payerTransport.update({
      where: { id: transportId },
      data: {
        ...rest,
        ...(metadata !== undefined
          ? {
              metadata: metadata === null
                ? Prisma.JsonNull
                : (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue),
            }
          : {}),
      },
    });

    return NextResponse.json({ transport: updated });
  } catch (error) {
    console.error("Update transport error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update transport" }, { status: 500 });
  }
}

/**
 * DELETE /api/payers/[id]/transports/[transportId]
 * Cannot delete global transports.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
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

  const { id, transportId } = await params;

  const resolved = await resolveTransportForRoute(id, transportId, organizationId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // Global transports are immutable
  if (!resolved.transport.organizationId) {
    return NextResponse.json(
      { error: "Global transports cannot be deleted. Disable it or create an org-specific override." },
      { status: 403 }
    );
  }

  auditPhiAccess(request, session, "delete", "PayerTransport", transportId, "Deleted transport config").catch(() => {});

  await prisma.payerTransport.delete({ where: { id: transportId } });

  return NextResponse.json({ success: true });
}
