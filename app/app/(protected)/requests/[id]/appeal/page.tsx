"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface RequestInfo {
  id: string;
  referenceNumber: string;
  status: string;
  patient: { name: string; mrn: string };
  payer: { name: string } | null;
  denials: {
    id: string;
    denialDate: string;
    reasonCode: string | null;
    reasonCategory: string;
    reasonDescription: string | null;
    payerNotes: string | null;
  }[];
  appeals: {
    id: string;
    appealLevel: string;
    status: string;
  }[];
}

interface UploadedFile {
  file: File;
  category: string;
}

const APPEAL_LEVEL_OPTIONS = [
  { value: "first", label: "First Level Appeal" },
  { value: "second", label: "Second Level Appeal" },
  { value: "external_review", label: "External Review" },
];

const DOCUMENT_CATEGORY_OPTIONS = [
  { value: "clinical_notes", label: "Clinical Notes" },
  { value: "imaging_order", label: "Imaging Order" },
  { value: "lab_results", label: "Lab Results" },
  { value: "referral", label: "Referral" },
  { value: "medical_records", label: "Medical Records" },
  { value: "letter_of_necessity", label: "Letter of Necessity" },
  { value: "other", label: "Other" },
];

const denialCategoryLabels: Record<string, string> = {
  medical_necessity: "Medical Necessity",
  incomplete_documentation: "Incomplete Documentation",
  out_of_network: "Out of Network",
  service_not_covered: "Service Not Covered",
  missing_precert: "Missing Pre-certification",
  coding_error: "Coding Error",
  other: "Other",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppealPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedDenialId, setSelectedDenialId] = useState("");
  const [appealLevel, setAppealLevel] = useState("first");
  const [appealReason, setAppealReason] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchRequest = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${params.id}`);
      if (!res.ok) throw new Error("Request not found");
      const data = await res.json();
      setRequest(data);

      // Auto-select the most recent denial
      if (data.denials?.length > 0) {
        setSelectedDenialId(data.denials[0].id);
      }

      // Suggest appeal level based on existing appeals
      if (data.appeals?.length > 0) {
        const existingLevels = data.appeals.map((a: { appealLevel: string }) => a.appealLevel);
        if (existingLevels.includes("first") && !existingLevels.includes("second")) {
          setAppealLevel("second");
        } else if (existingLevels.includes("second")) {
          setAppealLevel("external_review");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load request");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchRequest();
  }, [params.id, fetchRequest]);

  // File handling
  const addFiles = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const uploadedFiles: UploadedFile[] = fileArray.map((file) => ({
      file,
      category: "other",
    }));
    setFiles((prev) => [...prev, ...uploadedFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileCategory = (index: number, category: string) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, category } : f))
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedDenialId) {
      setFormError("Please select a denial to appeal");
      return;
    }
    if (!appealReason.trim() || appealReason.trim().length < 10) {
      setFormError("Appeal reason must be at least 10 characters");
      return;
    }

    setSubmitting(true);
    try {
      // 1. File the appeal
      const res = await fetch(`/api/requests/${params.id}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          denialId: selectedDenialId,
          appealLevel,
          appealReason: appealReason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to file appeal");
      }

      // 2. Upload supporting documents if any — fail fast on errors
      if (files.length > 0) {
        const failedUploads: string[] = [];
        for (const uploadFile of files) {
          const formData = new FormData();
          formData.append("file", uploadFile.file);
          formData.append("category", uploadFile.category);

          const uploadRes = await fetch(`/api/requests/${params.id}/documents`, {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) {
            failedUploads.push(uploadFile.file.name);
          }
        }

        if (failedUploads.length > 0) {
          const msg = `Appeal was filed, but ${failedUploads.length} document(s) failed to upload: ${failedUploads.join(", ")}. Please upload them manually from the request detail page.`;
          setFormError(msg);
          addToast(msg, "error");
          setSubmitting(false);
          // Don't set success — let user see the warning and navigate manually
          return;
        }
      }

      setSuccess(true);
      addToast("Appeal filed successfully", "success");
      // Redirect back to detail page after a moment
      setTimeout(() => {
        router.push(`/app/requests/${params.id}`);
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to file appeal";
      setFormError(msg);
      addToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-32 bg-white/10 rounded animate-pulse" />
        <Card variant="glass" padding="md">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-white/10 rounded" />
            <div className="h-4 w-64 bg-white/5 rounded" />
            <div className="h-32 bg-white/5 rounded-xl" />
          </div>
        </Card>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </Button>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-red-400">
            <p>{error || "Request not found"}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (request.status !== "denied") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/app/requests/${params.id}`)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Request
        </Button>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-amber-400">
            <div className="text-center">
              <p className="font-medium">Cannot file an appeal</p>
              <p className="text-sm text-text-secondary mt-1">
                This request has status <StatusBadge status={request.status} /> — only denied requests can be appealed.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (request.denials.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/app/requests/${params.id}`)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Request
        </Button>
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-center h-48 text-amber-400">
            <p>No denial records found for this request.</p>
          </div>
        </Card>
      </div>
    );
  }

  const selectedDenial = request.denials.find((d) => d.id === selectedDenialId);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push(`/app/requests/${params.id}`)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Request
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">File Appeal</h1>
        <p className="text-text-secondary mt-1">
          <span className="font-mono text-text-primary">{request.referenceNumber}</span>
          <span className="text-text-muted mx-2">|</span>
          {request.patient.name} (MRN: {request.patient.mrn})
          {request.payer && (
            <>
              <span className="text-text-muted mx-2">|</span>
              {request.payer.name}
            </>
          )}
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <Card variant="glass" padding="md" className="border-emerald-500/20">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-emerald-300">Appeal filed successfully!</p>
              <p className="text-xs text-text-secondary">Redirecting to request detail...</p>
            </div>
          </div>
        </Card>
      )}

      {/* Denial Context */}
      <Card variant="glass" padding="md" className="border-red-500/20">
        <CardTitle className="mb-4">
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Denial Details
          </span>
        </CardTitle>

        {request.denials.length > 1 && (
          <div className="mb-4">
            <Select
              label="Select Denial"
              options={request.denials.map((d) => ({
                value: d.id,
                label: `${denialCategoryLabels[d.reasonCategory] || d.reasonCategory} — ${new Date(d.denialDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
              }))}
              value={selectedDenialId}
              onChange={(e) => setSelectedDenialId(e.target.value)}
            />
          </div>
        )}

        {selectedDenial && (
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="danger" size="md">
                {denialCategoryLabels[selectedDenial.reasonCategory] || selectedDenial.reasonCategory}
              </Badge>
              {selectedDenial.reasonCode && (
                <span className="text-xs font-mono text-text-muted">{selectedDenial.reasonCode}</span>
              )}
              <span className="text-xs text-text-muted">
                {new Date(selectedDenial.denialDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
            {selectedDenial.reasonDescription && (
              <p className="text-sm text-text-secondary">{selectedDenial.reasonDescription}</p>
            )}
            {selectedDenial.payerNotes && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-xs text-text-muted">Payer Notes</p>
                <p className="text-sm text-text-secondary italic">{selectedDenial.payerNotes}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Appeal Form */}
      {!success && (
        <Card variant="glass" padding="md">
          <CardTitle className="mb-4">
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9.75m.75-9H8.25M2.25 6v10.5a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 2.25 6Z" />
              </svg>
              Appeal Information
            </span>
          </CardTitle>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="Appeal Level *"
              options={APPEAL_LEVEL_OPTIONS}
              value={appealLevel}
              onChange={(e) => setAppealLevel(e.target.value)}
            />

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Appeal Reason *
              </label>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Explain why this denial should be overturned. Include any additional clinical justification, new evidence, or references to payer guidelines..."
                rows={6}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 resize-none"
                maxLength={5000}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-text-muted">Minimum 10 characters</span>
                <span className="text-xs text-text-muted">{appealReason.length}/5000</span>
              </div>
            </div>

            {/* Supporting Documents Upload */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Supporting Documents <span className="text-text-muted">(optional)</span>
              </label>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200
                  ${dragOver
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  }
                `}
              >
                <svg className="w-8 h-8 mx-auto text-text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-text-secondary">
                  Drag and drop files here, or <span className="text-emerald-400">click to browse</span>
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Upload supporting evidence for your appeal (clinical notes, letters, etc.)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((uploadFile, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                    >
                      <svg className="w-5 h-5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{uploadFile.file.name}</p>
                        <p className="text-xs text-text-muted">{formatFileSize(uploadFile.file.size)}</p>
                      </div>
                      <Select
                        options={DOCUMENT_CATEGORY_OPTIONS}
                        value={uploadFile.category}
                        onChange={(e) => updateFileCategory(index, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 text-text-muted hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{formError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                size="md"
                type="button"
                onClick={() => router.push(`/app/requests/${params.id}`)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                type="submit"
                isLoading={submitting}
                disabled={!selectedDenialId || appealReason.trim().length < 10}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
                File Appeal
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
