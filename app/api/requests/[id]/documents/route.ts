import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStorageProvider, buildBlobKey } from "@/lib/storage";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const { id } = await params;

    auditPhiAccess(request, session, "view", "AuthDocument", id, "Listed documents for PA request").catch(() => {});

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
    log.error("Get documents error", { error: error instanceof Error ? error.message : String(error) });
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
    const { id } = await params;

    auditPhiAccess(request, session, "create", "AuthDocument", id, "Uploaded/downloaded document for PA request").catch(() => {});

    // Verify request belongs to org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";
    const storage = getStorageProvider();

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
          where: { id: body.documentId as string, priorAuthId: id },
        });

        if (!document) {
          return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        const disposition = body.disposition === "inline" ? "inline" as const : "attachment" as const;

        // Try signed URL first, fall back to proxied download
        const signedUrl = await storage.getSignedUrl(document.filePath, 300, {
          disposition,
          fileName: document.fileName,
          contentType: document.fileType || "application/octet-stream",
        });
        if (signedUrl) {
          return NextResponse.json({ url: signedUrl });
        }

        // Proxy the download
        let fileBuffer: Buffer;
        try {
          fileBuffer = await storage.download(document.filePath);
        } catch {
          return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
        }

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

    // Build a stable, provider-agnostic blob key
    const blobKey = buildBlobKey(organizationId, id, file.name);

    // Upload to storage
    const bytes = await file.arrayBuffer();
    await storage.upload(blobKey, Buffer.from(bytes), file.type || "application/octet-stream");

    // Create database record with blob key (not a provider-specific URL)
    const document = await prisma.authDocument.create({
      data: {
        priorAuthId: id,
        uploadedById: session.user.id,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        filePath: blobKey,
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
    log.error("Document POST error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to process document request" }, { status: 500 });
  }
}
