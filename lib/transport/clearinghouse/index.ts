/**
 * Clearinghouse Client Factory
 *
 * Returns the appropriate ClearinghouseClient based on the transport's
 * environment and metadata configuration. Sandbox client is used for
 * development and testing; real clearinghouse clients will be added
 * as integrations are established.
 */

import type { PayerTransport } from "@prisma/client";
import type { ClearinghouseClient, Edi278Metadata } from "./types";
import { SandboxClearinghouseClient } from "./sandbox-client";
import { AvailityClient } from "./availity-client";

const sandboxClient = new SandboxClearinghouseClient();

/**
 * Get the clearinghouse client for a transport configuration.
 *
 * Returns sandbox client when:
 * - transport.environment === "sandbox"
 * - metadata.clearinghouse === "sandbox"
 * - metadata.sandboxMode === true
 *
 * Throws for unrecognized clearinghouse names in production environment.
 */
export function getClearinghouseClient(
  transport: PayerTransport
): ClearinghouseClient {
  const metadata = transport.metadata as Edi278Metadata | null;

  // Sandbox mode: any of these conditions
  if (
    transport.environment === "sandbox" ||
    metadata?.clearinghouse === "sandbox" ||
    metadata?.sandboxMode === true
  ) {
    return sandboxClient;
  }

  // Production: route to the appropriate clearinghouse client
  const clearinghouse = metadata?.clearinghouse;

  switch (clearinghouse) {
    case "availity":
      return new AvailityClient({
        baseUrl: transport.endpointUrl || undefined,
        timeoutMs: metadata?.config?.timeoutMs,
      });

    // case "change_healthcare":
    //   return new ChangeHealthcareClient(transport);

    default:
      throw new Error(
        `No clearinghouse client available for "${clearinghouse}". ` +
          `Supported clearinghouses: availity, sandbox. ` +
          `Set environment to "sandbox" or metadata.clearinghouse to "sandbox" for testing.`
      );
  }
}
