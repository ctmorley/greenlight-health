import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { log } from "@/lib/logger";

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
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ organization: org });
  } catch (error) {
    log.error("Get organization error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  // Only admins can edit org settings
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can edit organization settings" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, address, phone, fax, email, npi, taxId } = body;

    if (name !== undefined && (!name || typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (fax !== undefined) updateData.fax = fax || null;
    if (email !== undefined) updateData.email = email || null;
    if (npi !== undefined) updateData.npi = npi || null;
    if (taxId !== undefined) updateData.taxId = taxId || null;

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });

    return NextResponse.json({ organization: org });
  } catch (error) {
    log.error("Update organization error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
  }
}
