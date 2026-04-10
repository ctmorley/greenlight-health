/**
 * Local Filesystem Storage Provider (Development Fallback)
 *
 * Stores files under {cwd}/uploads/ using the blob key as the path.
 * Does NOT support signed URLs — downloads are proxied through the API.
 *
 * Not suitable for production: files are lost on container restart.
 */

import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import path from "path";
import type { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.cwd(), "uploads");
  }

  async upload(key: string, data: Buffer, _contentType: string): Promise<string> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.resolve(key);
    return readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.resolve(key);
      await unlink(filePath);
    } catch {
      // File may not exist — silently succeed
    }
  }

  async getSignedUrl(_key: string, _expiresInSeconds: number, _options?: import("./types").SignedUrlOptions): Promise<string | null> {
    // Local filesystem doesn't support signed URLs.
    // The API route will proxy the download instead.
    return null;
  }

  private resolve(key: string): string {
    const resolved = path.resolve(this.basePath, key);
    // Prevent path traversal — ensure resolved path is strictly within basePath.
    // Use basePath + sep to avoid prefix collisions (e.g., "uploads-evil/").
    if (!resolved.startsWith(this.basePath + path.sep) && resolved !== this.basePath) {
      throw new Error("Invalid storage key: path traversal detected");
    }
    return resolved;
  }
}
