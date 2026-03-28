// ─── Vendor Adapter ─────────────────────────────────────────────
// Base vendor adapter with methods that can be overridden per vendor.
// Provides vendor-specific FHIR behavior normalization.

import type { EhrVendor } from "@prisma/client";
import type { VendorConfig } from "./types";
import { getVendorConfig } from "./registry";

/**
 * Base adapter that normalizes vendor-specific FHIR behavior.
 * Override methods in subclasses for vendor-specific quirks.
 */
export class VendorAdapter {
  constructor(protected config: VendorConfig) {}

  /** Returns the SMART scopes this vendor supports. */
  getSmartScopes(): string[] {
    return this.config.supportedScopes;
  }

  /**
   * Transforms a FHIR response to normalize vendor-specific extensions
   * or non-standard fields into a consistent format.
   */
  transformFhirResponse(resource: unknown): unknown {
    return resource;
  }

  /**
   * Provides a human-readable error message for authentication failures.
   */
  handleAuthError(error: unknown): string {
    if (error instanceof Error) {
      return `Authentication failed: ${error.message}`;
    }
    return "Authentication failed";
  }

  /**
   * Returns the PAS $submit endpoint for a given payer FHIR base URL.
   */
  getSubmitEndpoint(payerFhirUrl: string): string {
    return `${payerFhirUrl}/Claim/$submit`;
  }

  /** Returns whether this vendor supports Da Vinci CRD. */
  supportsCrd(): boolean {
    return this.config.supportsCrd;
  }

  /** Returns whether this vendor supports Da Vinci DTR. */
  supportsDtr(): boolean {
    return this.config.supportsDtr;
  }

  /** Returns whether this vendor supports Da Vinci PAS. */
  supportsPas(): boolean {
    return this.config.supportsPas;
  }

  /** Returns vendor display name. */
  getDisplayName(): string {
    return this.config.displayName;
  }

  /** Returns the vendor developer registration URL. */
  getRegistrationUrl(): string {
    return this.config.registrationUrl;
  }
}

// ─── Vendor-Specific Adapters ───────────────────────────────────

class EpicAdapter extends VendorAdapter {
  getSmartScopes(): string[] {
    // Epic requires specific scope formatting
    return this.config.supportedScopes;
  }

  transformFhirResponse(resource: unknown): unknown {
    // Strip Epic-specific extensions for downstream consistency
    if (
      resource &&
      typeof resource === "object" &&
      "extension" in resource
    ) {
      const r = resource as Record<string, unknown>;
      if (Array.isArray(r.extension)) {
        r.extension = r.extension.filter(
          (ext: { url?: string }) =>
            !ext.url?.startsWith("http://open.epic.com/")
        );
      }
    }
    return resource;
  }

  handleAuthError(error: unknown): string {
    if (error instanceof Error && error.message.includes("403")) {
      return "Epic access denied. Verify that the application is approved in App Orchard and the customer has enabled the connection.";
    }
    return super.handleAuthError(error);
  }
}

class OracleHealthAdapter extends VendorAdapter {
  getSmartScopes(): string[] {
    // Oracle Health uses online_access scope for refresh tokens
    const scopes = [...this.config.supportedScopes];
    if (!scopes.includes("online_access")) {
      scopes.push("online_access");
    }
    return scopes;
  }

  handleAuthError(error: unknown): string {
    if (error instanceof Error && error.message.includes("invalid_scope")) {
      return "Oracle Health scope error. Verify scopes match the Code Console configuration.";
    }
    return super.handleAuthError(error);
  }
}

class MeditechAdapter extends VendorAdapter {
  getSmartScopes(): string[] {
    // MEDITECH has a more limited scope set
    return this.config.supportedScopes;
  }

  handleAuthError(error: unknown): string {
    if (error instanceof Error) {
      return `MEDITECH authentication failed. Ensure Alliance Program access is configured. ${error.message}`;
    }
    return "MEDITECH authentication failed. Ensure Alliance Program access is configured.";
  }
}

class AthenahealthAdapter extends VendorAdapter {
  handleAuthError(error: unknown): string {
    if (error instanceof Error && error.message.includes("429")) {
      return "athenahealth rate limit exceeded. Retry after the rate limit window resets.";
    }
    return super.handleAuthError(error);
  }
}

class VeradigmAdapter extends VendorAdapter {
  handleAuthError(error: unknown): string {
    if (error instanceof Error) {
      return `Veradigm authentication failed. ${error.message}`;
    }
    return "Veradigm authentication failed. Check developer portal credentials.";
  }
}

class EclinicalworksAdapter extends VendorAdapter {
  handleAuthError(error: unknown): string {
    if (error instanceof Error) {
      return `eClinicalWorks authentication failed. ${error.message}`;
    }
    return "eClinicalWorks authentication failed. Verify API access is enabled.";
  }
}

// ─── Factory ────────────────────────────────────────────────────

const adapterMap: Record<Exclude<EhrVendor, "other">, new (config: VendorConfig) => VendorAdapter> = {
  epic: EpicAdapter,
  oracle_health: OracleHealthAdapter,
  meditech: MeditechAdapter,
  athenahealth: AthenahealthAdapter,
  veradigm: VeradigmAdapter,
  eclinicalworks: EclinicalworksAdapter,
};

/**
 * Returns a vendor-specific adapter for the given EHR vendor.
 * Falls back to the base VendorAdapter if no vendor-specific adapter exists
 * or if the vendor config is not found (e.g., "other").
 */
export function getAdapterForVendor(vendor: EhrVendor): VendorAdapter | null {
  const config = getVendorConfig(vendor);
  if (!config) return null;

  const AdapterClass = adapterMap[vendor as Exclude<EhrVendor, "other">];
  if (AdapterClass) {
    return new AdapterClass(config);
  }

  return new VendorAdapter(config);
}
