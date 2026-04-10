import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { log } from "@/lib/logger";

/**
 * GET /api/users/physicians
 * List physicians in the current organization (for ordering physician dropdown).
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
    const physicians = await prisma.user.findMany({
      where: {
        organizationId,
        role: "physician",
        isActive: true,
      },
      orderBy: { lastName: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npiNumber: true,
      },
    });

    return NextResponse.json({
      physicians: physicians.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        npiNumber: p.npiNumber,
      })),
    });
  } catch (error) {
    log.error("Physicians list error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch physicians" }, { status: 500 });
  }
}
