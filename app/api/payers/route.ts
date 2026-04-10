import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";

/**
 * GET /api/payers
 * List payers visible to the current organization (org-specific + global payers).
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const activeFilter = includeInactive ? {} : { isActive: true };

    // Return payers belonging to this org OR global (no org) payers
    const payers = await prisma.payer.findMany({
      where: {
        ...activeFilter,
        OR: [
          { organizationId },
          { organizationId: null },
        ],
      },
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
        organizationId: true,
        _count: { select: { rules: true } },
      },
    });

    return NextResponse.json({ payers });
  } catch (error) {
    log.error("Payers list error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch payers" }, { status: 500 });
  }
}

// ─── POST: Create a new payer ────────────────────────────────

const createPayerSchema = z.object({
  name: z.string().trim().min(1, "Payer name is required"),
  payerId: z.string().trim().min(1, "Payer ID is required"),
  type: z.enum(["commercial", "medicare", "medicaid", "tricare"]).optional().default("commercial"),
  phone: z.string().trim().optional().nullable(),
  fax: z.string().trim().optional().nullable(),
  portalUrl: z.string().trim().url().optional().nullable(),
  electronicSubmission: z.boolean().optional().default(false),
  avgResponseDays: z.number().int().min(0).optional().default(5),
  rbmVendor: z.enum(["evicore", "carelon", "nia", "direct"]).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

/**
 * POST /api/payers
 * Create a new payer scoped to the current organization (admin only).
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const parsed = createPayerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payer data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    auditPhiAccess(request, session, "create", "Payer", null, "Created payer").catch(() => {});

    // Check uniqueness of payerId
    const existing = await prisma.payer.findUnique({
      where: { payerId: data.payerId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A payer with this payerId already exists" },
        { status: 409 }
      );
    }

    // Atomic: create payer + simulated transports in one transaction
    // so a transport provisioning failure can't leave an unsubmittable payer.
    const payer = await prisma.$transaction(async (tx) => {
      const created = await tx.payer.create({
        data: {
          organizationId,
          name: data.name,
          payerId: data.payerId,
          type: data.type,
          phone: data.phone || null,
          fax: data.fax || null,
          portalUrl: data.portalUrl || null,
          electronicSubmission: data.electronicSubmission,
          avgResponseDays: data.avgResponseDays,
          rbmVendor: data.rbmVendor || null,
          isActive: data.isActive,
        },
        include: { _count: { select: { rules: true } } },
      });

      // Auto-provision default simulated transports so the payer is
      // immediately submittable in both sandbox and production environments.
      // Ownership follows payer: org-scoped payers get org-scoped transports.
      await tx.payerTransport.createMany({
        data: [
          {
            payerId: created.id,
            organizationId,
            method: "simulated",
            environment: "sandbox",
            isEnabled: true,
            priority: 99,
            requiresHumanReview: false,
          },
          {
            payerId: created.id,
            organizationId,
            method: "simulated",
            environment: "production",
            isEnabled: true,
            priority: 99,
            requiresHumanReview: false,
          },
        ],
      });

      return created;
    });

    return NextResponse.json({ payer }, { status: 201 });
  } catch (error) {
    log.error("Create payer error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create payer" }, { status: 500 });
  }
}
