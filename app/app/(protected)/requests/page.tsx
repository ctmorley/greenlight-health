"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";

interface PARequest {
  id: string;
  referenceNumber: string;
  status: string;
  urgency: string;
  serviceCategory: string | null;
  serviceType: string | null;
  cptCodes: string[];
  patient: { id: string; name: string; mrn: string };
  payer: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  dueDate: string | null;
  submittedAt: string | null;
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

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "partially_approved", label: "Partially Approved" },
  { value: "denied", label: "Denied" },
  { value: "appealed", label: "Appealed" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const SERVICE_CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "imaging", label: "Imaging" },
  { value: "surgical", label: "Surgical" },
  { value: "medical", label: "Medical" },
];

const SERVICE_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "mri", label: "MRI" },
  { value: "ct", label: "CT" },
  { value: "pet_ct", label: "PET/CT" },
  { value: "ultrasound", label: "Ultrasound" },
  { value: "xray", label: "X-Ray" },
  { value: "fluoroscopy", label: "Fluoroscopy" },
  { value: "mammography", label: "Mammography" },
  { value: "dexa", label: "DEXA" },
  { value: "nuclear", label: "Nuclear" },
  { value: "surgical_procedure", label: "Surgical Procedure" },
  { value: "medical_procedure", label: "Medical Procedure" },
];

const URGENCY_OPTIONS = [
  { value: "", label: "All Urgencies" },
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "emergent", label: "Emergent" },
];

const SORT_OPTIONS = [
  { value: "createdAt", label: "Date Created" },
  { value: "dueDate", label: "Due Date" },
  { value: "status", label: "Status" },
  { value: "patientName", label: "Patient Name" },
];

const urgencyConfig: Record<string, { variant: "default" | "success" | "warning" | "danger" | "info" | "outline"; label: string }> = {
  routine: { variant: "default", label: "Routine" },
  urgent: { variant: "warning", label: "Urgent" },
  emergent: { variant: "danger", label: "Emergent" },
};

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

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="p-6 space-y-4">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="animate-pulse h-12 bg-white/5 rounded" />))}</div>}>
      <RequestsPageContent />
    </Suspense>
  );
}

function RequestsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State from URL params
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statuses, setStatuses] = useState<string[]>(
    searchParams.get("status")?.split(",").filter(Boolean) || []
  );
  const [serviceCategory, setServiceCategory] = useState(searchParams.get("serviceCategory") || "");
  const [serviceType, setServiceType] = useState(searchParams.get("serviceType") || "");
  const [payerId, setPayerId] = useState(searchParams.get("payerId") || "");
  const [urgency, setUrgency] = useState(searchParams.get("urgency") || "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "createdAt");
  const [sortOrder, setSortOrder] = useState(searchParams.get("sortOrder") || "desc");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const [requests, setRequests] = useState<PARequest[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [payers, setPayers] = useState<PayerOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(search);

  // Fetch payers for the filter dropdown
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

  // Build URL params and push to router
  const updateUrl = useCallback(
    (overrides: Record<string, string | string[]> = {}) => {
      const params = new URLSearchParams();
      const values: Record<string, string> = {
        search,
        status: statuses.join(","),
        serviceCategory,
        serviceType,
        payerId,
        urgency,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
        page: String(page),
        ...Object.fromEntries(
          Object.entries(overrides).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v])
        ),
      };

      for (const [key, value] of Object.entries(values)) {
        if (value && value !== "1" && key === "page") {
          params.set(key, value);
        } else if (value && key !== "page") {
          params.set(key, value);
        }
      }

      const qs = params.toString();
      router.push(`/app/requests${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [search, statuses, serviceCategory, serviceType, payerId, urgency, dateFrom, dateTo, sortBy, sortOrder, page, router]
  );

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (search) params.set("search", search);
      if (statuses.length > 0) params.set("status", statuses.join(","));
      if (serviceCategory) params.set("serviceCategory", serviceCategory);
      if (serviceType) params.set("serviceType", serviceType);
      if (payerId) params.set("payerId", payerId);
      if (urgency) params.set("urgency", urgency);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/requests?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch requests");
      const data = await res.json();
      setRequests(data.requests);
      setPagination(data.pagination);
      if (data.statusCounts) setStatusCounts(data.statusCounts);
    } catch {
      setRequests([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, statuses, serviceCategory, serviceType, payerId, urgency, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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

  const handleStatusChange = (newStatuses: string[]) => {
    setStatuses(newStatuses);
    setPage(1);
    updateUrl({ status: newStatuses, page: "1" });
  };

  const handleFilterChange = (key: string, value: string) => {
    const setters: Record<string, (v: string) => void> = {
      serviceCategory: setServiceCategory,
      serviceType: setServiceType,
      payerId: setPayerId,
      urgency: setUrgency,
      dateFrom: setDateFrom,
      dateTo: setDateTo,
    };
    setters[key]?.(value);
    setPage(1);
    updateUrl({ [key]: value, page: "1" });
  };

  const handleSortChange = (newSortBy: string) => {
    if (newSortBy === sortBy) {
      const newOrder = sortOrder === "desc" ? "asc" : "desc";
      setSortOrder(newOrder);
      updateUrl({ sortOrder: newOrder });
    } else {
      setSortBy(newSortBy);
      setSortOrder("desc");
      updateUrl({ sortBy: newSortBy, sortOrder: "desc" });
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: String(newPage) });
  };

  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setStatuses([]);
    setServiceCategory("");
    setServiceType("");
    setPayerId("");
    setUrgency("");
    setDateFrom("");
    setDateTo("");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
    router.push("/app/requests", { scroll: false });
  };

  const hasActiveFilters =
    search || statuses.length > 0 || serviceCategory || serviceType || payerId || urgency || dateFrom || dateTo;

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text-primary">PA Requests</h1>
          <p className="text-text-secondary mt-1">
            Manage prior authorization requests
            {pagination && (
              <span className="text-text-muted ml-2">({pagination.totalCount} total)</span>
            )}
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => router.push("/app/requests/new")}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New PA Request
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <Card variant="glass" padding="md">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1">
              <Input
                placeholder="Search by reference number, patient name, or MRN..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Filter toggle */}
            <Button
              variant={hasActiveFilters ? "primary" : "secondary"}
              size="md"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
              </svg>
              Filters
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </Button>

            {hasActiveFilters && (
              <Button variant="ghost" size="md" onClick={clearFilters}>
                Clear All
              </Button>
            )}
          </div>

          {/* Expanded Filters */}
          {filtersOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/10">
              <MultiSelect
                label="Status"
                options={STATUS_OPTIONS}
                selected={statuses}
                onChange={handleStatusChange}
                placeholder="All Statuses"
              />

              <Select
                label="Service Category"
                options={SERVICE_CATEGORY_OPTIONS.slice(1)}
                placeholder="All Categories"
                value={serviceCategory}
                onChange={(e) => handleFilterChange("serviceCategory", e.target.value)}
              />

              <Select
                label="Service Type"
                options={SERVICE_TYPE_OPTIONS.slice(1)}
                placeholder="All Types"
                value={serviceType}
                onChange={(e) => handleFilterChange("serviceType", e.target.value)}
              />

              <Select
                label="Payer"
                options={payers.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="All Payers"
                value={payerId}
                onChange={(e) => handleFilterChange("payerId", e.target.value)}
              />

              <Select
                label="Urgency"
                options={URGENCY_OPTIONS.slice(1)}
                placeholder="All Urgencies"
                value={urgency}
                onChange={(e) => handleFilterChange("urgency", e.target.value)}
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

              <Select
                label="Sort By"
                options={SORT_OPTIONS}
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Bulk Status Indicators */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const count = statusCounts[opt.value] || 0;
            if (count === 0) return null;
            const isActive = statuses.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => {
                  const newStatuses = isActive
                    ? statuses.filter((s) => s !== opt.value)
                    : [...statuses, opt.value];
                  handleStatusChange(newStatuses);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                  isActive
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-white/5 border-white/10 text-text-secondary hover:bg-white/10"
                }`}
              >
                <StatusBadge status={opt.value} />
                <span className="text-text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Results Table */}
      <Card variant="glass" padding="none">
        {loading ? (
          <RequestsTableSkeleton />
        ) : requests.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No results found"
            description={
              hasActiveFilters
                ? "Try adjusting your filters or search terms."
                : "No prior authorization requests yet."
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
                    {[
                      { key: "referenceNumber", label: "Reference" },
                      { key: "patientName", label: "Patient", sortable: true },
                      { key: "serviceType", label: "Service" },
                      { key: "payer", label: "Payer" },
                      { key: "status", label: "Status", sortable: true },
                      { key: "urgency", label: "Urgency" },
                      { key: "createdAt", label: "Created", sortable: true },
                      { key: "dueDate", label: "Due Date", sortable: true },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={`px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider ${
                          col.sortable !== false ? "cursor-pointer hover:text-text-secondary" : ""
                        }`}
                        onClick={() => col.sortable !== false && handleSortChange(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {sortBy === col.key && (
                            <svg
                              className={`w-3 h-3 ${sortOrder === "asc" ? "rotate-180" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {requests.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => router.push(req.status === "draft" ? `/app/requests/new?draft=${req.id}` : `/app/requests/${req.id}`)}
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={req.status === "draft" ? `/app/requests/new?draft=${req.id}` : `/app/requests/${req.id}`}
                          className="text-sm font-mono text-emerald-400 hover:text-emerald-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {req.referenceNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{req.patient.name}</p>
                          <p className="text-xs text-text-muted">MRN: {req.patient.mrn}</p>
                        </div>
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
                        <Badge variant={urgencyConfig[req.urgency]?.variant || "default"}>
                          {urgencyConfig[req.urgency]?.label || req.urgency}
                        </Badge>
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
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => router.push(req.status === "draft" ? `/app/requests/new?draft=${req.id}` : `/app/requests/${req.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <Link
                      href={req.status === "draft" ? `/app/requests/new?draft=${req.id}` : `/app/requests/${req.id}`}
                      className="text-sm font-mono text-emerald-400 hover:text-emerald-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {req.referenceNumber}
                    </Link>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-sm font-medium text-text-primary">{req.patient.name}</p>
                  <p className="text-xs text-text-muted mb-2">MRN: {req.patient.mrn}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span>{req.serviceType ? (serviceTypeLabels[req.serviceType] || req.serviceType) : "—"}</span>
                    <span className="text-text-muted">|</span>
                    <span>{req.payer?.name || "—"}</span>
                    <span className="text-text-muted">|</span>
                    <Badge variant={urgencyConfig[req.urgency]?.variant || "default"} size="sm">
                      {urgencyConfig[req.urgency]?.label || req.urgency}
                    </Badge>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-text-muted">
                    <span>Created: {formatDate(req.createdAt)}</span>
                    {req.dueDate && <span>Due: {formatDate(req.dueDate)}</span>}
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

function RequestsTableSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-4">
          <div className="h-4 w-28 bg-white/10 rounded" />
          <div className="h-4 w-32 bg-white/10 rounded" />
          <div className="h-4 w-20 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-5 w-20 bg-white/10 rounded-full" />
          <div className="h-5 w-16 bg-white/10 rounded-full" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}
