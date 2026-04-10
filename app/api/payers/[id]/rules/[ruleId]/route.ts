import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";

/**
 * GET /api/payers/[id]/rules/[ruleId]
 * Get a single payer rule.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
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
    const { id, ruleId } = await params;

    // Verify payer belongs to this org (or is global)
    const payer = await prisma.payer.findFirst({
      where: { id, OR: [{ organizationId }, { organizationId: null }] },
    });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    const rule = await prisma.payerRule.findFirst({
      where: { id: ruleId, payerId: id },
    });
    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({
      rule: {
        id: rule.id,
        payerId: rule.payerId,
        serviceCategory: rule.serviceCategory,
        cptCode: rule.cptCode,
        requiresPA: rule.requiresPA,
        clinicalCriteria: rule.clinicalCriteria,
        validFrom: rule.validFrom.toISOString(),
        validTo: rule.validTo?.toISOString() || null,
        createdAt: rule.createdAt.toISOString(),
      },
    });
  } catch (error) {
    log.error("Get rule error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to fetch rule" }, { status: 500 });
  }
}

/**
 * PATCH /api/payers/[id]/rules/[ruleId]
 * Update a payer rule (admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
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
    const { id, ruleId } = await params;

    // Verify payer belongs to this org (or is global)
    const payer = await prisma.payer.findFirst({
      where: { id, OR: [{ organizationId }, { organizationId: null }] },
    });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    const rule = await prisma.payerRule.findFirst({
      where: { id: ruleId, payerId: id },
    });
    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.serviceCategory !== undefined) {
      const valid = ["imaging", "surgical", "medical"];
      if (valid.includes(body.serviceCategory)) data.serviceCategory = body.serviceCategory;
    }
    if (body.cptCode !== undefined) data.cptCode = body.cptCode ? String(body.cptCode).trim() : null;
    if (body.requiresPA !== undefined) data.requiresPA = Boolean(body.requiresPA);
    if (body.clinicalCriteria !== undefined) data.clinicalCriteria = body.clinicalCriteria;

    const updated = await prisma.payerRule.update({
      where: { id: ruleId },
      data,
    });

    return NextResponse.json({ rule: updated });
  } catch (error) {
    log.error("Rule update error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

/**
 * DELETE /api/payers/[id]/rules/[ruleId]
 * Delete a payer rule (admin only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
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
    const { id, ruleId } = await params;

    // Verify payer belongs to this org (or is global)
    const payer = await prisma.payer.findFirst({
      where: { id, OR: [{ organizationId }, { organizationId: null }] },
    });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    const rule = await prisma.payerRule.findFirst({
      where: { id: ruleId, payerId: id },
    });
    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await prisma.payerRule.delete({ where: { id: ruleId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Rule delete error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
