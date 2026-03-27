import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * PATCH /api/payers/[id]
 * Update payer details (admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const payer = await prisma.payer.findUnique({ where: { id } });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    const allowedFields: Record<string, unknown> = {};
    if (body.name !== undefined) allowedFields.name = String(body.name).trim();
    if (body.phone !== undefined) allowedFields.phone = body.phone ? String(body.phone).trim() : null;
    if (body.fax !== undefined) allowedFields.fax = body.fax ? String(body.fax).trim() : null;
    if (body.portalUrl !== undefined) allowedFields.portalUrl = body.portalUrl ? String(body.portalUrl).trim() : null;
    if (body.electronicSubmission !== undefined) allowedFields.electronicSubmission = Boolean(body.electronicSubmission);
    if (body.avgResponseDays !== undefined) allowedFields.avgResponseDays = Number(body.avgResponseDays) || payer.avgResponseDays;
    if (body.rbmVendor !== undefined) {
      const validVendors = ["evicore", "carelon", "nia", "direct", null];
      allowedFields.rbmVendor = validVendors.includes(body.rbmVendor) ? body.rbmVendor : payer.rbmVendor;
    }
    if (body.isActive !== undefined) allowedFields.isActive = Boolean(body.isActive);

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.payer.update({
      where: { id },
      data: allowedFields,
      include: { _count: { select: { rules: true } } },
    });

    return NextResponse.json({ payer: updated });
  } catch (error) {
    console.error("Payer update error:", error);
    return NextResponse.json({ error: "Failed to update payer" }, { status: 500 });
  }
}
