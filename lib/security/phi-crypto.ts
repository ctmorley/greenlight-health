/**
 * PHI Field-Level Encryption & Blind Index
 *
 * Provides encrypt/decrypt for PHI fields at rest, plus HMAC-SHA256 blind
 * indexes for search and uniqueness without exposing plaintext.
 *
 * Key management:
 * - Uses HKDF to derive separate encryption and blind-index subkeys from
 *   a single PHI_ENCRYPTION_KEY master key. The AES encryption key and the
 *   HMAC index key are cryptographically independent.
 * - Development fallback: derives master key from AUTH_SECRET (not for production).
 *
 * Security properties:
 * - AES-256-GCM authenticated encryption (confidentiality + integrity)
 * - HMAC-SHA256 blind indexes (deterministic, one-way, separate key)
 * - Unique random IV per encryption (no ciphertext correlation)
 * - Blind indexes normalized to lowercase for case-insensitive matching
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  hkdfSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ─── Key Derivation ──────────────────────────────────────────

let _encryptionKey: Buffer | null = null;
let _indexKey: Buffer | null = null;

function getMasterKey(): Buffer {
  const keyEnv = process.env.PHI_ENCRYPTION_KEY;

  if (!keyEnv) {
    const fallback = process.env.AUTH_SECRET || "greenlight-dev-key-not-for-production";
    if (process.env.NODE_ENV === "production") {
      console.warn("[PHI-CRYPTO] PHI_ENCRYPTION_KEY not set — using derived key. NOT SAFE FOR PRODUCTION.");
    }
    return scryptSync(fallback, "greenlight-phi-salt", 32);
  }

  const key = Buffer.from(keyEnv, "base64");
  if (key.length !== 32) {
    throw new Error("PHI_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

function getEncryptionKey(): Buffer {
  if (_encryptionKey) return _encryptionKey;
  const master = getMasterKey();
  _encryptionKey = Buffer.from(hkdfSync("sha256", master, "", "phi-encryption", 32));
  return _encryptionKey;
}

function getIndexKey(): Buffer {
  if (_indexKey) return _indexKey;
  const master = getMasterKey();
  _indexKey = Buffer.from(hkdfSync("sha256", master, "", "phi-blind-index", 32));
  return _indexKey;
}

// ─── Encryption ──────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns base64(iv + authTag + ciphertext).
 */
export function encryptField(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt an AES-256-GCM encrypted field.
 */
export function decryptField(ciphertext: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(ciphertext, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid ciphertext: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// ─── Blind Index ─────────────────────────────────────────────

/**
 * Compute a blind index (HMAC-SHA256) for a field value.
 * The value is lowercased before hashing for case-insensitive matching.
 * Returns a hex string suitable for database indexing.
 */
export function blindIndex(value: string): string {
  const key = getIndexKey();
  return createHmac("sha256", key)
    .update(value.toLowerCase().trim())
    .digest("hex");
}

// ─── Field Mapper ────────────────────────────────────────────

/**
 * Configuration for a PHI field: whether it needs encryption, a blind index, or both.
 */
interface PhiFieldConfig {
  /** Column name for the encrypted value (e.g., "firstNameEncrypted") */
  encryptedColumn: string;
  /** Column name for the blind index (e.g., "firstNameHash"). Null if no index needed. */
  hashColumn: string | null;
  /** Pre-process value before hashing (e.g., normalize dates). Default: lowercase trim. */
  hashNormalize?: (value: string) => string;
}

/**
 * Map of plaintext field name → encryption/index config.
 */
const PATIENT_PHI_FIELDS: Record<string, PhiFieldConfig> = {
  firstName: { encryptedColumn: "firstNameEncrypted", hashColumn: "firstNameHash" },
  lastName: { encryptedColumn: "lastNameEncrypted", hashColumn: "lastNameHash" },
  mrn: { encryptedColumn: "mrnEncrypted", hashColumn: "mrnHash" },
  dob: {
    encryptedColumn: "dobEncrypted",
    hashColumn: "dobHash",
    hashNormalize: (v) => new Date(v).toISOString().split("T")[0], // YYYY-MM-DD
  },
  phone: { encryptedColumn: "phoneEncrypted", hashColumn: null },
  email: { encryptedColumn: "emailEncrypted", hashColumn: "emailHash" },
  address: { encryptedColumn: "addressEncrypted", hashColumn: null },
};

const INSURANCE_PHI_FIELDS: Record<string, PhiFieldConfig> = {
  memberId: { encryptedColumn: "memberIdEncrypted", hashColumn: "memberIdHash" },
  groupNumber: { encryptedColumn: "groupNumberEncrypted", hashColumn: null },
};

/**
 * Encrypt patient PHI fields for database storage (dual-write).
 * Takes a partial object of plaintext field values, returns an object
 * with encrypted + hash columns ready to spread into a Prisma create/update.
 */
export function encryptPatientFields(
  plaintext: Record<string, string | null | undefined>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const [field, config] of Object.entries(PATIENT_PHI_FIELDS)) {
    const value = plaintext[field];
    if (value === undefined) continue; // Field not being written

    if (value === null || value === "") {
      result[config.encryptedColumn] = null;
      if (config.hashColumn) result[config.hashColumn] = null;
    } else {
      result[config.encryptedColumn] = encryptField(value);
      if (config.hashColumn) {
        const normalized = config.hashNormalize ? config.hashNormalize(value) : value;
        result[config.hashColumn] = blindIndex(normalized);
      }
    }
  }

  return result;
}

/**
 * Encrypt insurance PHI fields for database storage (dual-write).
 */
export function encryptInsuranceFields(
  plaintext: Record<string, string | null | undefined>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const [field, config] of Object.entries(INSURANCE_PHI_FIELDS)) {
    const value = plaintext[field];
    if (value === undefined) continue;

    if (value === null || value === "") {
      result[config.encryptedColumn] = null;
      if (config.hashColumn) result[config.hashColumn] = null;
    } else {
      result[config.encryptedColumn] = encryptField(value);
      if (config.hashColumn) {
        result[config.hashColumn] = blindIndex(value);
      }
    }
  }

  return result;
}

/**
 * Decrypt a patient record's encrypted fields, returning the plaintext values.
 * Post-cutover: encrypted columns are the source of truth. If an encrypted
 * column is missing but plaintext is present, a warning is logged to surface
 * backfill gaps during the soak period.
 */
export function decryptPatientRecord<T extends Record<string, unknown>>(record: T): T {
  const result = { ...record };
  const recordId = record.id ?? "unknown";

  for (const [field, config] of Object.entries(PATIENT_PHI_FIELDS)) {
    const encryptedValue = record[config.encryptedColumn];
    if (typeof encryptedValue === "string" && encryptedValue.length > 0) {
      try {
        (result as Record<string, unknown>)[field] = decryptField(encryptedValue);
      } catch (err) {
        console.error(`[PHI-CRYPTO] Decryption failed for ${config.encryptedColumn} on record ${recordId}:`, err);
      }
    } else if (record[field] !== undefined && record[field] !== null) {
      // Encrypted column missing but plaintext present — backfill gap
      console.warn(`[PHI-CRYPTO] Missing encrypted column ${config.encryptedColumn} for record ${recordId}, plaintext still present`);
    }
  }

  return result;
}

/**
 * Decrypt an insurance record's encrypted fields.
 * Post-cutover: encrypted columns are the source of truth.
 */
export function decryptInsuranceRecord<T extends Record<string, unknown>>(record: T): T {
  const result = { ...record };
  const recordId = record.id ?? "unknown";

  for (const [field, config] of Object.entries(INSURANCE_PHI_FIELDS)) {
    const encryptedValue = record[config.encryptedColumn];
    if (typeof encryptedValue === "string" && encryptedValue.length > 0) {
      try {
        (result as Record<string, unknown>)[field] = decryptField(encryptedValue);
      } catch (err) {
        console.error(`[PHI-CRYPTO] Decryption failed for ${config.encryptedColumn} on record ${recordId}:`, err);
      }
    } else if (record[field] !== undefined && record[field] !== null) {
      console.warn(`[PHI-CRYPTO] Missing encrypted column ${config.encryptedColumn} for record ${recordId}, plaintext still present`);
    }
  }

  return result;
}

/**
 * Build a blind-index search condition for patient fields.
 * Replaces the old contains-based fuzzy search with exact-match on hash columns.
 */
export function buildPatientHashSearch(query: string): Record<string, string>[] {
  const conditions: Record<string, string>[] = [];
  const trimmed = query.trim();
  if (!trimmed) return conditions;

  const tokens = trimmed.split(/\s+/).filter(Boolean);

  // Exact MRN match
  conditions.push({ mrnHash: blindIndex(trimmed) });

  // Exact email match
  conditions.push({ emailHash: blindIndex(trimmed) });

  if (tokens.length >= 2) {
    // "First Last" match
    conditions.push({
      firstNameHash: blindIndex(tokens[0]),
      lastNameHash: blindIndex(tokens.slice(1).join(" ")),
    });
    // "Last First" match (reversed)
    conditions.push({
      lastNameHash: blindIndex(tokens[0]),
      firstNameHash: blindIndex(tokens.slice(1).join(" ")),
    });
  } else {
    // Single token: try as last name OR first name
    conditions.push({ lastNameHash: blindIndex(trimmed) });
    conditions.push({ firstNameHash: blindIndex(trimmed) });
  }

  return conditions;
}

/**
 * Export field configs for backfill script access.
 */
export { PATIENT_PHI_FIELDS, INSURANCE_PHI_FIELDS };
