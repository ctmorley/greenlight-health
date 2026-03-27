import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const payers = await prisma.payer.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        payerId: true,
        type: true,
        phone: true,
        fax: true,
        portalUrl: true,
        electronicSubmission: true,
        avgResponseDays: true,
        rbmVendor: true,
        isActive: true,
        _count: { select: { rules: true } },
      },
    });

    return NextResponse.json({ payers });
  } catch (error) {
    console.error("Payers list error:", error);
    return NextResponse.json({ error: "Failed to fetch payers" }, { status: 500 });
  }
}
