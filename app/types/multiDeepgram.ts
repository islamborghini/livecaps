/**
 * Type definitions for Multi-Deepgram parallel connection architecture
 *
 * This module defines types for managing multiple simultaneous Deepgram WebSocket
 * connections to support multilingual speech recognition with confidence-based
 * winner selection.
 */

import { LiveClient, LiveConnectionState } from "@deepgram/sdk";

/**
 * Represents a single Deepgram connection in the parallel connection pool
 */
export interface DeepgramConnection {
  /** Unique identifier for this connection (e.g., "connection-en") */
  id: string;

  /** Language code for this connection (e.g., "en", "ko", "ru") */
  language: string;

  /** Deepgram LiveClient instance for WebSocket communication */
  client: LiveClient;

  /** Current connection state (CLOSED, CONNECTING, OPEN) */
  state: LiveConnectionState;

  /** Most recent transcript received from this connection */
  lastTranscript: string;

  /** Most recent confidence score (0-1) */
  lastConfidence: number;

  /** Count of consecutive errors for circuit breaking */
  errorCount: number;

  /** Whether this connection is considered healthy */
  isHealthy: boolean;

  /** Timestamp of last successful transcript */
  lastActivityTimestamp: number;
}

/**
 * Transcript result with confidence and metadata from a single connection
 */
export interface TranscriptResult {
  /** Which connection produced this result */
  connectionId: string;

  /** Language of this connection */
  language: string;

  /** The transcribed text */
  transcript: string;

  /** Confidence score from Deepgram (0-1) */
  confidence: number;

  /** Whether this is a final (non-interim) result */
  isFinal: boolean;

  /** Timestamp when result was received (Date.now()) */
  timestamp: number;

  /** Optional word-level details from Deepgram */
  words?: Array<{
    word: string;
    confidence: number;
    start: number;
    end: number;
    language?: string;
  }>;

  /** Channel-level detected language (if available) */
  detectedLanguage?: string;
}

/**
 * Winner transcript after comparing all parallel connection results
 */
export interface WinnerTranscript {
  /** The winning transcript text */
  transcript: string;

  /** Highest confidence score among all results */
  confidence: number;

  /** Detected language (from the winning connection) */
  language: string;

  /** Which connection won */
  connectionId: string;

  /** All competing results (for debugging/analysis) */
  allResults: TranscriptResult[];

  /** When the winner was selected */
  timestamp: number;

  /** Whether this is a final result */
  isFinal: boolean;

  /** Optional word-level details from the winner */
  words?: Array<{
    word: string;
    confidence: number;
    start: number;
    end: number;
    language?: string;
  }>;
}

/**
 * Transcription mode selection
 */
export type TranscriptionMode = "single" | "multi-detect";

/**
 * Configuration for multi-connection mode
 */
export interface MultiDeepgramConfig {
  /** Current mode (single language or multi-language detection) */
  mode: TranscriptionMode;

  /** Languages to run in parallel (e.g., ["ko", "en", "ru"]) */
  languages: string[];

  /** Buffer window in milliseconds for comparing transcripts */
  bufferWindowMs?: number;

  /** Minimum confidence threshold to consider a result */
  minConfidenceThreshold?: number;

  /** Maximum number of parallel connections */
  maxConnections?: number;
}

/**
 * Context type for Multi-Deepgram provider
 */
export interface MultiDeepgramContextType {
  /** Map of all active connections (key = connectionId) */
  connections: Map<string, DeepgramConnection>;

  /** Establish parallel connections for specified languages */
  connectToDeepgram: (languages: string[]) => Promise<void>;

  /** Disconnect and clean up all connections */
  disconnectFromDeepgram: () => void;

  /** Send audio blob to all active connections */
  sendAudioToAll: (audioData: Blob) => void;

  /** Aggregated connection state across all connections */
  overallState: LiveConnectionState;

  /** Current transcription mode */
  mode: TranscriptionMode;

  /** Update transcription mode */
  setMode: (mode: TranscriptionMode) => void;

  /** Configuration for multi-connection behavior */
  config: MultiDeepgramConfig;
}

/**
 * Buffered transcript entry for time-window comparison
 */
export interface BufferedTranscript {
  /** All results received in this time window */
  results: TranscriptResult[];

  /** When this buffer was created */
  startTimestamp: number;

  /** Timeout handle for flushing buffer */
  timeoutHandle?: NodeJS.Timeout;
}

/**
 * Connection health status
 */
export interface ConnectionHealth {
  /** Connection identifier */
  connectionId: string;

  /** Language of this connection */
  language: string;

  /** Current state */
  state: LiveConnectionState;

  /** Number of errors */
  errorCount: number;

  /** Overall health status */
  isHealthy: boolean;

  /** Last activity timestamp */
  lastActivity: number;

  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Event emitted when a winner transcript is selected
 */
export interface WinnerSelectedEvent {
  /** The winner transcript */
  winner: WinnerTranscript;

  /** Number of connections that responded */
  participantCount: number;

  /** Health status of all connections at time of selection */
  connectionHealth: ConnectionHealth[];
}
