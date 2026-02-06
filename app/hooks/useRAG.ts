/**
 * useRAG Hook - React Hook for RAG Integration
 * 
 * Provides easy access to RAG functionality in React components:
 * - File upload with progress
 * - Session state management
 * - Transcript correction
 * - Automatic cleanup on unmount
 * 
 * Usage:
 * ```tsx
 * const { upload, correct, sessionInfo, isReady } = useRAG();
 * ```
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RAGService,
  RAGServiceConfig,
  UploadResponse,
  SessionInfoResponse,
  CorrectionResponse,
  DeleteSessionResponse,
} from "@/app/services/ragService";
import { WordConfidence } from "@/app/types/rag";

// ============================================================================
// Types
// ============================================================================

export interface UseRAGOptions extends RAGServiceConfig {
  /** Auto-fetch session info on mount */
  autoFetch?: boolean;
  /** Cleanup session on unmount */
  cleanupOnUnmount?: boolean;
}

export interface UseRAGReturn {
  // State
  sessionId: string | null;
  sessionInfo: SessionInfoResponse | null;
  isLoading: boolean;
  isUploading: boolean;
  isCorrecting: boolean;
  error: string | null;
  isReady: boolean;

  // Actions
  upload: (file: File) => Promise<UploadResponse>;
  correct: (
    transcript: string,
    wordConfidences?: WordConfidence[],
    options?: { language?: string; isFinal?: boolean }
  ) => Promise<CorrectionResponse>;
  clearSession: () => Promise<DeleteSessionResponse>;
  refreshSessionInfo: (forSessionId?: string) => Promise<void>;
  setSessionId: (sessionId: string | null) => void;

  // Utilities
  shouldTriggerRAG: (wordConfidences: WordConfidence[], threshold?: number) => boolean;
  getLowConfidenceWords: (
    wordConfidences: WordConfidence[],
    threshold?: number
  ) => Array<{ word: string; confidence: number; position: number }>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useRAG(options: UseRAGOptions = {}): UseRAGReturn {
  const {
    autoFetch = true,
    cleanupOnUnmount = false,
    ...serviceConfig
  } = options;

  // Service instance (stable reference)
  const serviceRef = useRef<RAGService | null>(null);
  
  // Initialize service only once
  if (!serviceRef.current) {
    serviceRef.current = new RAGService(serviceConfig);
  }

  // State
  const [sessionId, setSessionIdState] = useState<string | null>(
    serviceRef.current.getSessionId()
  );
  const [sessionInfo, setSessionInfo] = useState<SessionInfoResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed state
  const isReady = sessionInfo?.exists === true && (sessionInfo?.totalTerms ?? 0) > 0;

  /**
   * Set session ID (updates both service and state)
   */
  const setSessionId = useCallback((id: string | null) => {
    serviceRef.current?.setSessionId(id);
    setSessionIdState(id);
    if (!id) {
      setSessionInfo(null);
    }
  }, []);

  /**
   * Refresh session info from API
   * @param forSessionId - Optional specific session ID to refresh (useful when sessionId state hasn't updated yet)
   */
  const refreshSessionInfo = useCallback(async (forSessionId?: string) => {
    const targetSessionId = forSessionId || sessionId || serviceRef.current?.getSessionId();
    
    if (!targetSessionId) {
      setSessionInfo(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const info = await serviceRef.current!.getSessionInfo(targetSessionId);
      setSessionInfo(info);
      if (info.error) {
        setError(info.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch session info");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  /**
   * Upload a file and index its content
   */
  const upload = useCallback(async (file: File): Promise<UploadResponse> => {
    setIsUploading(true);
    setError(null);

    try {
      const response = await serviceRef.current!.uploadContent(file);
      
      if (response.success && response.sessionId) {
        setSessionIdState(response.sessionId);
        // Fetch session info after successful upload
        const info = await serviceRef.current!.getSessionInfo(response.sessionId);
        setSessionInfo(info);
      } else if (response.error) {
        setError(response.error);
      }

      return response;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setError(message);
      return {
        success: false,
        sessionId: "",
        file: { name: file.name, size: file.size, type: file.type, extension: "" },
        parsing: { textLength: 0, processingTimeMs: 0 },
        terms: { extracted: 0, indexed: 0, limited: false, categories: {} },
        processingTimeMs: 0,
        error: message,
      };
    } finally {
      setIsUploading(false);
    }
  }, []);

  /**
   * Correct a transcript using RAG
   */
  const correct = useCallback(
    async (
      transcript: string,
      wordConfidences?: WordConfidence[],
      options?: { language?: string; isFinal?: boolean }
    ): Promise<CorrectionResponse> => {
      setIsCorrecting(true);

      try {
        const response = await serviceRef.current!.correctTranscript(
          transcript,
          wordConfidences,
          undefined, // Use current session
          options
        );
        
        if (response.error) {
          // Don't set error for "normal" failures, just return
          console.warn("[useRAG] Correction warning:", response.error);
        }

        return response;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Correction failed";
        console.error("[useRAG] Correction error:", message);
        return {
          originalTranscript: transcript,
          correctedTranscript: transcript,
          wasModified: false,
          corrections: [],
          termsRetrieved: 0,
          processingTimeMs: 0,
          sessionId: sessionId || "",
          error: message,
        };
      } finally {
        setIsCorrecting(false);
      }
    },
    [sessionId]
  );

  /**
   * Clear the current session
   */
  const clearSessionAction = useCallback(async (): Promise<DeleteSessionResponse> => {
    if (!sessionId) {
      return {
        success: false,
        sessionId: "",
        deleted: 0,
        message: "No session to clear",
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await serviceRef.current!.clearSession(sessionId);
      
      if (response.success) {
        setSessionIdState(null);
        setSessionInfo(null);
      } else if (response.error) {
        setError(response.error);
      }

      return response;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to clear session";
      setError(message);
      return {
        success: false,
        sessionId,
        deleted: 0,
        message,
        error: message,
      };
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  /**
   * Check if any words need correction
   */
  const shouldTriggerRAG = useCallback(
    (wordConfidences: WordConfidence[], threshold?: number): boolean => {
      return serviceRef.current!.shouldTriggerRAG(wordConfidences, threshold);
    },
    []
  );

  /**
   * Get low confidence words
   */
  const getLowConfidenceWords = useCallback(
    (wordConfidences: WordConfidence[], threshold?: number) => {
      return serviceRef.current!.getLowConfidenceWords(wordConfidences, threshold);
    },
    []
  );

  // Auto-fetch session info on mount and when sessionId changes
  useEffect(() => {
    if (autoFetch && sessionId) {
      refreshSessionInfo();
    }
  }, [autoFetch, sessionId, refreshSessionInfo]);

  // Cleanup on unmount if configured
  useEffect(() => {
    return () => {
      if (cleanupOnUnmount && sessionId) {
        // Fire and forget cleanup
        serviceRef.current?.clearSession(sessionId).catch(() => {});
      }
    };
  }, [cleanupOnUnmount, sessionId]);

  return {
    // State
    sessionId,
    sessionInfo,
    isLoading,
    isUploading,
    isCorrecting,
    error,
    isReady,

    // Actions
    upload,
    correct,
    clearSession: clearSessionAction,
    refreshSessionInfo,
    setSessionId,

    // Utilities
    shouldTriggerRAG,
    getLowConfidenceWords,
  };
}

export default useRAG;
