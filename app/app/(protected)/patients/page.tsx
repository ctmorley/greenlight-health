"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  mrn: string;
  dob: string;
  gender: string;
  phone: string | null;
  email: string | null;
  primaryInsurance: {
    planName: string;
    payerName: string;
    memberId: string;
  } | null;
  paCount: number;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="p-6 space-y-4">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="animate-pulse h-12 bg-white/5 rounded" />))}</div>}>
      <PatientsPageContent />
    </Suspense>
  );
}

function PatientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUrl = useCallback(
    (overrides: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      const values = { search, page: String(page), ...overrides };
      if (values.search) params.set("search", values.search);
      if (values.page && values.page !== "1") params.set("page", values.page);
      const qs = params.toString();
      router.push(`/app/patients${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [search, page, router]
  );

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (search) params.set("search", search);

      const res = await fetch(`/api/patients?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch patients");
      const data = await res.json();
      setPatients(data.patients);
      setPagination(data.pagination);
    } catch {
      setPatients([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
        updateUrl({ search: searchInput, page: "1" });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateUrl]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: String(newPage) });
  };

  const formatDate = (iso: string) => {
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
      unknown: "—",
    };
    return labels[g] || g;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Patients</h1>
        <p className="text-text-secondary mt-1">
          Patient directory and records
          {pagination && (
            <span className="text-text-muted ml-2">({pagination.totalCount} total)</span>
          )}
        </p>
      </div>

      {/* Search */}
      <Card variant="glass" padding="md">
        <Input
          placeholder="Search by name, MRN, or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </Card>

      {/* Results */}
      <Card variant="glass" padding="none">
        {loading ? (
          <PatientsTableSkeleton />
        ) : patients.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No results found"
            description={
              search
                ? "Try adjusting your search terms."
                : "No patients in the directory yet."
            }
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      MRN
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      DOB
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Gender
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Primary Insurance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      PA Count
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => router.push(`/app/patients/${patient.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{patient.name}</p>
                          {patient.email && (
                            <p className="text-xs text-text-muted">{patient.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-text-secondary">{patient.mrn}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{formatDate(patient.dob)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{formatGender(patient.gender)}</span>
                      </td>
                      <td className="px-6 py-4">
                        {patient.primaryInsurance ? (
                          <div>
                            <p className="text-sm text-text-primary">{patient.primaryInsurance.payerName}</p>
                            <p className="text-xs text-text-muted">{patient.primaryInsurance.planName}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={patient.paCount > 0 ? "info" : "default"}>
                          {patient.paCount} PA{patient.paCount !== 1 ? "s" : ""}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-white/5">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => router.push(`/app/patients/${patient.id}`)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-medium text-text-primary">{patient.name}</p>
                    <Badge variant={patient.paCount > 0 ? "info" : "default"} size="sm">
                      {patient.paCount} PA{patient.paCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted mb-2">MRN: {patient.mrn}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                    <span>DOB: {formatDate(patient.dob)}</span>
                    <span>{formatGender(patient.gender)}</span>
                    {patient.primaryInsurance && (
                      <span>{patient.primaryInsurance.payerName}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && (
              <div className="px-6 py-4 border-t border-white/10">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalCount={pagination.totalCount}
                  pageSize={pagination.pageSize}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function PatientsTableSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-4">
          <div className="h-4 w-36 bg-white/10 rounded" />
          <div className="h-4 w-20 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-4 w-16 bg-white/10 rounded" />
          <div className="h-4 w-32 bg-white/10 rounded" />
          <div className="h-5 w-16 bg-white/10 rounded-full" />
        </div>
      ))}
    </div>
  );
}
