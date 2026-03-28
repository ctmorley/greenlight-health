import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/** Roles allowed to add notes to the timeline. */
const NOTE_WRITE_ROLES = ["admin", "pa_coordinator", "physician"];

/**
 * GET /api/requests/[id]/timeline
 * Fetch the audit log / status change timeline for a PA request.
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

    auditPhiAccess(request, session, "view", "PriorAuthRequest", id, "Viewed PA request timeline").catch(() => {});

    // Verify request belongs to org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const statusChanges = await prisma.authStatusChange.findMany({
      where: { priorAuthId: id },
      orderBy: { createdAt: "desc" },
      include: {
        changedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({
      timeline: statusChanges.map((sc) => ({
        id: sc.id,
        fromStatus: sc.fromStatus,
        toStatus: sc.toStatus,
        note: sc.note,
        changedBy: `${sc.changedBy.firstName} ${sc.changedBy.lastName}`,
        createdAt: sc.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Timeline error:", error);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}

const addNoteSchema = z.object({
  note: z.string().min(1, "Note is required").max(2000),
});

/**
 * POST /api/requests/[id]/timeline
 * Add a note/comment to the timeline without changing status.
 * Creates a status change entry where fromStatus === toStatus.
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

  auditPhiAccess(request, session, "create", "PriorAuthRequest", null, "Added note to PA request timeline").catch(() => {});

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    // Enforce role check — viewers cannot add notes
    const userRole = session.user.role;
    if (!userRole || !NOTE_WRITE_ROLES.includes(userRole)) {
      return NextResponse.json(
        { error: "Insufficient permissions. Viewers cannot add notes." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Guard against empty or missing body
    const contentLength = request.headers.get("content-length");
    const contentType = request.headers.get("content-type");
    if (contentLength === "0" || (!contentType?.includes("application/json"))) {
      return NextResponse.json(
        { error: "Request body must be JSON with a 'note' field" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid or empty JSON body" },
        { status: 400 }
      );
    }

    const parsed = addNoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify request belongs to org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Create a timeline entry with same from/to status (note-only entry)
    const statusChange = await prisma.authStatusChange.create({
      data: {
        priorAuthId: id,
        changedById: session.user.id,
        fromStatus: paRequest.status,
        toStatus: paRequest.status,
        note: parsed.data.note,
      },
      include: {
        changedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({
      id: statusChange.id,
      fromStatus: statusChange.fromStatus,
      toStatus: statusChange.toStatus,
      note: statusChange.note,
      changedBy: `${statusChange.changedBy.firstName} ${statusChange.changedBy.lastName}`,
      createdAt: statusChange.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    // Only log unexpected server errors, not client input issues
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    console.error("Add note error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}
