"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DocumentsIcon, DocumentIcon } from "./icons";
import { categoryLabels, formatFileSize } from "./helpers";
import type { DocumentEntry } from "./types";

function DocumentTextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string>("Loading...");
  useEffect(() => {
    fetch(url)
      .then((res) => res.text())
      .then((t) => setText(t))
      .catch(() => setText("Failed to load text content"));
  }, [url]);
  return (
    <pre
      className="p-4 text-sm text-text-secondary font-mono whitespace-pre-wrap overflow-auto max-h-[60vh]"
      data-testid="document-preview-text"
    >
      {text}
    </pre>
  );
}

interface DocumentsCardProps {
  requestId: string;
  documents: DocumentEntry[];
}

export function DocumentsCard({ requestId, documents }: DocumentsCardProps) {
  const [previewDoc, setPreviewDoc] = useState<DocumentEntry | null>(null);

  return (
    <>
      <Card variant="glass" padding="md">
        <CardTitle className="mb-4" data-testid="documents-section-heading">
          <span className="flex items-center gap-2">
            <DocumentsIcon />
            Documents
            {documents.length > 0 && (
              <span className="text-xs font-normal text-text-muted ml-1">
                ({documents.length})
              </span>
            )}
          </span>
        </CardTitle>
        {documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors"
              >
                <div
                  className="flex items-center gap-3 flex-1 cursor-pointer"
                  onClick={() => setPreviewDoc(doc)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPreviewDoc(doc); }}
                  data-testid={`doc-preview-${doc.id}`}
                >
                  <DocumentIcon />
                  <div>
                    <p className="text-sm text-text-primary font-medium">{doc.fileName}</p>
                    <p className="text-xs text-text-muted">
                      {categoryLabels[doc.category] || doc.category} · {formatFileSize(doc.fileSize)} · {doc.uploadedBy}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-sky-500/10"
                    data-testid={`doc-view-${doc.id}`}
                  >
                    View
                  </button>
                  <a
                    href={`/api/requests/${requestId}/documents/${doc.id}`}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-500/10"
                    download
                    data-testid={`doc-download-${doc.id}`}
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No documents attached</p>
        )}
      </Card>

      {/* Document Preview Modal */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.fileName || "Document Preview"}
        size="lg"
      >
        {previewDoc && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{categoryLabels[previewDoc.category] || previewDoc.category} · {formatFileSize(previewDoc.fileSize)}</span>
              <a
                href={`/api/requests/${requestId}/documents/${previewDoc.id}`}
                download
                className="text-emerald-400 hover:text-emerald-300 font-medium"
              >
                Download File
              </a>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5" data-testid="document-preview-container">
              {previewDoc.fileType === "application/pdf" ? (
                <iframe
                  src={`/api/requests/${requestId}/documents/${previewDoc.id}?disposition=inline#toolbar=1`}
                  className="w-full h-[60vh] bg-white rounded-xl"
                  title={`Preview: ${previewDoc.fileName}`}
                  data-testid="document-preview-pdf"
                />
              ) : previewDoc.fileType.startsWith("image/") ? (
                <div className="flex items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/requests/${requestId}/documents/${previewDoc.id}?disposition=inline`}
                    alt={previewDoc.fileName}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg"
                    data-testid="document-preview-image"
                  />
                </div>
              ) : previewDoc.fileType.startsWith("text/") ? (
                <DocumentTextPreview
                  url={`/api/requests/${requestId}/documents/${previewDoc.id}?disposition=inline`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted" data-testid="document-preview-unsupported">
                  <DocumentIcon />
                  <p className="mt-3 text-sm">Preview not available for this file type</p>
                  <p className="text-xs mt-1">({previewDoc.fileType})</p>
                  <a
                    href={`/api/requests/${requestId}/documents/${previewDoc.id}`}
                    download
                    className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 font-medium px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                  >
                    Download to view
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
