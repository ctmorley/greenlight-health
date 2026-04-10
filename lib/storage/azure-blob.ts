/**
 * Azure Blob Storage Provider
 *
 * Implements the StorageProvider interface using @azure/storage-blob.
 * Requires AZURE_STORAGE_CONNECTION_STRING and optionally AZURE_STORAGE_CONTAINER.
 */

import {
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import type { StorageProvider, SignedUrlOptions } from "./types";

export class AzureBlobStorageProvider implements StorageProvider {
  private containerClient: ContainerClient;
  private connectionString: string;
  private containerName: string;

  constructor(connectionString: string, containerName: string) {
    this.connectionString = connectionString;
    this.containerName = containerName;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = blobServiceClient.getContainerClient(containerName);
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    await blockBlobClient.uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    return blockBlobClient.downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    await blockBlobClient.deleteIfExists();
  }

  async getSignedUrl(key: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<string | null> {
    try {
      // Parse credentials from connection string for SAS generation
      const credential = this.parseCredential();
      if (!credential) return null;

      const blockBlobClient = this.containerClient.getBlockBlobClient(key);
      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + expiresInSeconds * 1000);

      // Build Content-Disposition header for the signed URL response
      let contentDisposition: string | undefined;
      if (options?.disposition || options?.fileName) {
        const disp = options.disposition || "attachment";
        const safeFileName = options.fileName?.replace(/"/g, '\\"');
        contentDisposition = safeFileName
          ? `${disp}; filename="${safeFileName}"`
          : disp;
      }

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: key,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn,
          contentDisposition,
          contentType: options?.contentType,
        },
        credential,
      ).toString();

      return `${blockBlobClient.url}?${sasToken}`;
    } catch {
      return null;
    }
  }

  private parseCredential(): StorageSharedKeyCredential | null {
    try {
      const accountName = this.connectionString.match(/AccountName=([^;]+)/)?.[1];
      const accountKey = this.connectionString.match(/AccountKey=([^;]+)/)?.[1];
      if (!accountName || !accountKey) return null;
      return new StorageSharedKeyCredential(accountName, accountKey);
    } catch {
      return null;
    }
  }
}
