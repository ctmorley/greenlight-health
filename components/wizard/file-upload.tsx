"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface UploadedFile {
  id?: string;
  file?: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  category: string;
  uploading?: boolean;
  uploaded?: boolean;
  error?: string;
}

interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  requestId?: string;
  disabled?: boolean;
}

const CATEGORY_OPTIONS = [
  { value: "clinical_notes", label: "Clinical Notes" },
  { value: "imaging_order", label: "Imaging Order" },
  { value: "lab_results", label: "Lab Results" },
  { value: "referral", label: "Referral" },
  { value: "medical_records", label: "Medical Records" },
  { value: "letter_of_necessity", label: "Letter of Medical Necessity" },
  { value: "other", label: "Other" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ files, onFilesChange, requestId, disabled }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (newFiles: FileList) => {
      const fileArray = Array.from(newFiles).map((f) => ({
        file: f,
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type,
        category: "other",
        uploading: false,
        uploaded: false,
      }));
      onFilesChange([...files, ...fileArray]);
    },
    [files, onFilesChange]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const updateCategory = (index: number, category: string) => {
    const updated = [...files];
    updated[index] = { ...updated[index], category };
    onFilesChange(updated);
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
  };

  const uploadFile = async (index: number) => {
    if (!requestId) return;

    const fileEntry = files[index];
    if (!fileEntry.file || fileEntry.uploaded) return;

    const updated = [...files];
    updated[index] = { ...updated[index], uploading: true, error: undefined };
    onFilesChange(updated);

    try {
      const formData = new FormData();
      formData.append("file", fileEntry.file);
      formData.append("category", fileEntry.category);

      const res = await fetch(`/api/requests/${requestId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      const newFiles = [...files];
      newFiles[index] = {
        ...newFiles[index],
        id: data.id,
        uploading: false,
        uploaded: true,
      };
      onFilesChange(newFiles);
    } catch (err) {
      const newFiles = [...files];
      newFiles[index] = {
        ...newFiles[index],
        uploading: false,
        error: err instanceof Error ? err.message : "Upload failed",
      };
      onFilesChange(newFiles);
    }
  };

  const uploadAllPending = async () => {
    for (let i = 0; i < files.length; i++) {
      if (!files[i].uploaded && files[i].file) {
        await uploadFile(i);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-white/10 hover:border-white/20 hover:bg-white/5"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.tiff,.bmp,.txt,.rtf,.csv,.xls,.xlsx"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
            <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary">
            <span className="text-emerald-400 font-medium">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-text-muted">PDF, DOC, DOCX, images, and more (max 10MB each)</p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">{files.length} file{files.length !== 1 ? "s" : ""}</p>
            {requestId && files.some((f) => !f.uploaded && f.file) && (
              <Button type="button" variant="secondary" size="sm" onClick={uploadAllPending}>
                Upload All
              </Button>
            )}
          </div>

          {files.map((f, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                f.uploaded
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : f.error
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-white/5 border-white/10"
              }`}
            >
              {/* File icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{f.fileName}</p>
                <p className="text-xs text-text-muted">{formatFileSize(f.fileSize)}</p>
                {f.error && <p className="text-xs text-red-400 mt-0.5">{f.error}</p>}
              </div>

              {/* Category selector */}
              <div className="w-44 flex-shrink-0">
                <Select
                  options={CATEGORY_OPTIONS}
                  value={f.category}
                  onChange={(e) => updateCategory(index, e.target.value)}
                  placeholder="Category"
                />
              </div>

              {/* Status / Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {f.uploading ? (
                  <svg className="animate-spin h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : f.uploaded ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : requestId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => uploadFile(index)}>
                    Upload
                  </Button>
                ) : null}

                {!f.uploaded && (
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-text-muted hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
