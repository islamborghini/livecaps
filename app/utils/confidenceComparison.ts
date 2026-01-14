/**
 * Confidence Comparison Utility
 *
 * Implements the algorithm for selecting the "winner" transcript among multiple
 * parallel Deepgram connections based on confidence scores. Handles buffering,
 * comparison, and edge cases.
 */

import {
  TranscriptResult,
  WinnerTranscript,
  BufferedTranscript,
} from "../types/multiDeepgram";

/**
 * Default configuration for confidence comparison
 */
export const CONFIDENCE_CONFIG = {
  /** Time window to wait for all connections to respond (ms) */
  BUFFER_WINDOW_MS: 30,  // Reduced from 50ms for faster response

  /** Minimum confidence to consider a result valid */
  MIN_CONFIDENCE_THRESHOLD: 0.3,

  /** Minimum difference to consider one significantly better */
  SIGNIFICANT_DIFFERENCE_THRESHOLD: 0.05,

  /** Maximum time to wait before forcing a decision (ms) */
  MAX_WAIT_TIME_MS: 80,  // Reduced from 100ms for faster response

  /** High confidence threshold for early winner exit (skip waiting for other connections) */
  HIGH_CONFIDENCE_EARLY_EXIT: 0.85,
};

/**
 * Selects the winner transcript based on confidence scores
 *
 * Algorithm:
 * 1. Filter out results below minimum confidence threshold
 * 2. Find highest confidence score
 * 3. Return winner with all metadata
 * 4. Handle ties by choosing first in priority order
 *
 * @param results - Array of transcript results from parallel connections
 * @param config - Optional configuration overrides
 * @returns Winner transcript with highest confidence
 */
export function selectWinnerByConfidence(
  results: TranscriptResult[],
  config: Partial<typeof CONFIDENCE_CONFIG> = {}
): WinnerTranscript | null {
  const mergedConfig = { ...CONFIDENCE_CONFIG, ...config };

  // Filter results by minimum confidence threshold
  const validResults = results.filter(
    (result) =>
      result.confidence >= mergedConfig.MIN_CONFIDENCE_THRESHOLD &&
      result.transcript.trim().length > 0
  );

  if (validResults.length === 0) {
    console.warn("⚠️ No valid results to compare (all below threshold or empty)");
    return null;
  }

  // Log all results for debugging
  console.log("🔍 Comparing transcript results:");
  validResults.forEach((result) => {
    console.log(
      `  - [${result.language}] confidence=${result.confidence.toFixed(3)}: "${result.transcript.substring(0, 50)}${result.transcript.length > 50 ? "..." : ""}"`
    );
  });

  // Find the result with highest confidence
  let winner = validResults[0];
  let runnerUp = validResults.length > 1 ? validResults[1] : null;

  for (let i = 1; i < validResults.length; i++) {
    if (validResults[i].confidence > winner.confidence) {
      runnerUp = winner;
      winner = validResults[i];
    } else if (
      runnerUp === null ||
      (validResults[i].confidence > runnerUp.confidence &&
        validResults[i].connectionId !== winner.connectionId)
    ) {
      runnerUp = validResults[i];
    }
  }

  // Check if the winner is significantly better than runner-up
  const isSignificantWin =
    !runnerUp ||
    winner.confidence - runnerUp.confidence >=
      mergedConfig.SIGNIFICANT_DIFFERENCE_THRESHOLD;

  console.log(
    `🏆 Winner: [${winner.language}] confidence=${winner.confidence.toFixed(3)} ${isSignificantWin ? "(significant)" : "(marginal)"}`
  );

  if (runnerUp) {
    console.log(
      `🥈 Runner-up: [${runnerUp.language}] confidence=${runnerUp.confidence.toFixed(3)}, diff=${(winner.confidence - runnerUp.confidence).toFixed(3)}`
    );
  }

  // Create winner transcript object
  const winnerTranscript: WinnerTranscript = {
    transcript: winner.transcript,
    confidence: winner.confidence,
    language: winner.language,
    connectionId: winner.connectionId,
    allResults: results, // Include all results for debugging
    timestamp: Date.now(),
    isFinal: winner.isFinal,
    words: winner.words,
  };

  return winnerTranscript;
}

/**
 * Transcript buffer manager for time-window based comparison
 */
export class TranscriptBuffer {
  private buffer: Map<number, BufferedTranscript> = new Map();
  private expectedConnectionCount: number;
  private config: typeof CONFIDENCE_CONFIG;
  private onWinnerSelected: (winner: WinnerTranscript) => void;

  constructor(
    expectedConnectionCount: number,
    onWinnerSelected: (winner: WinnerTranscript) => void,
    config: Partial<typeof CONFIDENCE_CONFIG> = {}
  ) {
    this.expectedConnectionCount = expectedConnectionCount;
    this.onWinnerSelected = onWinnerSelected;
    this.config = { ...CONFIDENCE_CONFIG, ...config };
  }

  /**
   * Adds a transcript result to the buffer
   *
   * Groups results by timestamp window and triggers winner selection
   * when the window expires or all connections have responded.
   */
  addResult(result: TranscriptResult): void {
    // Round timestamp to buffer window for grouping
    const bufferKey = Math.floor(
      result.timestamp / this.config.BUFFER_WINDOW_MS
    );

    console.log(
      `📥 Buffering result from [${result.language}] (key=${bufferKey}, isFinal=${result.isFinal})`
    );

    // Get or create buffer for this time window
    let buffered = this.buffer.get(bufferKey);

    if (!buffered) {
      buffered = {
        results: [],
        startTimestamp: Date.now(),
      };
      this.buffer.set(bufferKey, buffered);

      // Set timeout to flush buffer after window expires
      buffered.timeoutHandle = setTimeout(() => {
        this.flushBuffer(bufferKey);
      }, this.config.BUFFER_WINDOW_MS);
    }

    // Add result to buffer
    buffered.results.push(result);

    // If all expected connections have responded, flush immediately
    if (buffered.results.length >= this.expectedConnectionCount) {
      console.log(
        `⚡ All ${this.expectedConnectionCount} connections responded, flushing immediately`
      );
      this.flushBuffer(bufferKey);
    }
  }

  /**
   * Flushes a specific buffer and selects winner
   */
  private flushBuffer(bufferKey: number): void {
    const buffered = this.buffer.get(bufferKey);

    if (!buffered || buffered.results.length === 0) {
      return;
    }

    console.log(
      `🔄 Flushing buffer ${bufferKey} with ${buffered.results.length} results`
    );

    // Clear timeout if it exists
    if (buffered.timeoutHandle) {
      clearTimeout(buffered.timeoutHandle);
    }

    // Select winner from buffered results
    const winner = selectWinnerByConfidence(buffered.results, this.config);

    if (winner) {
      this.onWinnerSelected(winner);
    } else {
      console.warn("⚠️ No winner selected from buffer");
    }

    // Remove buffer
    this.buffer.delete(bufferKey);
  }

  /**
   * Flushes all buffers (useful for cleanup or language change)
   */
  flushAll(): void {
    console.log(`🧹 Flushing all buffers (${this.buffer.size} active)`);

    this.buffer.forEach((_, bufferKey) => {
      this.flushBuffer(bufferKey);
    });
  }

  /**
   * Updates the expected connection count (when connections change)
   */
  updateExpectedCount(count: number): void {
    console.log(`🔢 Updating expected connection count: ${this.expectedConnectionCount} → ${count}`);
    this.expectedConnectionCount = count;
  }

  /**
   * Clears all buffers without flushing (hard reset)
   */
  clear(): void {
    console.log(`🗑️ Clearing all buffers (${this.buffer.size} active)`);

    this.buffer.forEach((buffered) => {
      if (buffered.timeoutHandle) {
        clearTimeout(buffered.timeoutHandle);
      }
    });

    this.buffer.clear();
  }

  /**
   * Gets current buffer statistics
   */
  getStats(): {
    activeBuffers: number;
    totalResults: number;
    oldestBufferAge: number | null;
  } {
    let totalResults = 0;
    let oldestBufferAge: number | null = null;
    const now = Date.now();

    this.buffer.forEach((buffered) => {
      totalResults += buffered.results.length;
      const age = now - buffered.startTimestamp;
      if (oldestBufferAge === null || age > oldestBufferAge) {
        oldestBufferAge = age;
      }
    });

    return {
      activeBuffers: this.buffer.size,
      totalResults,
      oldestBufferAge,
    };
  }
}

/**
 * Calculates average confidence across word-level results
 *
 * Alternative to transcript-level confidence for more granular comparison
 */
export function calculateAverageWordConfidence(
  words: Array<{ confidence: number }> | undefined
): number {
  if (!words || words.length === 0) {
    return 0;
  }

  const sum = words.reduce((acc, word) => acc + word.confidence, 0);
  return sum / words.length;
}

/**
 * Checks if confidence difference is statistically significant
 */
export function isSignificantDifference(
  confidence1: number,
  confidence2: number,
  threshold: number = CONFIDENCE_CONFIG.SIGNIFICANT_DIFFERENCE_THRESHOLD
): boolean {
  return Math.abs(confidence1 - confidence2) >= threshold;
}

/**
 * Ranks all results by confidence (for debugging/analysis)
 */
export function rankResultsByConfidence(
  results: TranscriptResult[]
): TranscriptResult[] {
  return [...results].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Gets confidence statistics across all results
 */
export function getConfidenceStats(results: TranscriptResult[]): {
  min: number;
  max: number;
  average: number;
  median: number;
  spread: number;
} {
  if (results.length === 0) {
    return { min: 0, max: 0, average: 0, median: 0, spread: 0 };
  }

  const confidences = results.map((r) => r.confidence).sort((a, b) => a - b);
  const sum = confidences.reduce((acc, c) => acc + c, 0);

  return {
    min: confidences[0],
    max: confidences[confidences.length - 1],
    average: sum / confidences.length,
    median: confidences[Math.floor(confidences.length / 2)],
    spread: confidences[confidences.length - 1] - confidences[0],
  };
}
