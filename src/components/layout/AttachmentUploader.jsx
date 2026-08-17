import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, X, Upload } from "lucide-react";

// Kept in sync with the kadr-issue-report-attachments bucket's own file_size_limit /
// allowed_mime_types (see 20260817170457_add_issue_report_attachments_bucket_and_column.sql)
// - this is a UX-layer check, the bucket itself is the real backstop.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

const formatSize = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
};

// Files are only held here (never uploaded) until the parent form actually submits - so
// "remove" is just a local splice, no storage cleanup/orphan concern to manage.
export default function AttachmentUploader({ files, onFilesChange, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState("");
  const fileInputRef = useRef(null);
  const previewUrlsRef = useRef(new Map());

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const getPreviewUrl = (file) => {
    if (!previewUrlsRef.current.has(file)) {
      previewUrlsRef.current.set(file, URL.createObjectURL(file));
    }
    return previewUrlsRef.current.get(file);
  };

  const addFiles = useCallback((incomingFiles) => {
    const accepted = [];
    let error = "";

    for (const file of incomingFiles) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        error = `"${file.name}" isn't a supported file type. Attach a PNG, JPEG, WEBP, or PDF.`;
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        error = `"${file.name}" is larger than the 10 MB attachment limit. Please email it directly to the program administrator instead of attaching it here.`;
        continue;
      }
      accepted.push(file);
    }

    setValidationError(error);
    if (accepted.length > 0) {
      onFilesChange([...(files || []), ...accepted]);
    }
  }, [files, onFilesChange]);

  const handleBrowseChange = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length > 0) addFiles(picked);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) addFiles(dropped);
  };

  const handlePaste = useCallback((e) => {
    if (disabled) return;
    const items = Array.from(e.clipboardData?.items || []);
    const pastedImages = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (pastedImages.length > 0) {
      addFiles(pastedImages);
    }
  }, [disabled, addFiles]);

  const removeFile = (fileToRemove) => {
    const url = previewUrlsRef.current.get(fileToRemove);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(fileToRemove);
    }
    onFilesChange((files || []).filter((f) => f !== fileToRemove));
  };

  return (
    <div className="space-y-2" onPaste={handlePaste}>
      <div
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        <Upload className="w-5 h-5 text-slate-400 dark:text-slate-500" />
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Drop a screenshot or PDF, click to browse, or paste (Ctrl/Cmd+V) a screenshot anywhere in this form
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_MIME_TYPES.join(",")}
          onChange={handleBrowseChange}
          className="hidden"
        />
      </div>

      {validationError && (
        <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{validationError}</p>
      )}

      {files && files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative group">
              {file.type.startsWith("image/") ? (
                <img
                  src={getPreviewUrl(file)}
                  alt={file.name}
                  className="w-16 h-16 object-cover rounded-md border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1">
                  <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate w-full text-center">{formatSize(file.size)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(file)}
                disabled={disabled}
                className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full w-4 h-4 flex items-center justify-center"
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
