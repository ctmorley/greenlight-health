import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { guardSubscription } from "@/lib/billing";
import { isAiConfigured, NotFoundError } from "@/lib/ai";
import type { AppealLevel } from "@/lib/ai/types";
import { assembleAppealContext } from "@/lib/ai/appeal-drafter";
import { log } from "@/lib/logger";

const requestSchema = z.object({
  denialId: z.string().min(1, "denialId is required"),
  additionalEvidence: z.string().optional(),
  appealLevel: z
    .enum(["first", "second", "external_review"])
    .optional(),
});

/**
 * POST /api/ai/draft-appeal
 * Draft an appeal letter for a denied PA request.
 * De-identifies PHI before sending to Claude, re-identifies in response.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.ai);
  if (rateLimited) return rateLimited;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 }
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const blocked = await guardSubscription(organizationId, "ai_call");
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { denialId, additionalEvidence, appealLevel } = parsed.data;

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      denialId,
      "Drafted appeal letter"
    ).catch(() => {});

    const result = await assembleAppealContext(
      denialId,
      organizationId,
      additionalEvidence,
      appealLevel as AppealLevel | undefined
    );

    return NextResponse.json(result);
  } catch (error) {
    log.error("Draft appeal error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      (error.message.includes("Anthropic") ||
        error.message.includes("API") ||
        error.message.includes("401") ||
        error.message.includes("429") ||
        error.message.includes("500"))
    ) {
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Failed to draft appeal" }, { status: 500 });
  }
}
