import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/payers/[id]/rules
 * Check PA requirement rules for a specific payer.
 * Query params: serviceCategory, cptCode (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const serviceCategory = searchParams.get("serviceCategory");
    const cptCode = searchParams.get("cptCode");

    // Verify payer exists
    const payer = await prisma.payer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        rbmVendor: true,
        avgResponseDays: true,
        electronicSubmission: true,
      },
    });

    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    // Build rule query — always use AND blocks to preserve validity constraints
    const now = new Date();
    const { searchParams: sp } = new URL(request.url);
    const cptCodes = sp.get("cptCodes"); // comma-separated list of CPT codes

    const andConditions: Record<string, unknown>[] = [
      { payerId: id },
      { validFrom: { lte: now } },
      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
    ];

    if (serviceCategory) {
      andConditions.push({ serviceCategory });
    }

    // Support both single cptCode and multi cptCodes params
    const allCptCodes: string[] = [];
    if (cptCode) allCptCodes.push(cptCode);
    if (cptCodes) allCptCodes.push(...cptCodes.split(",").map((c) => c.trim()).filter(Boolean));
    const uniqueCptCodes = [...new Set(allCptCodes)];

    if (uniqueCptCodes.length > 0) {
      andConditions.push({
        OR: [
          { cptCode: { in: uniqueCptCodes } },
          { cptCode: null },
        ],
      });
    }

    const ruleWhere = { AND: andConditions };

    const rules = await prisma.payerRule.findMany({
      where: ruleWhere,
      orderBy: [
        { cptCode: { sort: "asc", nulls: "last" } },
        { serviceCategory: "asc" },
      ],
    });

    // Determine if PA is required - check all CPT codes; any match requiring PA → PA Required
    let requiresPA = false;
    let matchedRule = null;

    if (uniqueCptCodes.length > 0 && rules.length > 0) {
      // For each CPT code, find the best matching rule (specific > catch-all)
      for (const code of uniqueCptCodes) {
        const specificRule = rules.find((r) => r.cptCode === code);
        const catchAllRule = rules.find((r) => r.cptCode === null);
        const bestRule = specificRule || catchAllRule;
        if (bestRule?.requiresPA) {
          requiresPA = true;
          matchedRule = bestRule;
          break; // Any code requiring PA is sufficient
        }
        if (!matchedRule && bestRule) {
          matchedRule = bestRule;
        }
      }
      if (!matchedRule) {
        matchedRule = rules[0];
      }
    } else if (rules.length > 0) {
      // No specific CPT code provided - check if any rule requires PA
      requiresPA = rules.some((r) => r.requiresPA);
      matchedRule = rules.find((r) => r.requiresPA) || rules[0];
    }

    return NextResponse.json({
      payer: {
        id: payer.id,
        name: payer.name,
        rbmVendor: payer.rbmVendor,
        avgResponseDays: payer.avgResponseDays,
        electronicSubmission: payer.electronicSubmission,
      },
      requiresPA,
      matchedRule: matchedRule
        ? {
            id: matchedRule.id,
            serviceCategory: matchedRule.serviceCategory,
            cptCode: matchedRule.cptCode,
            requiresPA: matchedRule.requiresPA,
            clinicalCriteria: matchedRule.clinicalCriteria,
          }
        : null,
      totalRules: rules.length,
      rules: rules.map((r) => ({
        id: r.id,
        serviceCategory: r.serviceCategory,
        cptCode: r.cptCode,
        requiresPA: r.requiresPA,
        clinicalCriteria: r.clinicalCriteria,
      })),
    });
  } catch (error) {
    console.error("Payer rules error:", error);
    return NextResponse.json({ error: "Failed to fetch payer rules" }, { status: 500 });
  }
}

/**
 * POST /api/payers/[id]/rules
 * Create a new PA requirement rule for a payer (admin only).
 */
export async function POST(
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

    const payer = await prisma.payer.findUnique({ where: { id } });
    if (!payer) {
      return NextResponse.json({ error: "Payer not found" }, { status: 404 });
    }

    const body = await request.json();

    const validCategories = ["imaging", "surgical", "medical"];
    if (!body.serviceCategory || !validCategories.includes(body.serviceCategory)) {
      return NextResponse.json({ error: "Valid serviceCategory is required (imaging, surgical, medical)" }, { status: 400 });
    }

    const rule = await prisma.payerRule.create({
      data: {
        payerId: id,
        serviceCategory: body.serviceCategory,
        cptCode: body.cptCode ? String(body.cptCode).trim() : null,
        requiresPA: body.requiresPA !== undefined ? Boolean(body.requiresPA) : true,
        clinicalCriteria: body.clinicalCriteria || null,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validTo: body.validTo ? new Date(body.validTo) : null,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("Create rule error:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
