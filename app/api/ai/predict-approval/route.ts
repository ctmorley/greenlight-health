import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { guardSubscription } from "@/lib/billing";
import { isAiConfigured, NotFoundError } from "@/lib/ai";
import { assembleApprovalContext } from "@/lib/ai/approval-predictor";

const requestSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
});

/**
 * POST /api/ai/predict-approval
 * Predict approval probability for a PA request.
 * NEVER sends PHI to Claude — only CPT/ICD-10 codes, payer info,
 * ACR rating, and documentation completeness.
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

    const { requestId } = parsed.data;

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      requestId,
      "Predicted approval probability"
    ).catch(() => {});

    const result = await assembleApprovalContext(requestId, organizationId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Predict approval error:", error);
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
    return NextResponse.json({ error: "Failed to predict approval" }, { status: 500 });
  }
}
