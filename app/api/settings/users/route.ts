import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hash } from "bcryptjs";
import crypto from "crypto";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendInviteEmail } from "@/lib/auth-email";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        title: true,
        npiNumber: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can create users" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, firstName, lastName, role, title, npiNumber } = body;

    if (!email || !firstName || !lastName || !role) {
      return NextResponse.json(
        { error: "Email, first name, last name, and role are required" },
        { status: 400 }
      );
    }

    const validRoles = ["admin", "pa_coordinator", "physician", "viewer"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check for existing user with same email
    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    // Create user with a random unusable password — the invite token
    // flow lets the user set their own password.
    const randomPassword = crypto.randomBytes(32).toString("base64");
    const passwordHash = await hash(randomPassword, 12);

    const user = await prisma.user.create({
      data: {
        organizationId,
        email: email.trim().toLowerCase(),
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        title: title?.trim() || null,
        npiNumber: npiNumber?.trim() || null,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        title: true,
        npiNumber: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Issue invite token and send email
    let inviteSent = false;
    try {
      const token = await createAuthToken(user.id, "invite");
      inviteSent = await sendInviteEmail(
        user.email,
        user.firstName,
        token,
        session.user.organizationName || "your organization",
      );
    } catch (err) {
      console.error("Failed to send invite email:", err);
    }

    return NextResponse.json({ user, inviteSent }, { status: 201 });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can modify users" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId, role, isActive, title, npiNumber } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Verify user belongs to same org
    const targetUser = await prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deactivating yourself
    if (userId === session.user.id && isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (role !== undefined) {
      const validRoles = ["admin", "pa_coordinator", "physician", "viewer"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updateData.role = role;
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (title !== undefined) updateData.title = title || null;
    if (npiNumber !== undefined) updateData.npiNumber = npiNumber || null;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        title: true,
        npiNumber: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
