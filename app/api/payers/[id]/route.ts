import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * GET /api/payers/[id]
 * Get payer details. Visible if payer belongs to org or is global.
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

  try {
    const { id } = await params;

    const payer = await prisma.payer.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
      include: {
        _count: { select: { rules: true } },
      },
    });

    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    auditPhiAccess(request, session, "view", "Payer", id, "Viewed payer detail").catch(() => {});

    return NextResponse.json({ payer });
  } catch (error) {
    console.error("Payer detail error:", error);
    return NextResponse.json({ error: "Failed to fetch payer" }, { status: 500 });
  }
}

// ─── PATCH: Update payer details ────────────────────────────

const updatePayerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().nullable().optional(),
  fax: z.string().trim().nullable().optional(),
  portalUrl: z.string().trim().nullable().optional(),
  electronicSubmission: z.boolean().optional(),
  avgResponseDays: z.number().int().min(0).optional(),
  rbmVendor: z.enum(["evicore", "carelon", "nia", "direct"]).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" }
);

/**
 * PATCH /api/payers/[id]
 * Update payer details (admin only).
 */
export async function PATCH(
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

  try {
    const { id } = await params;
    const body = await request.json();

    // Find payer accessible to this org
    const payer = await prisma.payer.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    const parsed = updatePayerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "No valid fields to update", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const allowedFields: Record<string, unknown> = {};
    const data = parsed.data;

    if (data.name !== undefined) allowedFields.name = data.name;
    if (data.phone !== undefined) allowedFields.phone = data.phone;
    if (data.fax !== undefined) allowedFields.fax = data.fax;
    if (data.portalUrl !== undefined) allowedFields.portalUrl = data.portalUrl;
    if (data.electronicSubmission !== undefined) allowedFields.electronicSubmission = data.electronicSubmission;
    if (data.avgResponseDays !== undefined) allowedFields.avgResponseDays = data.avgResponseDays;
    if (data.rbmVendor !== undefined) allowedFields.rbmVendor = data.rbmVendor;
    if (data.isActive !== undefined) allowedFields.isActive = data.isActive;

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    auditPhiAccess(request, session, "update", "Payer", id, "Updated payer").catch(() => {});

    const updated = await prisma.payer.update({
      where: { id },
      data: allowedFields,
      include: { _count: { select: { rules: true } } },
    });

    return NextResponse.json({ payer: updated });
  } catch (error) {
    console.error("Payer update error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update payer" }, { status: 500 });
  }
}

/**
 * DELETE /api/payers/[id]
 * Delete a payer (admin only). Only org-specific payers can be deleted.
 */
export async function DELETE(
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

  try {
    const { id } = await params;

    // Only allow deleting payers that belong to this org (not global payers)
    const payer = await prisma.payer.findFirst({
      where: { id, organizationId },
    });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    auditPhiAccess(request, session, "delete", "Payer", id, "Deleted payer").catch(() => {});

    await prisma.payer.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payer delete error:", error);
    return NextResponse.json({ error: "Failed to delete payer" }, { status: 500 });
  }
}
