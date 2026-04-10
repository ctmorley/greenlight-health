import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage";
import { auditPhiAccess } from "@/lib/security/audit-log";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";

/**
 * GET /api/requests/[id]/documents/[docId]
 * Download a specific document for a PA request.
 * Returns a signed URL redirect (Azure) or proxied binary stream (local).
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

    const storage = getStorageProvider();
    const dispositionParam = request.nextUrl.searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" as const : "attachment" as const;

    // Try signed URL first (Azure Blob), fall back to proxied download (local)
    const signedUrl = await storage.getSignedUrl(document.filePath, 300, {
      disposition,
      fileName: document.fileName,
      contentType: document.fileType || "application/octet-stream",
    });
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, 302);
    }

    // Proxy the download through the API
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
  } catch (error) {
    log.error("Download document error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
  }
}

/**
 * DELETE /api/requests/[id]/documents/[docId]
 * Delete a specific document from a PA request.
 */
export async function DELETE(
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

    auditPhiAccess(request, session, "delete", "AuthDocument", docId, "Deleted document").catch(() => {});

    // Verify the PA request belongs to the user's org
    const paRequest = await prisma.priorAuthRequest.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
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

    // Delete from storage (non-blocking — record deletion is authoritative)
    const storage = getStorageProvider();
    try {
      await storage.delete(document.filePath);
    } catch {
      // Storage deletion failure is non-fatal — the record is still removed
    }

    // Delete the database record
    await prisma.authDocument.delete({ where: { id: docId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Delete document error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
