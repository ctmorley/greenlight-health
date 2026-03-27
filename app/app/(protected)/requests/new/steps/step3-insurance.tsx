"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WizardState, PayerOption, PhysicianOption, PayerRulesResult } from "../types";

interface Step3InsuranceProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function Step3Insurance({ state, setState }: Step3InsuranceProps) {
  const [payers, setPayers] = useState<PayerOption[]>([]);
  const [physicians, setPhysicians] = useState<PhysicianOption[]>([]);
  const [rulesResult, setRulesResult] = useState<PayerRulesResult | null>(null);
  const [checkingRules, setCheckingRules] = useState(false);

  // Load payers
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payers");
        if (res.ok) {
          const data = await res.json();
          setPayers(data.payers);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Load physicians
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/physicians");
        if (res.ok) {
          const data = await res.json();
          setPhysicians(data.physicians);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Check PA requirement when payer or service changes
  useEffect(() => {
    if (!state.payerId || !state.serviceCategory) {
      setRulesResult(null);
      return;
    }

    const controller = new AbortController();
    (async () => {
      setCheckingRules(true);
      try {
        const params = new URLSearchParams({ serviceCategory: state.serviceCategory });
        if (state.cptCodes.length > 0) {
          params.set("cptCodes", state.cptCodes.join(","));
        }
        const res = await fetch(`/api/payers/${state.payerId}/rules?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setRulesResult(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Rules check error:", err);
        }
      } finally {
        setCheckingRules(false);
      }
    })();

    return () => controller.abort();
  }, [state.payerId, state.serviceCategory, state.cptCodes]);

  const patientInsurances = state.patientDetail?.insurances || [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-text-primary">Insurance & Payer</h2>

      {/* Insurance selection */}
      {patientInsurances.length > 0 ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text-secondary">Select Insurance *</label>
          {patientInsurances.map((ins) => (
            <button
              key={ins.id}
              type="button"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  insuranceId: ins.id,
                  payerId: ins.payer.id,
                  payerName: ins.payer.name,
                }))
              }
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                state.insuranceId === ins.id
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{ins.payer.name}</p>
                  <p className="text-xs text-text-muted">
                    {ins.planName} ({ins.planType.toUpperCase()}) | Member: {ins.memberId}
                    {ins.groupNumber ? ` | Group: ${ins.groupNumber}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {ins.isPrimary && <Badge variant="success">Primary</Badge>}
                  {state.insuranceId === ins.id && (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Select
            label="Payer *"
            options={payers.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Select payer"
            value={state.payerId}
            onChange={(e) => {
              const selectedPayer = payers.find((p) => p.id === e.target.value);
              setState((prev) => ({
                ...prev,
                payerId: e.target.value,
                payerName: selectedPayer?.name || "",
              }));
            }}
          />
          <p className="text-sm text-amber-400">
            No insurance on file for this patient. Select a payer manually.
          </p>
        </div>
      )}

      {/* PA Requirement Check */}
      {state.payerId && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">PA Requirement Check</h3>
          {checkingRules ? (
            <p className="text-sm text-text-muted">Checking requirements...</p>
          ) : rulesResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={rulesResult.requiresPA ? "warning" : "success"} size="md">
                  {rulesResult.requiresPA ? "PA Required" : "PA Not Required"}
                </Badge>
                <span className="text-sm text-text-muted">
                  Avg response: {rulesResult.payer.avgResponseDays} days
                </span>
              </div>
              {rulesResult.payer.rbmVendor && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">RBM Routing:</span>
                  <Badge variant="info" size="md">
                    {rulesResult.payer.rbmVendor.toUpperCase()}
                  </Badge>
                </div>
              )}
              {rulesResult.payer.electronicSubmission && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <span className="text-xs text-emerald-400">Electronic submission supported</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Select a service category to check PA requirements.</p>
          )}
        </div>
      )}

      {/* Ordering Physician & Other Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Ordering Physician"
          options={physicians.map((p) => ({
            value: p.id,
            label: `${p.name}${p.npiNumber ? ` (NPI: ${p.npiNumber})` : ""}`,
          }))}
          placeholder="Select physician"
          value={state.orderingPhysicianId}
          onChange={(e) => {
            const selectedPhysician = physicians.find((p) => p.id === e.target.value);
            setState((prev) => ({
              ...prev,
              orderingPhysicianId: e.target.value,
              orderingPhysicianName: selectedPhysician
                ? `${selectedPhysician.name}${selectedPhysician.npiNumber ? ` (NPI: ${selectedPhysician.npiNumber})` : ""}`
                : "",
            }));
          }}
        />
        <Input
          label="Rendering Physician NPI"
          placeholder="NPI number"
          value={state.renderingPhysicianNpi}
          onChange={(e) => setState((prev) => ({ ...prev, renderingPhysicianNpi: e.target.value }))}
        />
        <Input
          label="Facility Name"
          placeholder="Facility where procedure will be performed"
          value={state.facilityName}
          onChange={(e) => setState((prev) => ({ ...prev, facilityName: e.target.value }))}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">Scheduled Date</label>
          <input
            type="date"
            value={state.scheduledDate}
            onChange={(e) => setState((prev) => ({ ...prev, scheduledDate: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 [color-scheme:dark]"
          />
        </div>
      </div>
    </div>
  );
}
