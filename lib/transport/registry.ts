/**
 * Transport Registry
 *
 * Resolves the active transport configuration for a payer and dispatches
 * to the appropriate adapter. Org-specific transports take priority over
 * global defaults, ordered by the priority field (lower = preferred).
 */

import { prisma } from "@/lib/prisma";
import type { PayerTransport, TransportEnvironment, TransportMethod } from "@prisma/client";
import type { TransportAdapter, AdapterMap } from "./types";
import { SimulatedAdapter } from "./adapters/simulated";
import { Edi278Adapter } from "./adapters/edi-278";

// ─── Adapter Registry ───────────────────────────────────────

const adapters: AdapterMap = {
  simulated: new SimulatedAdapter(),
  edi_278: new Edi278Adapter(),
  // fhir_pas: new FhirPasAdapter(),   // Future
};

/**
 * Get the adapter implementation for a transport method.
 * Returns null if no adapter is registered for the method.
 */
export function getAdapter(method: TransportMethod): TransportAdapter | null {
  return adapters[method] ?? null;
}

// ─── Transport Resolution ───────────────────────────────────

/**
 * Resolve the active transport for a payer + org + environment.
 *
 * Resolution order:
 * 1. Org-specific transport (organizationId matches)
 * 2. Global transport (organizationId is null)
 * Both filtered by payerId + isEnabled + environment, ordered by priority ASC.
 *
 * Returns null if no transport is configured.
 */
export async function resolveTransport(
  payerId: string,
  organizationId: string,
  environment: TransportEnvironment = "sandbox"
): Promise<PayerTransport | null> {
  const transport = await prisma.payerTransport.findFirst({
    where: {
      payerId,
      isEnabled: true,
      environment,
      OR: [
        { organizationId },
        { organizationId: null },
      ],
    },
    orderBy: [
      // Org-specific first (non-null organizationId sorts before null)
      { organizationId: { sort: "asc", nulls: "last" } },
      // Then by priority (lower = preferred)
      { priority: "asc" },
    ],
  });

  return transport;
}

/**
 * Determine the transport environment based on app config.
 * Defaults to sandbox unless explicitly set to production.
 */
export function getTransportEnvironment(): TransportEnvironment {
  return process.env.TRANSPORT_ENVIRONMENT === "production"
    ? "production"
    : "sandbox";
}
