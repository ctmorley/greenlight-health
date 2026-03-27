"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

interface Insurance {
  id: string;
  planName: string;
  planType: string;
  memberId: string;
  groupNumber: string | null;
  isPrimary: boolean;
  effectiveDate: string;
  terminationDate: string | null;
  payer: { id: string; name: string };
}

interface PARequest {
  id: string;
  referenceNumber: string;
  status: string;
  urgency: string;
  serviceCategory: string | null;
  serviceType: string | null;
  cptCodes: string[];
  payer: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  dueDate: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
}

interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  mrn: string;
  dob: string;
  gender: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  organization: { id: string; name: string };
  createdAt: string;
  insurances: Insurance[];
  requests: PARequest[];
}

const serviceTypeLabels: Record<string, string> = {
  mri: "MRI",
  ct: "CT",
  pet_ct: "PET/CT",
  ultrasound: "Ultrasound",
  xray: "X-Ray",
  fluoroscopy: "Fluoroscopy",
  mammography: "Mammography",
  dexa: "DEXA",
  nuclear: "Nuclear",
  surgical_procedure: "Surgical",
  medical_procedure: "Medical",
};

const planTypeLabels: Record<string, string> = {
  hmo: "HMO",
  ppo: "PPO",
  epo: "EPO",
  pos: "POS",
  medicaid: "Medicaid",
  medicare: "Medicare",
  tricare: "TRICARE",
  other: "Other",
};

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPatient() {
      try {
        const res = await fetch(`/api/patients/${params.id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Patient not found");
          throw new Error("Failed to fetch patient");
        }
        const data = await res.json();
        setPatient(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchPatient();
  }, [params.id]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatGender = (g: string) => {
    const labels: Record<string, string> = {
      male: "Male",
      female: "Female",
      other: "Other",
      unknown: "Unknown",
    };
    return labels[g] || g;
  };

  if (loading) return <PatientDetailSkeleton />;

  if (error || !patient) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/app/patients")}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Patients
        </Button>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-red-400">
            <p>{error || "Patient not found"}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/app/patients")}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Patients
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">{patient.name}</h1>
          <p className="text-text-secondary mt-1">
            MRN: <span className="font-mono">{patient.mrn}</span>
            <span className="text-text-muted mx-2">|</span>
            {patient.organization.name}
          </p>
        </div>
      </div>

      {/* Patient Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demographics */}
        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">Demographics</CardTitle>
          <div className="grid grid-cols-2 gap-4">
            <InfoField label="First Name" value={patient.firstName} />
            <InfoField label="Last Name" value={patient.lastName} />
            <InfoField label="Date of Birth" value={formatDate(patient.dob)} />
            <InfoField label="Gender" value={formatGender(patient.gender)} />
            <InfoField label="Phone" value={patient.phone || "—"} />
            <InfoField label="Email" value={patient.email || "—"} />
            <InfoField label="Address" value={patient.address || "—"} className="col-span-2" />
            <InfoField label="Patient Since" value={formatDate(patient.createdAt)} />
          </div>
        </Card>

        {/* Insurance */}
        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">Insurance</CardTitle>
          {patient.insurances.length === 0 ? (
            <p className="text-sm text-text-muted">No insurance records on file.</p>
          ) : (
            <div className="space-y-4">
              {patient.insurances.map((ins) => (
                <div
                  key={ins.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text-primary">{ins.payer.name}</p>
                    <Badge variant={ins.isPrimary ? "success" : "default"} size="sm">
                      {ins.isPrimary ? "Primary" : "Secondary"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoField label="Plan" value={ins.planName} small />
                    <InfoField label="Type" value={planTypeLabels[ins.planType] || ins.planType} small />
                    <InfoField label="Member ID" value={ins.memberId} small />
                    <InfoField label="Group #" value={ins.groupNumber || "—"} small />
                    <InfoField label="Effective" value={formatDate(ins.effectiveDate)} small />
                    <InfoField
                      label="Terminates"
                      value={ins.terminationDate ? formatDate(ins.terminationDate) : "Active"}
                      small
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* PA Requests History */}
      <Card variant="glass" padding="none">
        <div className="px-6 py-4 border-b border-white/10">
          <CardTitle>Prior Authorization History ({patient.requests.length})</CardTitle>
        </div>

        {patient.requests.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No PA Requests"
            description="This patient has no prior authorization requests yet."
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Payer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Due Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {patient.requests.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => router.push(`/app/requests/${req.id}`)}
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-emerald-400">{req.referenceNumber}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">
                          {req.serviceType ? (serviceTypeLabels[req.serviceType] || req.serviceType) : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{req.payer?.name || "—"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{formatDate(req.createdAt)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{formatDate(req.dueDate)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-white/5">
              {patient.requests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => router.push(`/app/requests/${req.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-mono text-emerald-400">{req.referenceNumber}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                    <span>{req.serviceType ? (serviceTypeLabels[req.serviceType] || req.serviceType) : "—"}</span>
                    <span className="text-text-muted">|</span>
                    <span>{req.payer?.name || "—"}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-text-muted">
                    <span>Created: {formatDate(req.createdAt)}</span>
                    {req.dueDate && <span>Due: {formatDate(req.dueDate)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function InfoField({
  label,
  value,
  className = "",
  small = false,
}: {
  label: string;
  value: string;
  className?: string;
  small?: boolean;
}) {
  return (
    <div className={className}>
      <p className={`text-text-muted ${small ? "text-[10px]" : "text-xs"} mb-0.5`}>{label}</p>
      <p className={`text-text-primary ${small ? "text-xs" : "text-sm"}`}>{value}</p>
    </div>
  );
}

function PatientDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 bg-white/10 rounded animate-pulse" />
      <div className="animate-pulse space-y-2">
        <div className="h-8 w-48 bg-white/10 rounded" />
        <div className="h-4 w-64 bg-white/10 rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="glass" padding="md">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-28 bg-white/10 rounded mb-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 w-full bg-white/5 rounded" />
            ))}
          </div>
        </Card>
        <Card variant="glass" padding="md">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-28 bg-white/10 rounded mb-4" />
            <div className="h-24 w-full bg-white/5 rounded-xl" />
          </div>
        </Card>
      </div>
      <Card variant="glass" padding="md">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 bg-white/10 rounded mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-full bg-white/5 rounded" />
          ))}
        </div>
      </Card>
    </div>
  );
}
