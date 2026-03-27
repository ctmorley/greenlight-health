import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { resolveDocumentPath } from "@/lib/document-path";

const VALID_CATEGORIES = [
  "clinical_notes",
  "imaging_order",
  "lab_results",
  "referral",
  "medical_records",
  "letter_of_necessity",
  "other",
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * GET /api/requests/[id]/documents
 * List documents for a PA request.
 */
export async function GET(
  _request: NextRequest,
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

  try {
    const { id } = await params;

    // Verify request belongs to org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const documents = await prisma.authDocument.findMany({
      where: { priorAuthId: id },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({
      documents: documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSize: d.fileSize,
        category: d.category,
        uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

/**
 * POST /api/requests/[id]/documents
 *
 * Dual-purpose endpoint:
 * 1. Download: Send JSON `{ "action": "download", "documentId": "<id>" }` to download a document.
 * 2. Upload: Send multipart/form-data with fields `file` and `category` to upload a document.
 *
 * The action is determined by the Content-Type header.
 */
export async function POST(
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

  try {
    const { id } = await params;

    // Verify request belongs to org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";

    // ─── JSON body → Download action ──────────────────────
    if (contentType.includes("application/json")) {
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch (err) {
        if (err instanceof SyntaxError) {
          return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        throw err;
      }

      if (body.action === "download" && body.documentId) {
        const document = await prisma.authDocument.findFirst({
          where: { id: body.documentId, priorAuthId: id },
        });

        if (!document) {
          return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        let fileBuffer: Buffer;
        try {
          const absolutePath = resolveDocumentPath(document.filePath);
          fileBuffer = await readFile(absolutePath);
        } catch (err) {
          if (err instanceof Error && err.message.includes("outside uploads")) {
            return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
          }
          return NextResponse.json(
            { error: "File not found on disk" },
            { status: 404 }
          );
        }

        // Support inline disposition for preview (e.g., body.disposition === "inline")
        const disposition = body.disposition === "inline" ? "inline" : "attachment";

        return new NextResponse(new Uint8Array(fileBuffer), {
          status: 200,
          headers: {
            "Content-Type": document.fileType || "application/octet-stream",
            "Content-Disposition": `${disposition}; filename="${document.fileName.replace(/"/g, '\\"')}"`,
            "Content-Length": String(fileBuffer.length),
          },
        });
      }

      return NextResponse.json(
        { error: "Invalid JSON action. Expected { action: 'download', documentId: '<id>' }" },
        { status: 400 }
      );
    }

    // ─── Multipart → Upload action ────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }

    const validCategory = VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])
      ? (category as typeof VALID_CATEGORIES[number])
      : "other";

    // Create upload directory
    const uploadDir = path.join(process.cwd(), "uploads", organizationId, id);
    await mkdir(uploadDir, { recursive: true });

    // Generate a safe filename
    const timestamp = Date.now();
    const safeFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(uploadDir, safeFileName);

    // Write file to disk
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Store relative path for portability
    const relativePath = path.join("uploads", organizationId, id, safeFileName);

    // Create database record
    const document = await prisma.authDocument.create({
      data: {
        priorAuthId: id,
        uploadedById: session.user.id,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        filePath: relativePath,
        fileSize: file.size,
        category: validCategory,
      },
    });

    return NextResponse.json({
      id: document.id,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      category: document.category,
      createdAt: document.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("Document POST error:", error);
    return NextResponse.json({ error: "Failed to process document request" }, { status: 500 });
  }
}
