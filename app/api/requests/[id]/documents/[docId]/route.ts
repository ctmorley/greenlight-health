import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readFile } from "fs/promises";
import { resolveDocumentPath } from "@/lib/document-path";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * GET /api/requests/[id]/documents/[docId]
 * Download a specific document for a PA request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
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
    const { id, docId } = await params;

    auditPhiAccess(request, session, "view", "AuthDocument", docId, "Downloaded document").catch(() => {});

    // Verify the PA request belongs to the user's org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Fetch the document record
    const document = await prisma.authDocument.findFirst({
      where: { id: docId, priorAuthId: id },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Read the file from disk (normalize path to handle leading slashes)
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

    // Support inline disposition for preview (e.g., ?disposition=inline)
    const dispositionParam = request.nextUrl.searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": document.fileType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${document.fileName.replace(/"/g, '\\"')}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error("Download document error:", error);
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
  }
}
