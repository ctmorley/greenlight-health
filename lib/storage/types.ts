/**
 * Storage Provider Abstraction
 *
 * Provider-agnostic interface for document storage. The database stores
 * a stable blob key (e.g., "documents/{orgId}/{requestId}/{uuid}-{name}.pdf"),
 * not a provider-specific URL.
 */

export interface SignedUrlOptions {
  /** Content-Disposition: "attachment" (download) or "inline" (preview) */
  disposition?: "attachment" | "inline";
  /** Filename for the Content-Disposition header */
  fileName?: string;
  /** Content-Type override for the response */
  contentType?: string;
}

export interface StorageProvider {
  /** Upload a file. Returns the blob key that was written. */
  upload(key: string, data: Buffer, contentType: string): Promise<string>;

  /** Download a file by blob key. Returns the raw buffer. */
  download(key: string): Promise<Buffer>;

  /** Delete a file by blob key. Silently succeeds if the key doesn't exist. */
  delete(key: string): Promise<void>;

  /**
   * Generate a short-lived signed URL for direct browser download.
   * Falls back to null if the provider doesn't support signed URLs
   * (e.g., local filesystem), in which case the API should proxy the download.
   *
   * When options are provided, the signed URL will include response header
   * overrides so the browser receives the correct Content-Disposition and
   * Content-Type even on direct blob access.
   */
  getSignedUrl(key: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<string | null>;
}

/**
 * Build a stable, provider-agnostic blob key for a document.
 *
 * Format: documents/{orgId}/{requestId}/{uuid}-{safeName}
 */
export function buildBlobKey(
  orgId: string,
  requestId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uuid = crypto.randomUUID();
  return `documents/${orgId}/${requestId}/${uuid}-${safeName}`;
}
