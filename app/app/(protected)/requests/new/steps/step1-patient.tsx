"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WizardState, PatientResult, PatientDetail } from "../types";

interface Step1PatientProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onPatientSelected: () => void;
}

export function Step1Patient({ state, setState, onPatientSelected }: Step1PatientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    mrn: "",
    dob: "",
    gender: "unknown",
    phone: "",
    email: "",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  // Search patients
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.patients);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectPatient = async (patient: PatientResult, autoAdvance = true) => {
    // Fetch full patient detail with insurance
    try {
      const res = await fetch(`/api/patients/${patient.id}`);
      if (!res.ok) throw new Error("Failed to fetch patient");
      const detail: PatientDetail = await res.json();
      setState((prev) => ({
        ...prev,
        patientId: detail.id,
        patientDetail: detail,
        // Auto-populate insurance if available
        insuranceId: detail.insurances?.[0]?.id || "",
        payerId: detail.insurances?.[0]?.payer?.id || "",
      }));
      if (autoAdvance) onPatientSelected();
    } catch {
      // Fallback: just set ID
      setState((prev) => ({
        ...prev,
        patientId: patient.id,
        patientDetail: null,
      }));
      if (autoAdvance) onPatientSelected();
    }
  };

  const handleCreatePatient = async () => {
    setCreateErrors({});

    // Validate — only name and DOB are required per contract
    const errors: Record<string, string> = {};
    if (!createForm.firstName.trim()) errors.firstName = "First name is required";
    if (!createForm.lastName.trim()) errors.lastName = "Last name is required";
    if (!createForm.dob) errors.dob = "Date of birth is required";

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    setCreating(true);
    try {
      // Normalize empty optional strings to null before POST
      const payload = {
        ...createForm,
        mrn: createForm.mrn.trim() || null,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
      };

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.details) {
          setCreateErrors(
            Object.fromEntries(
              Object.entries(data.details).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])
            )
          );
        } else {
          setCreateErrors({ _form: data.error || "Failed to create patient" });
        }
        return;
      }

      const newPatient = await res.json();
      // Fetch the full detail — selectPatient with autoAdvance=true already calls onPatientSelected
      await selectPatient({ id: newPatient.id, name: newPatient.name, mrn: newPatient.mrn, dob: newPatient.dob }, true);
      setShowCreateForm(false);
    } catch {
      setCreateErrors({ _form: "Failed to create patient" });
    } finally {
      setCreating(false);
    }
  };

  const clearPatient = () => {
    setState((prev) => ({
      ...prev,
      patientId: "",
      patientDetail: null,
      insuranceId: "",
      payerId: "",
    }));
  };

  // If patient is already selected, show summary
  if (state.patientId && state.patientDetail) {
    const p = state.patientDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold font-display text-text-primary">Selected Patient</h2>
          <Button variant="ghost" size="sm" onClick={clearPatient}>
            Change Patient
          </Button>
        </div>
        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 font-bold text-sm">
                {p.firstName[0]}{p.lastName[0]}
              </span>
            </div>
            <div>
              <p className="text-text-primary font-medium">{p.name}</p>
              <p className="text-sm text-text-muted">MRN: {p.mrn} | DOB: {new Date(p.dob).toLocaleDateString()}</p>
            </div>
          </div>
          {p.insurances.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-500/10">
              <p className="text-xs text-text-muted mb-1">Insurance</p>
              {p.insurances.map((ins) => (
                <p key={ins.id} className="text-sm text-text-secondary">
                  {ins.payer.name} - {ins.planName} ({ins.planType.toUpperCase()})
                  {ins.isPrimary && <Badge variant="success" className="ml-2">Primary</Badge>}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-text-primary">Select Patient</h2>

      {/* Search */}
      <div>
        <Input
          label="Search by name or MRN"
          placeholder="Type patient name or MRN to search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searching && <p className="text-xs text-text-muted mt-2">Searching...</p>}

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p)}
                className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{p.name}</p>
                    <p className="text-xs text-text-muted">
                      MRN: {p.mrn} | DOB: {new Date(p.dob).toLocaleDateString()}
                    </p>
                  </div>
                  {p.primaryInsurance && (
                    <span className="text-xs text-text-secondary">{p.primaryInsurance.payerName}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
          <p className="text-sm text-text-muted mt-3">No patients found matching &ldquo;{searchQuery}&rdquo;</p>
        )}
      </div>

      {/* Create new patient toggle */}
      <div className="border-t border-white/10 pt-4">
        <Button
          variant={showCreateForm ? "secondary" : "outline"}
          size="md"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "Create New Patient"}
        </Button>
      </div>

      {/* Create patient form */}
      {showCreateForm && (
        <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-semibold text-text-primary">New Patient</h3>
          {createErrors._form && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {createErrors._form}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First Name *"
              value={createForm.firstName}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, firstName: e.target.value }))}
              error={createErrors.firstName}
            />
            <Input
              label="Last Name *"
              value={createForm.lastName}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, lastName: e.target.value }))}
              error={createErrors.lastName}
            />
            <Input
              label="MRN"
              placeholder="Auto-generated if blank"
              value={createForm.mrn}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, mrn: e.target.value }))}
              error={createErrors.mrn}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">Date of Birth *</label>
              <input
                type="date"
                value={createForm.dob}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, dob: e.target.value }))}
                className={`w-full px-4 py-2.5 rounded-lg bg-white/5 border ${
                  createErrors.dob ? "border-red-500/50" : "border-white/10"
                } text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 [color-scheme:dark]`}
              />
              {createErrors.dob && <p className="text-xs text-red-400">{createErrors.dob}</p>}
            </div>
            <Select
              label="Gender"
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
                { value: "unknown", label: "Unknown" },
              ]}
              value={createForm.gender}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, gender: e.target.value }))}
            />
            <Input
              label="Phone"
              type="tel"
              value={createForm.phone}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleCreatePatient} isLoading={creating}>
              Create & Select Patient
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
