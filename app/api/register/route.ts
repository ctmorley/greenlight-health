import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const registerSchema = z.object({
  organizationName: z.string().trim().min(2, "Organization name is required"),
  organizationType: z.enum(["imaging_center", "surgical_center", "hospital", "multi_specialty"]).default("imaging_center"),
  firstName: z.string().optional().default("Admin").transform((v) => v.trim() || "Admin"),
  lastName: z.string().optional().default("User").transform((v) => v.trim() || "User"),
  email: z.string().email("Invalid email address").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function isDatabaseConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("can't reach database") ||
      msg.includes("connection refused") ||
      msg.includes("econnrefused") ||
      msg.includes("p1001");
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hash(data.password, 12);

    // Create organization and admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: data.organizationName,
          type: data.organizationType,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: "admin",
        },
      });

      return { organization, user };
    });

    return NextResponse.json(
      {
        message: "Registration successful",
        organizationId: result.organization.id,
        userId: result.user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    // Handle unique constraint violation (race condition: email created between check and insert)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    if (isDatabaseConnectionError(error)) {
      console.error("Database connection error:", error);
      return NextResponse.json(
        {
          error: "Database unavailable. Please ensure PostgreSQL is running on localhost:5432. You can start it with: docker compose up -d",
        },
        { status: 503 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
