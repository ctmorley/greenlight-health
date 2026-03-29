import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { guardSubscription } from "@/lib/billing";
import { isAiConfigured, NotFoundError } from "@/lib/ai";
import { assembleSummaryContext } from "@/lib/ai/clinical-summarizer";

const requestSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  notes: z.string().optional(),
});

/**
 * POST /api/ai/summarize-clinical
 * Summarize clinical justification for a PA request.
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

    const { requestId, notes } = parsed.data;

    auditPhiAccess(
      request,
      session,
      "ai_generate",
      "AiGeneration",
      requestId,
      "Summarized clinical documentation"
    ).catch(() => {});

    const result = await assembleSummaryContext(
      requestId,
      organizationId,
      notes
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Summarize clinical error:", error);
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
    return NextResponse.json({ error: "Failed to summarize clinical data" }, { status: 500 });
  }
}
