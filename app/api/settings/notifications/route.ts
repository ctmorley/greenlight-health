import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { NOTIFICATION_EVENTS, getNotificationEvents } from "@/lib/notifications/service";
import { log } from "@/lib/logger";

const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  events: z
    .array(z.string())
    .optional()
    .refine(
      (events) =>
        !events || events.every((e) => (NOTIFICATION_EVENTS as readonly string[]).includes(e)),
      { message: "Invalid notification event type" }
    ),
});

/**
 * GET /api/settings/notifications
 * Returns the current user's notification preferences.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: session.user.id },
    });

    // Return defaults if no preferences saved yet
    const preferences = prefs || {
      emailEnabled: true,
      inAppEnabled: true,
      events: [...NOTIFICATION_EVENTS],
    };

    return NextResponse.json({
      preferences: {
        emailEnabled: preferences.emailEnabled,
        inAppEnabled: preferences.inAppEnabled,
        events: preferences.events,
      },
      availableEvents: getNotificationEvents(),
    });
  } catch (error) {
    log.error("Get notification preferences error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to fetch notification preferences" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/notifications
 * Updates the current user's notification preferences.
 */
export async function PUT(request: NextRequest) {
  const rateLimited = checkRateLimit(request, RATE_LIMITS.api);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        emailEnabled: data.emailEnabled ?? true,
        inAppEnabled: data.inAppEnabled ?? true,
        events: data.events ?? [...NOTIFICATION_EVENTS],
      },
      update: {
        ...(data.emailEnabled !== undefined && { emailEnabled: data.emailEnabled }),
        ...(data.inAppEnabled !== undefined && { inAppEnabled: data.inAppEnabled }),
        ...(data.events !== undefined && { events: data.events }),
      },
    });

    return NextResponse.json({
      preferences: {
        emailEnabled: prefs.emailEnabled,
        inAppEnabled: prefs.inAppEnabled,
        events: prefs.events,
      },
    });
  } catch (error) {
    log.error("Update notification preferences error", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update notification preferences" },
      { status: 500 }
    );
  }
}
