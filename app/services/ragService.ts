/**
 * RAG Service - Client-Side API Wrapper
 * 
 * Provides a clean interface for frontend components to interact with 
 * the RAG correction system APIs.
 * 
 * Features:
 * - File upload and content indexing
 * - Session management (info, clear)
 * - Transcript correction with word confidences
 * - Automatic session persistence
 */

import { WordConfidence, CorrectionDetail } from "@/app/types/rag";

// ============================================================================
// Types
// ============================================================================

/** Response from file upload */
export interface UploadResponse {
  success: boolean;
  sessionId: string;
  file: {
    name: string;
    size: number;
    type: string;
    extension: string;
  };
  parsing: {
    textLength: number;
    processingTimeMs: number;
    warnings?: string[];
  };
  terms: {
    extracted: number;
    indexed: number;
    limited: boolean;
    categories: Record<string, number>;
  };
  processingTimeMs: number;
  error?: string;
}

/** Response from session info */
export interface SessionInfoResponse {
  exists: boolean;
  sessionId: string;
  totalTerms: number;
  documentCount: number;
  lastUpdated: string | null;
  categoryBreakdown: Record<string, number>;
  error?: string;
}

/** Response from correction request */
export interface CorrectionResponse {
  originalTranscript: string;
  correctedTranscript: string;
  wasModified: boolean;
  corrections: CorrectionDetail[];
  termsRetrieved: number;
  processingTimeMs: number;
  sessionId: string;
  error?: string;
}

/** Response from session deletion */
export interface DeleteSessionResponse {
  success: boolean;
  sessionId: string;
  deleted: number;
  previousStats?: {
    totalTerms: number;
    documentCount: number;
    categories: Record<string, number>;
  };
  message: string;
  error?: string;
}

/** RAG service configuration */
export interface RAGServiceConfig {
  /** Base URL for API calls (defaults to current origin) */
  baseUrl?: string;
  /** Default confidence threshold for triggering corrections */
  confidenceThreshold?: number;
  /** Whether to persist session ID to localStorage */
  persistSession?: boolean;
  /** localStorage key for session ID */
  storageKey?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Required<RAGServiceConfig> = {
  baseUrl: "",
  confidenceThreshold: 0.7,
  persistSession: true,
  storageKey: "rag-session-id",
  debug: false,
};

const STORAGE_KEY = "rag-session-id";

// ============================================================================
// RAG Service Class
// ============================================================================

/**
 * RAG Service for client-side RAG operations
 */
export class RAGService {
  private config: Required<RAGServiceConfig>;
  private currentSessionId: string | null = null;

  constructor(config: RAGServiceConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Restore session from storage if available
    if (this.config.persistSession && typeof window !== "undefined") {
      this.currentSessionId = localStorage.getItem(this.config.storageKey);
      if (this.currentSessionId && this.config.debug) {
        console.log(`[RAG] Restored session: ${this.currentSessionId}`);
      }
    }
  }

  /**
   * Log debug messages
   */
  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[RAG]", ...args);
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Set the current session ID (and persist if configured)
   */
  setSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
    
    if (this.config.persistSession && typeof window !== "undefined") {
      if (sessionId) {
        localStorage.setItem(this.config.storageKey, sessionId);
      } else {
        localStorage.removeItem(this.config.storageKey);
      }
    }
    
    this.log("Session ID set:", sessionId);
  }

  /**
   * Check if a session is active
   */
  hasSession(): boolean {
    return this.currentSessionId !== null;
  }

  // ==========================================================================
  // API Methods
  // ==========================================================================

  /**
   * Upload a file for RAG indexing
   * 
   * @param file - The file to upload (PDF, DOCX, PPTX, TXT, MD)
   * @param customSessionId - Optional custom session ID
   * @returns Upload response with session ID and stats
   */
  async uploadContent(
    file: File,
    customSessionId?: string
  ): Promise<UploadResponse> {
    this.log("Uploading file:", file.name, `(${(file.size / 1024).toFixed(1)}KB)`);

    const formData = new FormData();
    formData.append("file", file);
    
    if (customSessionId) {
      formData.append("sessionId", customSessionId);
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/rag/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        this.log("Upload failed:", data.error);
        return {
          success: false,
          sessionId: "",
          file: { name: file.name, size: file.size, type: file.type, extension: "" },
          parsing: { textLength: 0, processingTimeMs: 0 },
          terms: { extracted: 0, indexed: 0, limited: false, categories: {} },
          processingTimeMs: 0,
          error: data.error || `Upload failed with status ${response.status}`,
        };
      }

      // Store the session ID
      if (data.sessionId) {
        this.setSessionId(data.sessionId);
      }

      this.log("Upload successful:", data.sessionId, `(${data.terms.indexed} terms)`);
      return data as UploadResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Network error";
      this.log("Upload error:", errorMessage);
      return {
        success: false,
        sessionId: "",
        file: { name: file.name, size: file.size, type: file.type, extension: "" },
        parsing: { textLength: 0, processingTimeMs: 0 },
        terms: { extracted: 0, indexed: 0, limited: false, categories: {} },
        processingTimeMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Get session info and indexed content stats
   * 
   * @param sessionId - Session ID (uses current session if not provided)
   * @returns Session info with term counts and categories
   */
  async getSessionInfo(sessionId?: string): Promise<SessionInfoResponse> {
    const sid = sessionId || this.currentSessionId;
    
    if (!sid) {
      return {
        exists: false,
        sessionId: "",
        totalTerms: 0,
        documentCount: 0,
        lastUpdated: null,
        categoryBreakdown: {},
        error: "No session ID provided",
      };
    }

    this.log("Getting session info:", sid);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/rag/session?sessionId=${encodeURIComponent(sid)}`
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          exists: false,
          sessionId: sid,
          totalTerms: 0,
          documentCount: 0,
          lastUpdated: null,
          categoryBreakdown: {},
          error: data.error || data.message,
        };
      }

      this.log("Session info:", data.totalTerms, "terms");
      return data as SessionInfoResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Network error";
      this.log("Session info error:", errorMessage);
      return {
        exists: false,
        sessionId: sid,
        totalTerms: 0,
        documentCount: 0,
        lastUpdated: null,
        categoryBreakdown: {},
        error: errorMessage,
      };
    }
  }

  /**
   * Request correction for a transcript
   * 
   * @param transcript - The text to correct
   * @param wordConfidences - Optional word confidence scores
   * @param sessionId - Session ID (uses current session if not provided)
   * @param options - Additional options
   * @returns Correction response with modified transcript
   */
  async correctTranscript(
    transcript: string,
    wordConfidences?: WordConfidence[],
    sessionId?: string,
    options: {
      language?: string;
      isFinal?: boolean;
      confidenceThreshold?: number;
    } = {}
  ): Promise<CorrectionResponse> {
    const sid = sessionId || this.currentSessionId;
    
    if (!sid) {
      return {
        originalTranscript: transcript,
        correctedTranscript: transcript,
        wasModified: false,
        corrections: [],
        termsRetrieved: 0,
        processingTimeMs: 0,
        sessionId: "",
        error: "No session ID - upload content first",
      };
    }

    // Skip empty transcripts
    if (!transcript.trim()) {
      return {
        originalTranscript: transcript,
        correctedTranscript: transcript,
        wasModified: false,
        corrections: [],
        termsRetrieved: 0,
        processingTimeMs: 0,
        sessionId: sid,
      };
    }

    this.log("Correcting transcript:", transcript.substring(0, 50) + "...");

    try {
      const response = await fetch(`${this.config.baseUrl}/api/rag/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          wordConfidences,
          sessionId: sid,
          language: options.language || "en",
          isFinal: options.isFinal ?? true,
          confidenceThreshold: options.confidenceThreshold || this.config.confidenceThreshold,
        }),
      });

      const data = await response.json();

      if (!response.ok && !data.correctedTranscript) {
        return {
          originalTranscript: transcript,
          correctedTranscript: transcript,
          wasModified: false,
          corrections: [],
          termsRetrieved: 0,
          processingTimeMs: 0,
          sessionId: sid,
          error: data.error || `Correction failed with status ${response.status}`,
        };
      }

      this.log(
        "Correction result:",
        data.wasModified ? `Modified (${data.corrections.length} changes)` : "Unchanged"
      );
      return data as CorrectionResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Network error";
      this.log("Correction error:", errorMessage);
      return {
        originalTranscript: transcript,
        correctedTranscript: transcript,
        wasModified: false,
        corrections: [],
        termsRetrieved: 0,
        processingTimeMs: 0,
        sessionId: sid,
        error: errorMessage,
      };
    }
  }

  /**
   * Clear all indexed content for a session
   * 
   * @param sessionId - Session ID (uses current session if not provided)
   * @returns Deletion response with stats
   */
  async clearSession(sessionId?: string): Promise<DeleteSessionResponse> {
    const sid = sessionId || this.currentSessionId;
    
    if (!sid) {
      return {
        success: false,
        sessionId: "",
        deleted: 0,
        message: "No session ID provided",
        error: "No session ID provided",
      };
    }

    this.log("Clearing session:", sid);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/rag/session?sessionId=${encodeURIComponent(sid)}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          sessionId: sid,
          deleted: 0,
          message: data.error || "Failed to clear session",
          error: data.error,
        };
      }

      // Clear the stored session if it was the current one
      if (sid === this.currentSessionId) {
        this.setSessionId(null);
      }

      this.log("Session cleared:", data.deleted, "items removed");
      return data as DeleteSessionResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Network error";
      this.log("Clear session error:", errorMessage);
      return {
        success: false,
        sessionId: sid,
        deleted: 0,
        message: errorMessage,
        error: errorMessage,
      };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if any words in the transcript need correction
   * 
   * @param wordConfidences - Word confidence scores from transcription
   * @param threshold - Confidence threshold (defaults to config value)
   * @returns True if any word is below threshold
   */
  shouldTriggerRAG(
    wordConfidences: WordConfidence[],
    threshold?: number
  ): boolean {
    const thresh = threshold || this.config.confidenceThreshold;
    return wordConfidences.some((wc) => wc.confidence < thresh);
  }

  /**
   * Get words that are below the confidence threshold
   * 
   * @param wordConfidences - Word confidence scores
   * @param threshold - Confidence threshold
   * @returns Array of low-confidence words with their positions
   */
  getLowConfidenceWords(
    wordConfidences: WordConfidence[],
    threshold?: number
  ): Array<{ word: string; confidence: number; position: number }> {
    const thresh = threshold || this.config.confidenceThreshold;
    return wordConfidences
      .map((wc, i) => ({ word: wc.word, confidence: wc.confidence, position: i }))
      .filter((w) => w.confidence < thresh);
  }

  /**
   * Check if RAG is ready (has a session with content)
   * 
   * @returns Promise resolving to true if ready
   */
  async isReady(): Promise<boolean> {
    if (!this.currentSessionId) {
      return false;
    }
    
    const info = await this.getSessionInfo();
    return info.exists && info.totalTerms > 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Default RAG service instance */
let defaultInstance: RAGService | null = null;

/**
 * Get the default RAG service instance (singleton)
 */
export function getRAGService(config?: RAGServiceConfig): RAGService {
  if (!defaultInstance) {
    defaultInstance = new RAGService(config);
  }
  return defaultInstance;
}

/**
 * Reset the default RAG service instance
 */
export function resetRAGService(): void {
  if (defaultInstance) {
    defaultInstance.setSessionId(null);
  }
  defaultInstance = null;
}

// ============================================================================
// Convenience Functions (use default instance)
// ============================================================================

/**
 * Upload content using the default RAG service
 */
export async function uploadContent(
  file: File,
  customSessionId?: string
): Promise<UploadResponse> {
  return getRAGService().uploadContent(file, customSessionId);
}

/**
 * Get session info using the default RAG service
 */
export async function getSessionInfo(
  sessionId?: string
): Promise<SessionInfoResponse> {
  return getRAGService().getSessionInfo(sessionId);
}

/**
 * Correct transcript using the default RAG service
 */
export async function correctTranscript(
  transcript: string,
  wordConfidences?: WordConfidence[],
  sessionId?: string,
  options?: {
    language?: string;
    isFinal?: boolean;
    confidenceThreshold?: number;
  }
): Promise<CorrectionResponse> {
  return getRAGService().correctTranscript(transcript, wordConfidences, sessionId, options);
}

/**
 * Clear session using the default RAG service
 */
export async function clearSession(
  sessionId?: string
): Promise<DeleteSessionResponse> {
  return getRAGService().clearSession(sessionId);
}

/**
 * Check if any words need correction
 */
export function shouldTriggerRAG(
  wordConfidences: WordConfidence[],
  threshold?: number
): boolean {
  return getRAGService().shouldTriggerRAG(wordConfidences, threshold);
}

/**
 * Get the current session ID
 */
export function getCurrentSessionId(): string | null {
  return getRAGService().getSessionId();
}

/**
 * Check if RAG is ready
 */
export async function isRAGReady(): Promise<boolean> {
  return getRAGService().isReady();
}
