/**
 * RAG Module Exports
 * 
 * Central export point for all RAG-related client-side functionality.
 * 
 * Usage:
 * ```tsx
 * // Import the hook
 * import { useRAG } from "@/app/lib/rag";
 * 
 * // Or import specific functions
 * import { uploadContent, correctTranscript } from "@/app/lib/rag";
 * 
 * // Or import the service class
 * import { RAGService } from "@/app/lib/rag";
 * ```
 */

// Service exports
export {
  RAGService,
  getRAGService,
  resetRAGService,
  uploadContent,
  getSessionInfo,
  correctTranscript,
  clearSession,
  shouldTriggerRAG,
  getCurrentSessionId,
  isRAGReady,
  type UploadResponse,
  type SessionInfoResponse,
  type CorrectionResponse,
  type DeleteSessionResponse,
  type RAGServiceConfig,
} from "@/app/services/ragService";

// Hook exports
export { useRAG, type UseRAGOptions, type UseRAGReturn } from "@/app/hooks/useRAG";

// Re-export common types
export type { 
  WordConfidence, 
  CorrectionDetail, 
  ExtractedTerm,
  CorrectionRequest,
  CorrectionResponse as CorrectionResponseType,
} from "@/app/types/rag";
