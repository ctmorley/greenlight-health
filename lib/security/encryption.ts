import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * PHI Encryption at Rest — AES-256-GCM
 *
 * Encrypts sensitive PHI fields before database storage per:
 * - HIPAA § 164.312(a)(2)(iv) — Encryption and decryption
 * - HITRUST CSF 09.ac — Protection of data at rest
 * - SOC 2 CC6.1 — Logical and physical access controls
 *
 * Usage:
 *   const encrypted = encryptPhi("patient SSN here");
 *   const decrypted = decryptPhi(encrypted);
 *
 * Key management:
 *   - Development: PHI_ENCRYPTION_KEY env var (base64-encoded 32-byte key)
 *   - Production: Azure Key Vault reference
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "base64" as const;

function getEncryptionKey(): Buffer {
  const keyEnv = process.env.PHI_ENCRYPTION_KEY;

  if (!keyEnv) {
    // In development, derive a key from AUTH_SECRET (not for production!)
    const fallback = process.env.AUTH_SECRET || "greenlight-dev-key-not-for-production";
    console.warn("[SECURITY] PHI_ENCRYPTION_KEY not set — using derived key. Set PHI_ENCRYPTION_KEY in production.");
    return scryptSync(fallback, "greenlight-phi-salt", 32);
  }

  const key = Buffer.from(keyEnv, "base64");
  if (key.length !== 32) {
    throw new Error("PHI_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns: base64(iv + authTag + ciphertext)
 */
export function encryptPhi(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  // Pack: iv (16) + authTag (16) + ciphertext
  const packed = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, ENCODING),
  ]);

  return packed.toString(ENCODING);
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 */
export function decryptPhi(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedBase64, ENCODING);

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext.toString(ENCODING), ENCODING, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Checks if a value appears to be encrypted (base64, correct length range).
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 44) return false; // Minimum: 16+16+1 bytes in base64
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Generates a new encryption key for production use.
 * Run: npx tsx -e "import {generateKey} from './lib/security/encryption'; console.log(generateKey())"
 */
export function generateKey(): string {
  return randomBytes(32).toString("base64");
}
