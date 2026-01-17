/**
 * RAG (Retrieval-Augmented Generation) Type Definitions
 *
 * Type-safe contracts for all RAG operations including:
 * - User session management
 * - Content extraction and term processing
 * - Correction request/response handling
 * - Configuration settings
 */

/**
 * Represents a user's upload session
 * Each session corresponds to one or more uploaded files containing domain-specific terms
 */
export interface UserSession {
  /** Unique identifier for this session */
  id: string;

  /** Timestamp when the session was created */
  createdAt: number;

  /** Timestamp of the last upload in this session */
  lastUploadAt: number;

  /** List of uploaded file names in this session */
  fileNames: string[];

  /** Total number of terms extracted across all files */
  termCount: number;

  /** Optional user-provided label for this session */
  label?: string;

  /** Whether the session is still active */
  isActive: boolean;
}

/**
 * A term extracted from user-uploaded content
 * Includes the term itself, surrounding context, and phonetic representation
 */
export interface ExtractedTerm {
  /** The actual term (word or phrase) */
  term: string;

  /** Lowercase normalized version of the term */
  normalizedTerm: string;

  /** Surrounding context (sentence or paragraph containing the term) */
  context: string;

  /** Source file name where this term was found */
  sourceFile: string;

  /** Page or section number if applicable */
  sourceLocation?: string;

  /** Phonetic code for fuzzy matching (Soundex) */
  phoneticCode: string;

  /** Frequency count of this term in the source material */
  frequency: number;

  /** Whether this is likely a proper noun (name, place, etc.) */
  isProperNoun: boolean;

  /** Category of the term (e.g., "person", "organization", "technical", "general") */
  category?: string;
}

/**
 * Parsed content from a user-uploaded file
 * Contains raw text, extracted terms, and file metadata
 */
export interface UploadedContent {
  /** Original file name */
  fileName: string;

  /** File MIME type */
  mimeType: string;

  /** File size in bytes */
  fileSize: number;

  /** Raw extracted text from the file */
  rawText: string;

  /** List of extracted terms with metadata */
  terms: ExtractedTerm[];

  /** Timestamp when the file was processed */
  processedAt: number;

  /** Processing duration in milliseconds */
  processingTimeMs: number;

  /** Any warnings or issues encountered during processing */
  warnings?: string[];

  /** Whether the content was successfully parsed */
  success: boolean;

  /** Error message if parsing failed */
  error?: string;
}

/**
 * Word-level confidence information from Deepgram transcription
 */
export interface WordConfidence {
  /** The transcribed word */
  word: string;

  /** Confidence score from Deepgram (0-1) */
  confidence: number;

  /** Start time in the audio (seconds) */
  start: number;

  /** End time in the audio (seconds) */
  end: number;
}

/**
 * Input for the correction system
 * Contains the transcript to correct along with confidence metadata
 */
export interface CorrectionRequest {
  /** The original transcript text to potentially correct */
  transcript: string;

  /** Word-level confidence scores from Deepgram */
  wordConfidences: WordConfidence[];

  /** Session ID to retrieve user-specific terms from */
  sessionId: string;

  /** Detected language of the transcript */
  language: string;

  /** Whether this is a final (not interim) transcript */
  isFinal: boolean;

  /** Optional: minimum confidence threshold below which to consider correction */
  confidenceThreshold?: number;
}

/**
 * A single correction that was applied
 */
export interface CorrectionDetail {
  /** The original (potentially misheard) word or phrase */
  original: string;

  /** The corrected word or phrase */
  corrected: string;

  /** Why this correction was made */
  reason: string;

  /** Confidence in this correction (0-1) */
  confidence: number;

  /** The matching term from the knowledge base */
  matchedTerm?: string;

  /** How the match was found (e.g., "phonetic", "semantic", "exact") */
  matchType: "phonetic" | "semantic" | "exact" | "llm";

  /** Position in the original transcript (word index) */
  position: number;
}

/**
 * Output from the correction system
 */
export interface CorrectionResponse {
  /** The original input transcript */
  originalTranscript: string;

  /** The corrected transcript (may be same as original if no corrections) */
  correctedTranscript: string;

  /** Whether any corrections were made */
  wasModified: boolean;

  /** List of corrections that were applied */
  corrections: CorrectionDetail[];

  /** Total processing time in milliseconds */
  processingTimeMs: number;

  /** Number of terms retrieved from the knowledge base */
  termsRetrieved: number;

  /** Session ID used for correction */
  sessionId: string;

  /** Any warnings or notes about the correction process */
  warnings?: string[];
}

/**
 * Configuration settings for the RAG system
 */
export interface RAGConfig {
  /** Minimum Deepgram confidence score to trigger potential correction (0-1) */
  confidenceThreshold: number;

  /** Minimum similarity score to consider a term match (0-1) */
  similarityThreshold: number;

  /** Maximum number of terms to retrieve from vector store per query */
  maxTermsToRetrieve: number;

  /** Weight for phonetic matching in scoring (0-1) */
  phoneticWeight: number;

  /** Weight for semantic/vector matching in scoring (0-1) */
  semanticWeight: number;

  /** Whether to use LLM for final correction decisions */
  useLLMCorrection: boolean;

  /** LLM model to use for correction (e.g., "llama-3.3-70b-versatile") */
  llmModel: string;

  /** Maximum tokens for LLM response */
  llmMaxTokens: number;

  /** Whether RAG correction is enabled */
  enabled: boolean;

  /** Batch size for processing multiple low-confidence words */
  batchSize: number;

  /** Timeout for correction operations in milliseconds */
  timeoutMs: number;
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_CONFIG: RAGConfig = {
  confidenceThreshold: 0.7,
  similarityThreshold: 0.75,
  maxTermsToRetrieve: 10,
  phoneticWeight: 0.3,
  semanticWeight: 0.7,
  useLLMCorrection: true,
  llmModel: "llama-3.3-70b-versatile",
  llmMaxTokens: 256,
  enabled: true,
  batchSize: 5,
  timeoutMs: 3000,
};

/**
 * Vector store record for an extracted term
 * This is what gets stored in Upstash Vector
 */
export interface TermVectorRecord {
  /** Unique ID for this vector record */
  id: string;

  /** The embedding vector (generated by Jina) */
  vector: number[];

  /** Metadata stored alongside the vector */
  metadata: {
    term: string;
    normalizedTerm: string;
    context: string;
    phoneticCode: string;
    sourceFile: string;
    sessionId: string;
    isProperNoun: boolean;
    category?: string;
  };
}

/**
 * Result from vector similarity search
 */
export interface VectorSearchResult {
  /** The matched term record ID */
  id: string;

  /** Similarity score (0-1, higher is more similar) */
  score: number;

  /** Metadata from the matched record */
  metadata: TermVectorRecord["metadata"];
}

/**
 * Statistics for a RAG session
 */
export interface RAGSessionStats {
  /** Session ID */
  sessionId: string;

  /** Total terms in the knowledge base */
  totalTerms: number;

  /** Number of corrections made in this session */
  correctionsApplied: number;

  /** Number of transcripts processed */
  transcriptsProcessed: number;

  /** Average processing time per correction request */
  avgProcessingTimeMs: number;

  /** Most frequently corrected terms */
  topCorrections: Array<{
    original: string;
    corrected: string;
    count: number;
  }>;
}
