"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";

interface DenialItem {
  id: string;
  denialDate: string;
  reasonCode: string | null;
  reasonCategory: string;
  reasonDescription: string | null;
  payerNotes: string | null;
  priorAuth: {
    id: string;
    referenceNumber: string;
    status: string;
    urgency: string;
    serviceType: string | null;
    patientName: string;
    patientMrn: string;
    payerName: string | null;
    payerId: string | null;
  };
  latestAppeal: {
    id: string;
    status: string;
    appealLevel: string;
    filedDate: string;
    decisionDate: string | null;
  } | null;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface PayerOption {
  id: string;
  name: string;
}

const REASON_CATEGORY_OPTIONS = [
  { value: "medical_necessity", label: "Medical Necessity" },
  { value: "incomplete_documentation", label: "Incomplete Documentation" },
  { value: "out_of_network", label: "Out of Network" },
  { value: "service_not_covered", label: "Service Not Covered" },
  { value: "missing_precert", label: "Missing Pre-certification" },
  { value: "coding_error", label: "Coding Error" },
  { value: "other", label: "Other" },
];

const APPEAL_STATUS_OPTIONS = [
  { value: "none", label: "No Appeal" },
  { value: "pending", label: "Appeal Pending" },
  { value: "won", label: "Appeal Won" },
  { value: "lost", label: "Appeal Lost" },
];

const denialCategoryLabels: Record<string, string> = {
  medical_necessity: "Medical Necessity",
  incomplete_documentation: "Incomplete Docs",
  out_of_network: "Out of Network",
  service_not_covered: "Not Covered",
  missing_precert: "Missing Pre-Cert",
  coding_error: "Coding Error",
  other: "Other",
};

const appealStatusConfig: Record<string, { variant: "default" | "success" | "warning" | "danger" | "info"; label: string }> = {
  draft: { variant: "default", label: "Draft" },
  filed: { variant: "info", label: "Filed" },
  in_review: { variant: "warning", label: "In Review" },
  won: { variant: "success", label: "Won" },
  lost: { variant: "danger", label: "Lost" },
  withdrawn: { variant: "default", label: "Withdrawn" },
};

const appealLevelLabels: Record<string, string> = {
  first: "1st Level",
  second: "2nd Level",
  external_review: "External",
};

export default function DenialsPage() {
  return (
    <Suspense fallback={<DenialsTableSkeleton />}>
      <DenialsPageContent />
    </Suspense>
  );
}

function DenialsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [reasonCategory, setReasonCategory] = useState(searchParams.get("reasonCategory") || "");
  const [payerId, setPayerId] = useState(searchParams.get("payerId") || "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") || "");
  const [appealStatus, setAppealStatus] = useState(searchParams.get("appealStatus") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const [denials, setDenials] = useState<DenialItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [reasonCategoryCounts, setReasonCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [payers, setPayers] = useState<PayerOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fetch payers for filter
  useEffect(() => {
    async function fetchPayers() {
      try {
        const res = await fetch("/api/payers");
        if (res.ok) {
          const data = await res.json();
          setPayers(data.payers);
        }
      } catch {
        // Payer filter just won't be available
      }
    }
    fetchPayers();
  }, []);

  const updateUrl = useCallback(
    (overrides: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      const values: Record<string, string> = {
        search,
        reasonCategory,
        payerId,
        dateFrom,
        dateTo,
        appealStatus,
        page: String(page),
        ...overrides,
      };
      for (const [key, value] of Object.entries(values)) {
        if (value && !(key === "page" && value === "1")) {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.push(`/app/denials${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [search, reasonCategory, payerId, dateFrom, dateTo, appealStatus, page, router]
  );

  const fetchDenials = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (search) params.set("search", search);
      if (reasonCategory) params.set("reasonCategory", reasonCategory);
      if (payerId) params.set("payerId", payerId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (appealStatus) params.set("appealStatus", appealStatus);

      const res = await fetch(`/api/denials?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch denials");
      const data = await res.json();
      setDenials(data.denials);
      setPagination(data.pagination);
      if (data.reasonCategoryCounts) setReasonCategoryCounts(data.reasonCategoryCounts);
    } catch {
      setDenials([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, reasonCategory, payerId, dateFrom, dateTo, appealStatus]);

  useEffect(() => {
    fetchDenials();
  }, [fetchDenials]);

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

  const handleFilterChange = (key: string, value: string) => {
    const setters: Record<string, (v: string) => void> = {
      reasonCategory: setReasonCategory,
      payerId: setPayerId,
      dateFrom: setDateFrom,
      dateTo: setDateTo,
      appealStatus: setAppealStatus,
    };
    setters[key]?.(value);
    setPage(1);
    updateUrl({ [key]: value, page: "1" });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: String(newPage) });
  };

  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setReasonCategory("");
    setPayerId("");
    setDateFrom("");
    setDateTo("");
    setAppealStatus("");
    setPage(1);
    router.push("/app/denials", { scroll: false });
  };

  const hasActiveFilters = search || reasonCategory || payerId || dateFrom || dateTo || appealStatus;

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const totalDenials = Object.values(reasonCategoryCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Denials</h1>
        <p className="text-text-secondary mt-1">
          Denial management and appeal tracking
          {pagination && (
            <span className="text-text-muted ml-2">({pagination.totalCount} denials)</span>
          )}
        </p>
      </div>

      {/* Reason Category Quick Filters */}
      {totalDenials > 0 && (
        <div className="flex flex-wrap gap-2">
          {REASON_CATEGORY_OPTIONS.map((opt) => {
            const count = reasonCategoryCounts[opt.value] || 0;
            if (count === 0) return null;
            const isActive = reasonCategory === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleFilterChange("reasonCategory", isActive ? "" : opt.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                  isActive
                    ? "bg-red-500/20 border-red-500/50 text-red-300"
                    : "bg-white/5 border-white/10 text-text-secondary hover:bg-white/10"
                }`}
              >
                {denialCategoryLabels[opt.value] || opt.value}
                <span className="text-text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search and Filter Bar */}
      <Card variant="glass" padding="md">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by reference number or patient name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full"
              />
            </div>
            <Button
              variant={hasActiveFilters ? "primary" : "secondary"}
              size="md"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
              </svg>
              Filters
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="md" onClick={clearFilters}>
                Clear All
              </Button>
            )}
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/10">
              <Select
                label="Reason Category"
                options={REASON_CATEGORY_OPTIONS}
                placeholder="All Categories"
                value={reasonCategory}
                onChange={(e) => handleFilterChange("reasonCategory", e.target.value)}
              />
              <Select
                label="Payer"
                options={payers.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="All Payers"
                value={payerId}
                onChange={(e) => handleFilterChange("payerId", e.target.value)}
              />
              <Select
                label="Appeal Status"
                options={APPEAL_STATUS_OPTIONS}
                placeholder="All"
                value={appealStatus}
                onChange={(e) => handleFilterChange("appealStatus", e.target.value)}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 [color-scheme:dark]"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Results */}
      <Card variant="glass" padding="none">
        {loading ? (
          <DenialsTableSkeleton />
        ) : denials.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No denials found"
            description={
              hasActiveFilters
                ? "Try adjusting your filters or search terms."
                : "No denied prior authorization requests yet."
            }
          >
            {hasActiveFilters && (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Payer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Denial Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Denial Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">PA Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Appeal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {denials.map((denial) => (
                    <tr
                      key={denial.id}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => router.push(`/app/requests/${denial.priorAuth.id}`)}
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/app/requests/${denial.priorAuth.id}`}
                          className="text-sm font-mono text-emerald-400 hover:text-emerald-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {denial.priorAuth.referenceNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{denial.priorAuth.patientName}</p>
                          <p className="text-xs text-text-muted">MRN: {denial.priorAuth.patientMrn}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{denial.priorAuth.payerName || "—"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <Badge variant="danger" size="sm">
                            {denialCategoryLabels[denial.reasonCategory] || denial.reasonCategory}
                          </Badge>
                          {denial.reasonCode && (
                            <p className="text-xs text-text-muted mt-1 font-mono">{denial.reasonCode}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{formatDate(denial.denialDate)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={denial.priorAuth.status} />
                      </td>
                      <td className="px-6 py-4">
                        {denial.latestAppeal ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={appealStatusConfig[denial.latestAppeal.status]?.variant || "default"}
                              size="sm"
                            >
                              {appealStatusConfig[denial.latestAppeal.status]?.label || denial.latestAppeal.status}
                            </Badge>
                            <span className="text-xs text-text-muted">
                              {appealLevelLabels[denial.latestAppeal.appealLevel] || ""}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">No appeal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-white/5">
              {denials.map((denial) => (
                <div
                  key={denial.id}
                  className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => router.push(`/app/requests/${denial.priorAuth.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <Link
                      href={`/app/requests/${denial.priorAuth.id}`}
                      className="text-sm font-mono text-emerald-400 hover:text-emerald-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {denial.priorAuth.referenceNumber}
                    </Link>
                    <StatusBadge status={denial.priorAuth.status} />
                  </div>
                  <p className="text-sm font-medium text-text-primary">{denial.priorAuth.patientName}</p>
                  <p className="text-xs text-text-muted mb-2">MRN: {denial.priorAuth.patientMrn}</p>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="danger" size="sm">
                      {denialCategoryLabels[denial.reasonCategory] || denial.reasonCategory}
                    </Badge>
                    {denial.priorAuth.payerName && (
                      <span className="text-xs text-text-secondary">{denial.priorAuth.payerName}</span>
                    )}
                  </div>
                  {denial.reasonDescription && (
                    <p className="text-xs text-text-secondary line-clamp-2 mb-2">{denial.reasonDescription}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>Denied: {formatDate(denial.denialDate)}</span>
                    {denial.latestAppeal ? (
                      <Badge
                        variant={appealStatusConfig[denial.latestAppeal.status]?.variant || "default"}
                        size="sm"
                      >
                        Appeal: {appealStatusConfig[denial.latestAppeal.status]?.label || denial.latestAppeal.status}
                      </Badge>
                    ) : (
                      <span>No appeal</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
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

function DenialsTableSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-4">
          <div className="h-4 w-28 bg-white/10 rounded" />
          <div className="h-4 w-32 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-5 w-28 bg-white/10 rounded-full" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-5 w-20 bg-white/10 rounded-full" />
          <div className="h-5 w-16 bg-white/10 rounded-full" />
        </div>
      ))}
    </div>
  );
}
