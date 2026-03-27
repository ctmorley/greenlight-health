import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createAppealSchema = z.object({
  denialId: z.string().min(1).optional(),
  appealLevel: z.enum(["first", "second", "external_review"]),
  appealReason: z.string().min(10, "Appeal reason must be at least 10 characters"),
});

/**
 * POST /api/requests/[id]/appeal
 * File an appeal for a denied PA request.
 * Transitions the PA status from 'denied' to 'appealed'.
 *
 * `denialId` is optional — if omitted, defaults to the most recent denial for the request.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  // Only admin and pa_coordinator can file appeals
  if (!["admin", "pa_coordinator"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions. Only admins and PA coordinators can file appeals." },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = createAppealSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { denialId: providedDenialId, appealLevel, appealReason } = parsed.data;

    // Verify the PA request exists and belongs to this org
    const existing = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Must be in 'denied' status to file an appeal
    if (existing.status !== "denied") {
      return NextResponse.json(
        { error: `Cannot file an appeal for a request with status '${existing.status}'. Only denied requests can be appealed.` },
        { status: 422 }
      );
    }

    // Resolve denialId: use provided or default to most recent denial for this request
    let denialId = providedDenialId;
    if (!denialId) {
      const latestDenial = await prisma.denial.findFirst({
        where: { priorAuthId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!latestDenial) {
        return NextResponse.json({ error: "No denial found for this request" }, { status: 404 });
      }
      denialId = latestDenial.id;
    } else {
      // Verify the provided denial belongs to this PA request
      const denial = await prisma.denial.findFirst({
        where: { id: denialId, priorAuthId: id },
      });
      if (!denial) {
        return NextResponse.json({ error: "Denial not found for this request" }, { status: 404 });
      }
    }

    // Check if there's already an active appeal for this denial
    const existingAppeal = await prisma.appeal.findFirst({
      where: {
        denialId,
        status: { in: ["draft", "filed", "in_review"] },
      },
    });

    if (existingAppeal) {
      return NextResponse.json(
        { error: "An active appeal already exists for this denial" },
        { status: 409 }
      );
    }

    // Execute in transaction: create appeal + update PA status + create audit log
    const [appeal] = await prisma.$transaction(async (tx) => {
      const newAppeal = await tx.appeal.create({
        data: {
          priorAuthId: id,
          denialId,
          appealLevel,
          filedDate: new Date(),
          filedById: session.user.id,
          appealReason,
          status: "filed",
        },
        include: {
          filedBy: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.priorAuthRequest.update({
        where: { id },
        data: { status: "appealed" },
      });

      await tx.authStatusChange.create({
        data: {
          priorAuthId: id,
          changedById: session.user.id,
          fromStatus: "denied",
          toStatus: "appealed",
          note: `Appeal filed (${appealLevel} level): ${appealReason.substring(0, 200)}`,
        },
      });

      return [newAppeal] as const;
    });

    const appealData = {
      id: appeal.id,
      priorAuthId: appeal.priorAuthId,
      denialId: appeal.denialId,
      appealLevel: appeal.appealLevel,
      filedDate: appeal.filedDate.toISOString(),
      filedBy: `${appeal.filedBy.firstName} ${appeal.filedBy.lastName}`,
      appealReason: appeal.appealReason,
      status: appeal.status,
    };

    // Return both flat fields and legacy `appeal` envelope for backward compatibility
    return NextResponse.json({
      ...appealData,
      appeal: appealData,
    }, { status: 201 });
  } catch (error) {
    console.error("File appeal error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to file appeal" }, { status: 500 });
  }
}
