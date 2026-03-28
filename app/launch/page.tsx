"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import FHIR from "fhirclient";
import { getSmartAuthorizeParams, getStandaloneLaunchParams } from "@/lib/fhir/smart-config";

/**
 * SMART on FHIR Launch Endpoint
 *
 * EHR Launch: The EHR navigates here with ?iss=<fhir-base>&launch=<opaque-token>
 * Standalone:  Navigate here with ?iss=<fhir-base> (no launch param)
 *
 * This page initiates the OAuth 2.0 authorization flow via fhirclient.
 * After EHR user authorization, the browser redirects to /launch/callback.
 */

function LaunchHandler() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const iss = searchParams.get("iss");
    const launch = searchParams.get("launch");

    if (!iss) {
      setError(
        "Missing required 'iss' parameter. This page must be launched from an EHR or with a FHIR server URL."
      );
      return;
    }

    // Determine launch type and authorize
    const params = launch
      ? getSmartAuthorizeParams(iss, launch)
      : getStandaloneLaunchParams(iss);

    FHIR.oauth2.authorize(params).catch((err: Error) => {
      console.error("SMART authorization failed:", err);
      setError(`Authorization failed: ${err.message}`);
    });
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">EHR Launch Error</h1>
          <p className="text-sm text-text-muted">{error}</p>
          <a
            href="/app/login"
            className="inline-block text-sm text-emerald-400 hover:text-emerald-300 underline"
          >
            Go to manual login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-muted">Connecting to EHR...</p>
      </div>
    </div>
  );
}

export default function LaunchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg-primary">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LaunchHandler />
    </Suspense>
  );
}
