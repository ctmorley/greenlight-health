"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface EhrConnection {
  id: string;
  label: string;
  vendor: string;
  fhirBaseUrl: string;
  scopes: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const VENDOR_LABELS: Record<string, string> = {
  epic: "Epic",
  oracle_health: "Oracle Health",
  meditech: "MEDITECH",
  athenahealth: "athenahealth",
  veradigm: "Veradigm",
  eclinicalworks: "eClinicalWorks",
  other: "Other",
};

const VENDOR_COLORS: Record<string, string> = {
  epic: "bg-red-500/10 text-red-400 border-red-500/20",
  oracle_health: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  meditech: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  athenahealth: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  other: "bg-white/10 text-text-secondary border-white/10",
};

export function EhrConnectionsTab() {
  const [connections, setConnections] = useState<EhrConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fhir/session");
        if (!res.ok) throw new Error("Failed to fetch connections");
        const data = await res.json();
        setConnections(data.connections);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-white/10 rounded" />
        <div className="h-32 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-display text-text-primary">EHR Connections</h2>
          <p className="text-sm text-text-muted mt-1">
            SMART on FHIR connections to Electronic Health Record systems
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* How it works */}
      <Card variant="glass" padding="md">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center mt-0.5">
            <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">SMART on FHIR Integration</h3>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              EHR connections are established automatically when GreenLight is launched from within an EHR system.
              The connection records below track which FHIR servers your organization has connected to and the data scopes granted.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="info" size="md">FHIR R4</Badge>
              <Badge variant="info" size="md">OAuth 2.0 + PKCE</Badge>
              <Badge variant="info" size="md">SMART v2.2</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Connection List */}
      {connections.length === 0 ? (
        <Card variant="glass" padding="lg">
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">No EHR Connections</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Connections will appear here after GreenLight is launched from an EHR system via SMART on FHIR.
              To test, use the standalone launch with a FHIR sandbox.
            </p>
            <Button
              variant="outline"
              size="md"
              className="mt-4"
              onClick={() => {
                window.open(
                  "/launch?iss=https://launch.smarthealthit.org/v/r4/fhir",
                  "_blank"
                );
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Test with SMART Sandbox
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <Card key={conn.id} variant="glass" padding="md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary truncate">{conn.label}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${VENDOR_COLORS[conn.vendor] || VENDOR_COLORS.other}`}>
                        {VENDOR_LABELS[conn.vendor] || conn.vendor}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted truncate mt-0.5">{conn.fhirBaseUrl}</p>
                    {conn.scopes && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {conn.scopes.split(" ").filter((s) => s.includes("/")).slice(0, 6).map((scope) => (
                          <span key={scope} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted font-mono">
                            {scope}
                          </span>
                        ))}
                        {conn.scopes.split(" ").filter((s) => s.includes("/")).length > 6 && (
                          <span className="text-[9px] text-text-muted">
                            +{conn.scopes.split(" ").filter((s) => s.includes("/")).length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {conn.lastUsedAt && (
                    <p className="text-xs text-text-muted">
                      Last used: {new Date(conn.lastUsedAt).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Connected: {new Date(conn.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Supported EHR vendors */}
      <Card variant="glass" padding="md">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Supported EHR Vendors</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(VENDOR_LABELS).filter(([k]) => k !== "other").map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
              <div className={`w-2 h-2 rounded-full ${key === "epic" ? "bg-red-400" : key === "oracle_health" ? "bg-sky-400" : key === "meditech" ? "bg-purple-400" : key === "athenahealth" ? "bg-amber-400" : "bg-white/30"}`} />
              <span className="text-xs text-text-secondary">{label}</span>
              <Badge variant="info" size="sm" className="ml-auto">FHIR R4</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
