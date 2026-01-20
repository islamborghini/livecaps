/**
 * RAG Upload Component
 * 
 * Provides a UI for uploading presentation files to enable RAG-based
 * transcript correction. Supports drag & drop and file picker.
 * 
 * Features:
 * - Drag & drop zone for PDF, PPTX, DOCX, TXT, MD files
 * - Upload progress indication
 * - Success state showing indexed term count
 * - Clear/replace functionality
 * - Compact mode for header integration
 */

"use client";

import { useState, useCallback, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import { useRAG } from "@/app/hooks/useRAG";

// ============================================================================
// Types
// ============================================================================

interface RAGUploadProps {
  /** Compact mode for header/toolbar integration */
  compact?: boolean;
  /** Called when upload completes */
  onUploadComplete?: (sessionId: string, termCount: number) => void;
  /** Called when session is cleared */
  onSessionCleared?: () => void;
  /** Custom class names */
  className?: string;
}

interface UploadResult {
  success: boolean;
  sessionId: string;
  terms: {
    indexed: number;
    categories: Record<string, number>;
    samples?: Record<string, string[]>;
  };
}

/** Represents an uploaded file with its session */
interface UploadedFile {
  id: string;
  fileName: string;
  sessionId: string;
  termsCount: number;
  samples?: Record<string, string[]>;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_FILES = 5;

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".pptx", ".docx", ".txt", ".md"];

// ============================================================================
// Component
// ============================================================================

export function RAGUpload({
  compact = false,
  onUploadComplete,
  onSessionCleared,
  className = "",
}: RAGUploadProps) {
  const {
    sessionId,
    sessionInfo,
    isUploading,
    isReady,
    error,
    upload,
    clearSession,
    refreshSessionInfo,
    setSessionId: setRAGSessionId,
  } = useRAG({ debug: true });

  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [sampleTerms, setSampleTerms] = useState<Record<string, string[]> | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<string>("");
  const [isStreamUploading, setIsStreamUploading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; termsCount?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Compute total terms across all uploaded files
  const totalTerms = uploadedFiles.reduce((sum, f) => sum + f.termsCount, 0);
  // Compute combined sample terms from all files
  const combinedSampleTerms = uploadedFiles.reduce((acc, file) => {
    if (file.samples) {
      Object.entries(file.samples).forEach(([category, terms]) => {
        if (!acc[category]) acc[category] = [];
        acc[category].push(...terms.filter(t => !acc[category].includes(t)));
      });
    }
    return acc;
  }, {} as Record<string, string[]>);
  // Override isReady to check if we have any uploaded files
  const hasFiles = uploadedFiles.length > 0;

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Listen for keyboard shortcut to toggle debug panel (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /**
   * Handle file selection/drop - uses streaming upload for progress
   */
  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;

      // Check max files limit
      if (uploadedFiles.length >= MAX_FILES) {
        setToast({
          type: 'error',
          message: `Maximum ${MAX_FILES} files allowed. Remove a file first.`
        });
        return;
      }

      // Check if file already uploaded
      if (uploadedFiles.some(f => f.fileName === file.name)) {
        setToast({
          type: 'error',
          message: `File "${file.name}" already uploaded.`
        });
        return;
      }

      // Validate file type
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setToast({
          type: 'error',
          message: `Unsupported file type: ${ext}`
        });
        return;
      }

      setIsStreamUploading(true);
      setUploadProgress(0);
      setUploadStage("Starting...");

      try {
        // Use streaming endpoint for progress updates
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/rag/upload-stream", {
          method: "POST",
          body: formData,
        });

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === "progress") {
                  setUploadProgress(data.progress || 0);
                  setUploadStage(data.message || "Processing...");
                } else if (data.type === "complete" && data.data) {
                  const result = data.data as UploadResult;
                  
                  console.log("🔍 Complete data received:", JSON.stringify(result, null, 2));
                  
                  // Add to uploaded files list
                  const newFile: UploadedFile = {
                    id: result.sessionId,
                    fileName: file.name,
                    sessionId: result.sessionId,
                    termsCount: result.terms.indexed,
                    samples: result.terms.samples,
                  };
                  setUploadedFiles(prev => [...prev, newFile]);
                  
                  // IMPORTANT: Set the session ID in the hook so it knows we have a session
                  setRAGSessionId(result.sessionId);
                  
                  // Auto-show debug panel when terms are indexed
                  if (result.terms?.samples && Object.keys(result.terms.samples).length > 0) {
                    console.log("✅ File uploaded:", file.name, "with", result.terms.indexed, "terms");
                    setShowDebug(true);
                  }
                  
                  // Refresh session info with explicit sessionId
                  await refreshSessionInfo(result.sessionId);
                  
                  // Show success toast
                  setToast({
                    type: 'success',
                    message: 'Success',
                    termsCount: result.terms.indexed
                  });
                  
                  onUploadComplete?.(result.sessionId, result.terms.indexed);
                } else if (data.type === "error") {
                  throw new Error(data.message || "Upload failed");
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } catch (error) {
        console.error("Upload error:", error);
        // Show error toast instead of alert
        setToast({
          type: 'error',
          message: error instanceof Error ? error.message : "Upload failed. Please try again."
        });
      } finally {
        setIsStreamUploading(false);
        setUploadProgress(0);
        setUploadStage("");
      }
    },
    [onUploadComplete, refreshSessionInfo, setRAGSessionId, uploadedFiles]
  );

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        // Upload multiple files (up to remaining slots)
        const remainingSlots = MAX_FILES - uploadedFiles.length;
        const filesToUpload = Math.min(files.length, remainingSlots);
        for (let i = 0; i < filesToUpload; i++) {
          handleFile(files[i]);
        }
        if (files.length > remainingSlots) {
          setToast({
            type: 'error',
            message: `Only ${remainingSlots} more file(s) can be added (max ${MAX_FILES}).`
          });
        }
      }
    },
    [handleFile, uploadedFiles.length]
  );

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        // Upload multiple files (up to remaining slots)
        const remainingSlots = MAX_FILES - uploadedFiles.length;
        const filesToUpload = Math.min(files.length, remainingSlots);
        for (let i = 0; i < filesToUpload; i++) {
          handleFile(files[i]);
        }
        if (files.length > remainingSlots) {
          setToast({
            type: 'error',
            message: `Only ${remainingSlots} more file(s) can be added (max ${MAX_FILES}).`
          });
        }
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [handleFile, uploadedFiles.length]
  );

  /**
   * Trigger file picker
   */
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Remove a single file from the list
   */
  const handleRemoveFile = useCallback(async (fileId: string) => {
    const fileToRemove = uploadedFiles.find(f => f.id === fileId);
    if (!fileToRemove) return;
    
    // Delete the session from the server
    try {
      await fetch(`/api/rag/session?sessionId=${encodeURIComponent(fileToRemove.sessionId)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
    
    // Remove from local state
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    
    // If this was the last file, notify parent
    if (uploadedFiles.length === 1) {
      onSessionCleared?.();
    }
  }, [uploadedFiles, onSessionCleared]);

  /**
   * Clear all sessions
   */
  const handleClearAll = useCallback(async () => {
    // Delete all sessions
    for (const file of uploadedFiles) {
      try {
        await fetch(`/api/rag/session?sessionId=${encodeURIComponent(file.sessionId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    }
    
    await clearSession();
    setUploadedFiles([]);
    setSampleTerms(null);
    setShowDebug(false);
    onSessionCleared?.();
  }, [clearSession, onSessionCleared, uploadedFiles]);

  // ==========================================================================
  // Render: Compact Mode
  // ==========================================================================

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        {/* Toast Notification */}
        {toast && (
          <div 
            className={`absolute bottom-full left-0 right-0 mb-2 z-50 animate-in slide-in-from-top-2 fade-in duration-300 ${
              toast.type === 'success' 
                ? 'bg-gradient-to-r from-teal-500 to-cyan-500' 
                : 'bg-gradient-to-r from-red-500 to-rose-500'
            } text-white text-xs rounded-lg shadow-lg overflow-hidden`}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              {toast.type === 'success' ? (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="font-medium truncate">{toast.message}</span>
              <button 
                onClick={() => setToast(null)} 
                className="ml-auto text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Auto-dismiss progress bar */}
            <div className="h-0.5 bg-white/20">
              <div 
                className="h-full bg-white/60 animate-shrink-x" 
                style={{ animation: 'shrink-x 5s linear forwards' }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            multiple
            onChange={handleInputChange}
            className="hidden"
          />

        {hasFiles ? (
          // Files uploaded - show status and file list
          <div className="flex items-center gap-2">
            {/* Progress bar when uploading additional files */}
            {(isUploading || isStreamUploading) ? (
              <div className="flex flex-col gap-1 min-w-[120px]">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800">
                  <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="truncate">{uploadStage || "Processing..."}</span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDebug(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-800/50 transition-colors cursor-pointer"
                title="Click to view indexed terms (Ctrl+Shift+D)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} • {totalTerms} terms</span>
              </button>
            )}
            {uploadedFiles.length < MAX_FILES && !(isUploading || isStreamUploading) && (
              <button
                onClick={openFilePicker}
                className="p-1.5 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors"
                title={`Add more files (${MAX_FILES - uploadedFiles.length} remaining)`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            {!(isUploading || isStreamUploading) && (
              <button
                onClick={handleClearAll}
                className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                title="Clear all files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ) : (isUploading || isStreamUploading) ? (
          // Uploading with progress bar
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800">
                <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="truncate">{uploadStage || "Processing..."}</span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          // No session - show upload button
          <button
            onClick={openFilePicker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Content
          </button>
        )}
        </div>

        {/* Hidden Debug Panel - Toggle with click or Ctrl+Shift+D */}
        {showDebug && (
          <div className="absolute top-full left-0 mt-2 z-50 w-80 max-h-[28rem] overflow-auto rounded-lg bg-gray-900 text-gray-100 shadow-2xl border border-gray-700 text-xs font-mono">
            <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
              <span className="font-semibold text-teal-400">📚 Uploaded Files ({uploadedFiles.length}/{MAX_FILES})</span>
              <button
                onClick={() => setShowDebug(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            {/* File List */}
            {uploadedFiles.length > 0 && (
              <div className="p-2 border-b border-gray-700 space-y-1">
                {uploadedFiles.map((file) => (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-gray-800/50 hover:bg-gray-800"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate text-gray-300" title={file.fileName}>
                        {file.fileName.length > 20 ? file.fileName.slice(0, 20) + '...' : file.fileName}
                      </span>
                      <span className="text-gray-500 text-[10px] flex-shrink-0">
                        {file.termsCount} terms
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remove file"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Sample Terms */}
            {Object.keys(combinedSampleTerms).length > 0 ? (
              <div className="p-3 space-y-3">
                <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-2">Sample Terms</div>
                {Object.entries(combinedSampleTerms).map(([category, terms]) => (
                  <div key={category}>
                    <div className="text-teal-400 font-semibold mb-1 capitalize">
                      {category} ({terms.length}{terms.length >= 10 ? "+" : ""})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {terms.slice(0, 15).map((term, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300"
                        >
                          {term}
                        </span>
                      ))}
                      {terms.length > 15 && (
                        <span className="px-1.5 py-0.5 text-gray-500">+{terms.length - 15} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-400">
                <p>No sample terms available.</p>
                <p className="text-xs mt-1">Upload a document to see indexed terms.</p>
              </div>
            )}
            <div className="px-3 py-2 bg-gray-800 border-t border-gray-700 text-gray-500 text-center">
              Press Ctrl+Shift+D or click outside to close
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // Render: Full Mode
  // ==========================================================================

  return (
    <div className={`${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {hasFiles ? (
        // Files uploaded - show status card with file list
        <div className="rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-800/50 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-800/50 text-teal-600 dark:text-teal-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-teal-900 dark:text-teal-100 text-sm">
                  {uploadedFiles.length} File{uploadedFiles.length > 1 ? 's' : ''} Loaded
                </h3>
                <p className="text-xs text-teal-700 dark:text-teal-300 mt-0.5">
                  {totalTerms} terms indexed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {uploadedFiles.length < MAX_FILES && (
                <button
                  onClick={openFilePicker}
                  className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-800/50 rounded-lg transition-colors"
                  title={`Add more files (${MAX_FILES - uploadedFiles.length} remaining)`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="p-2 text-teal-600 dark:text-teal-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                title="Clear all files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Progress bar when uploading additional files */}
          {(isUploading || isStreamUploading) && (
            <div className="mb-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
                    {uploadStage || "Processing..."}
                  </p>
                  <div className="w-full mt-1.5 h-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300 ease-out rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
                  {uploadProgress}%
                </span>
              </div>
            </div>
          )}
          
          {/* File List */}
          <div className="space-y-1.5">
            {uploadedFiles.map((file) => (
              <div 
                key={file.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/60 dark:bg-gray-800/40 border border-teal-100 dark:border-teal-800/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={file.fileName}>
                    {file.fileName.length > 20 ? file.fileName.slice(0, 20) + '...' : file.fileName}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {file.termsCount} terms
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveFile(file.id)}
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                  title="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Upload zone
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={openFilePicker}
          className={`
            relative rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all
            ${isDragging
              ? "border-teal-400 bg-teal-50 dark:border-teal-500 dark:bg-teal-900/20"
              : "border-gray-300 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600 bg-gray-50/50 dark:bg-gray-800/30"
            }
            ${(isUploading || isStreamUploading) ? "pointer-events-none" : ""}
          `}
        >
          {(isUploading || isStreamUploading) ? (
            // Uploading state with progress bar
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {uploadStage || "Processing..."}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {uploadProgress}% complete
              </p>
              {/* Progress bar */}
              <div className="w-full max-w-xs mt-3 h-2 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            // Ready to upload
            <div className="flex flex-col items-center text-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
                isDragging
                  ? "bg-teal-100 dark:bg-teal-800/50 text-teal-600 dark:text-teal-300"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDragging ? "Drop file here" : "Upload your presentation"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                PDF, PPTX, DOCX, TXT, or MD • Max 10MB
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                AI will learn your vocabulary for better transcription
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

export default RAGUpload;
