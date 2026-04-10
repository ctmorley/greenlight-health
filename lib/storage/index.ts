/**
 * Storage Provider Factory
 *
 * Returns an Azure Blob provider when AZURE_STORAGE_CONNECTION_STRING is set,
 * otherwise falls back to local filesystem storage for development.
 */

import type { StorageProvider } from "./types";
import { AzureBlobStorageProvider } from "./azure-blob";
import { LocalStorageProvider } from "./local";

export { buildBlobKey } from "./types";
export type { StorageProvider } from "./types";

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider;

  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    _provider = new AzureBlobStorageProvider(
      process.env.AZURE_STORAGE_CONNECTION_STRING,
      process.env.AZURE_STORAGE_CONTAINER || "documents",
    );
  } else {
    _provider = new LocalStorageProvider();
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[STORAGE] No AZURE_STORAGE_CONNECTION_STRING set — using local filesystem. " +
        "Documents will be lost on container restart. This is not suitable for production.",
      );
    }
  }

  return _provider!;
}
