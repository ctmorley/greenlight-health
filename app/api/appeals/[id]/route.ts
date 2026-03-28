import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const updateAppealSchema = z.object({
  status: z.enum(["won", "lost", "withdrawn"]),
  decisionNotes: z.string().optional(),
});

/**
 * PATCH /api/appeals/[id]
 * Update appeal outcome (won/lost/withdrawn).
 * When appeal is won, PA status transitions to 'approved'.
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

  auditPhiAccess(request, session, "update", "Appeal", null, "Updated appeal outcome").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (!["admin", "pa_coordinator"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateAppealSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status: newStatus, decisionNotes } = parsed.data;

    // Find the appeal with its related PA request
    const appeal = await prisma.appeal.findUnique({
      where: { id },
      include: {
        priorAuth: {
          select: { id: true, status: true, organizationId: true },
        },
      },
    });

    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }

    if (appeal.priorAuth.organizationId !== organizationId) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }

    // Only active appeals can be updated
    if (!["draft", "filed", "in_review"].includes(appeal.status)) {
      return NextResponse.json(
        { error: `Cannot update appeal with status '${appeal.status}'. Only active appeals can be updated.` },
        { status: 422 }
      );
    }

    // Execute in transaction
    const [updated] = await prisma.$transaction(async (tx) => {
      const updatedAppeal = await tx.appeal.update({
        where: { id },
        data: {
          status: newStatus,
          decisionDate: new Date(),
          decisionNotes: decisionNotes || null,
        },
        include: {
          filedBy: { select: { firstName: true, lastName: true } },
        },
      });

      // If appeal is won, transition PA to approved
      if (newStatus === "won") {
        await tx.priorAuthRequest.update({
          where: { id: appeal.priorAuthId },
          data: {
            status: "approved",
            decidedAt: new Date(),
            expiresAt: (() => {
              const d = new Date();
              d.setDate(d.getDate() + 90);
              return d;
            })(),
          },
        });

        await tx.authStatusChange.create({
          data: {
            priorAuthId: appeal.priorAuthId,
            changedById: session.user.id,
            fromStatus: "appealed",
            toStatus: "approved",
            note: `Appeal won${decisionNotes ? `: ${decisionNotes.substring(0, 200)}` : ""}`,
          },
        });
      } else if (newStatus === "lost") {
        // PA stays in appealed or transitions back to denied
        await tx.priorAuthRequest.update({
          where: { id: appeal.priorAuthId },
          data: { status: "denied" },
        });

        await tx.authStatusChange.create({
          data: {
            priorAuthId: appeal.priorAuthId,
            changedById: session.user.id,
            fromStatus: "appealed",
            toStatus: "denied",
            note: `Appeal lost${decisionNotes ? `: ${decisionNotes.substring(0, 200)}` : ""}`,
          },
        });
      } else if (newStatus === "withdrawn") {
        await tx.priorAuthRequest.update({
          where: { id: appeal.priorAuthId },
          data: { status: "denied" },
        });

        await tx.authStatusChange.create({
          data: {
            priorAuthId: appeal.priorAuthId,
            changedById: session.user.id,
            fromStatus: "appealed",
            toStatus: "denied",
            note: "Appeal withdrawn",
          },
        });
      }

      return [updatedAppeal] as const;
    });

    return NextResponse.json({
      id: updated.id,
      priorAuthId: updated.priorAuthId,
      status: updated.status,
      decisionDate: updated.decisionDate?.toISOString() || null,
      decisionNotes: updated.decisionNotes,
      filedBy: `${updated.filedBy.firstName} ${updated.filedBy.lastName}`,
    });
  } catch (error) {
    console.error("Update appeal error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update appeal" }, { status: 500 });
  }
}
