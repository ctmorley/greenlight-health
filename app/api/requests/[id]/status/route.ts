import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { VALID_TRANSITIONS, STATUS_CHANGE_ROLES } from "@/lib/status-transitions";
import { VALID_DENIAL_CATEGORY_VALUES, VALID_DENIAL_CODES, isValidCodeForCategory } from "@/lib/denial-reasons";

const statusUpdateSchema = z.object({
  status: z.enum([
    "submitted",
    "pending_review",
    "approved",
    "partially_approved",
    "denied",
    "appealed",
    "expired",
    "cancelled",
  ]),
  note: z.string().optional(),
  // Required when denying — denial reason details
  denialReasonCategory: z.enum([
    "medical_necessity",
    "incomplete_documentation",
    "out_of_network",
    "service_not_covered",
    "missing_precert",
    "coding_error",
    "other",
  ]).optional(),
  denialReasonCode: z.string().optional(), // required for denied status — enforced below
  denialReasonDescription: z.string().optional(),
  denialPayerNotes: z.string().optional(),
});

/**
 * PATCH /api/requests/[id]/status
 * Update the status of a PA request with transition validation and audit logging.
 */
export async function PATCH(
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

  // Check role
  if (!STATUS_CHANGE_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions. Only admins and PA coordinators can change status." },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = statusUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status: newStatus, note, denialReasonCategory, denialReasonCode, denialReasonDescription, denialPayerNotes } = parsed.data;

    // Reject `appealed` via generic status change — must use /api/requests/[id]/appeal
    if (newStatus === "appealed") {
      return NextResponse.json(
        { error: "Cannot set status to 'appealed' directly. Use POST /api/requests/[id]/appeal to file an appeal." },
        { status: 422 }
      );
    }

    // If denying, require a reason category and description (code is optional per contract)
    if (newStatus === "denied") {
      if (!denialReasonCategory) {
        return NextResponse.json(
          { error: "Denial reason category is required when denying a request" },
          { status: 400 }
        );
      }
      if (!VALID_DENIAL_CATEGORY_VALUES.includes(denialReasonCategory as typeof VALID_DENIAL_CATEGORY_VALUES[number])) {
        return NextResponse.json(
          { error: `Invalid denial reason category: '${denialReasonCategory}'. Valid values: ${VALID_DENIAL_CATEGORY_VALUES.join(", ")}` },
          { status: 400 }
        );
      }
      if (!denialReasonDescription || denialReasonDescription.trim().length === 0) {
        return NextResponse.json(
          { error: "Denial reason description is required when denying a request" },
          { status: 400 }
        );
      }
      // Denial reason code is required
      if (!denialReasonCode || denialReasonCode.trim().length === 0) {
        return NextResponse.json(
          { error: "Denial reason code is required when denying a request" },
          { status: 400 }
        );
      }
      // Validate reason code — must be a known code and match the category
      if (!VALID_DENIAL_CODES.includes(denialReasonCode)) {
        return NextResponse.json(
          { error: `Unknown denial reason code: '${denialReasonCode}'. Valid codes: ${VALID_DENIAL_CODES.join(", ")}` },
          { status: 400 }
        );
      }
      if (!isValidCodeForCategory(denialReasonCode, denialReasonCategory)) {
        return NextResponse.json(
          { error: `Denial reason code '${denialReasonCode}' does not belong to category '${denialReasonCategory}'` },
          { status: 400 }
        );
      }
    }

    // Fetch the current request
    const existing = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const currentStatus = existing.status;

    // Validate the transition
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status transition from '${currentStatus}' to '${newStatus}'`,
          allowedTransitions,
        },
        { status: 422 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    // Set decidedAt for terminal decisions
    if (["approved", "partially_approved", "denied"].includes(newStatus) && !existing.decidedAt) {
      updateData.decidedAt = new Date();
    }

    // Set expiresAt for approved (90 days default)
    if (["approved", "partially_approved"].includes(newStatus) && !existing.expiresAt) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 90);
      updateData.expiresAt = expiry;
    }

    // Execute in transaction
    const [updated] = await prisma.$transaction(async (tx) => {
      const req = await tx.priorAuthRequest.update({
        where: { id },
        data: updateData,
      });

      await tx.authStatusChange.create({
        data: {
          priorAuthId: id,
          changedById: session.user.id,
          fromStatus: currentStatus,
          toStatus: newStatus,
          note: note || null,
        },
      });

      // Create denial record when denying
      if (newStatus === "denied" && denialReasonCategory) {
        await tx.denial.create({
          data: {
            priorAuthId: id,
            denialDate: new Date(),
            reasonCategory: denialReasonCategory,
            reasonCode: denialReasonCode || null,
            reasonDescription: denialReasonDescription || null,
            payerNotes: denialPayerNotes || null,
          },
        });
      }

      return [req] as const;
    });

    return NextResponse.json({
      id: updated.id,
      referenceNumber: updated.referenceNumber,
      status: updated.status,
      previousStatus: currentStatus,
      updatedAt: updated.updatedAt.toISOString(),
      decidedAt: updated.decidedAt?.toISOString() || null,
      expiresAt: updated.expiresAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Status update error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
