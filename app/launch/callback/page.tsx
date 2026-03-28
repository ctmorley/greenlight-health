"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import FHIR from "fhirclient";
import { extractFhirContext } from "@/lib/fhir/fhir-mappers";
import { FHIR_CONTEXT_KEY } from "@/lib/fhir/types";

/**
 * SMART on FHIR OAuth Callback
 *
 * This page completes the OAuth 2.0 flow:
 * 1. Calls FHIR.oauth2.ready() to exchange the auth code for tokens
 * 2. Uses the authenticated client to fetch patient data from the EHR
 * 3. Maps FHIR resources to GreenLight format
 * 4. Stores the result in sessionStorage
 * 5. Redirects to the PA wizard with ?source=ehr
 */

function CallbackHandler() {
  const router = useRouter();
  const [status, setStatus] = useState("Completing authorization...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function completeAuth() {
      try {
        // Step 1: Complete OAuth token exchange
        setStatus("Completing authorization...");
        const client = await FHIR.oauth2.ready();

        // Step 2: Extract FHIR data from the EHR
        setStatus("Reading patient data from EHR...");
        const fhirContext = await extractFhirContext(client);

        // Step 3: Store in sessionStorage for the wizard
        setStatus("Preparing auto-fill data...");
        sessionStorage.setItem(
          FHIR_CONTEXT_KEY,
          JSON.stringify(fhirContext)
        );

        // Step 4: Record FHIR session server-side (best-effort, don't block)
        fetch("/api/fhir/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fhirBaseUrl: fhirContext.fhirBaseUrl,
            patientId: fhirContext.patientId,
            scopes: client.state.scope || "",
          }),
        }).catch(() => { /* non-blocking */ });

        // Step 5: Redirect to wizard
        setStatus("Redirecting to PA wizard...");
        router.replace("/app/requests/new?source=ehr");
      } catch (err) {
        console.error("SMART callback failed:", err);
        const message =
          err instanceof Error ? err.message : "Unknown error during EHR connection";
        setError(message);
      }
    }

    completeAuth();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary p-6">
        <div className="max-w-lg w-full text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">EHR Connection Failed</h1>
          <p className="text-sm text-text-muted">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="text-sm text-text-secondary hover:text-text-primary underline"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.assign("/app/requests/new")}
              className="text-sm text-emerald-400 hover:text-emerald-300 underline"
            >
              Continue without EHR data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-muted">{status}</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg-primary">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
