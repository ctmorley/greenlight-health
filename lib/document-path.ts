import path from "path";

/**
 * Resolves a document's stored filePath to a safe absolute path
 * within the project's uploads directory.
 *
 * Handles both relative paths ("uploads/...") and absolute-looking
 * paths ("/uploads/...") that may have been persisted by earlier
 * seed scripts or migrations.
 *
 * Rejects path-traversal attempts (e.g., "../etc/passwd").
 */
export function resolveDocumentPath(filePath: string): string {
  // Strip leading slashes so path.join won't ignore cwd
  const normalized = filePath.replace(/^\/+/, "");

  const uploadsDir = path.join(process.cwd(), "uploads");
  const absolutePath = path.join(process.cwd(), normalized);

  // Ensure the resolved path stays within the uploads directory
  if (!absolutePath.startsWith(uploadsDir)) {
    throw new Error("Invalid document path: outside uploads directory");
  }

  return absolutePath;
}
