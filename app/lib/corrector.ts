/**
 * Main Corrector Module
 *
 * Orchestrates the complete RAG-based transcription correction pipeline:
 * 1. Receives transcript with word-level confidence scores
 * 2. Identifies low-confidence words
 * 3. Searches session's indexed terms for matches
 * 4. Uses LLM to make intelligent corrections
 * 5. Returns detailed correction results
 *
 * Features:
 * - Single entry point for all correction logic
 * - Performance tracking and logging
 * - Graceful error handling (returns original on failure)
 * - Session-based term isolation
 */

import {
  CorrectionRequest,
  CorrectionResponse,
  WordConfidence,
  ExtractedTerm,
  VectorSearchResult,
  RAGConfig,
  DEFAULT_RAG_CONFIG,
} from "../types/rag";
import { hybridSearch, searchSessionTerms, hasSessionContent, getSessionTerms } from "./vectorStore";
import { processCorrection } from "./llmCorrection";

/**
 * Corrector configuration
 */
export interface CorrectorConfig extends RAGConfig {
  /** Whether to log detailed debug info */
  debug: boolean;
  /** Minimum number of low-confidence words to trigger correction */
  minLowConfidenceWords: number;
  /** Whether to use hybrid search (semantic + phonetic) */
  useHybridSearch: boolean;
  /** Cache of extracted terms for phonetic matching */
  cachedTerms?: ExtractedTerm[];
  /** Skip vector search entirely (use only cached terms with phonetic matching) */
  skipVectorSearch?: boolean;
}

/**
 * Default corrector configuration
 */
export const DEFAULT_CORRECTOR_CONFIG: CorrectorConfig = {
  ...DEFAULT_RAG_CONFIG,
  debug: process.env.NODE_ENV === "development",
  minLowConfidenceWords: 1,
  useHybridSearch: true,
};

/**
 * Correction statistics for monitoring
 */
export interface CorrectionStats {
  totalRequests: number;
  totalCorrections: number;
  avgProcessingTimeMs: number;
  avgTermsRetrieved: number;
  errorCount: number;
  lastCorrectionAt: Date | null;
}

// Global stats tracking
let globalStats: CorrectionStats = {
  totalRequests: 0,
  totalCorrections: 0,
  avgProcessingTimeMs: 0,
  avgTermsRetrieved: 0,
  errorCount: 0,
  lastCorrectionAt: null,
};

/**
 * Logger for correction events
 */
function log(message: string, data?: unknown, isDebug = false): void {
  const timestamp = new Date().toISOString();
  if (isDebug && process.env.NODE_ENV !== "development") return;
  
  if (data) {
    console.log(`[${timestamp}] Corrector: ${message}`, data);
  } else {
    console.log(`[${timestamp}] Corrector: ${message}`);
  }
}

/**
 * Identify words with low confidence from word-level scores
 */
export function identifyLowConfidenceWords(
  wordConfidences: WordConfidence[],
  threshold: number
): Array<{ word: string; confidence: number; position: number; start: number; end: number }> {
  const lowConfidence: Array<{
    word: string;
    confidence: number;
    position: number;
    start: number;
    end: number;
  }> = [];

  for (let i = 0; i < wordConfidences.length; i++) {
    const wc = wordConfidences[i];
    if (wc.confidence < threshold) {
      lowConfidence.push({
        word: wc.word,
        confidence: wc.confidence,
        position: i,
        start: wc.start,
        end: wc.end,
      });
    }
  }

  return lowConfidence;
}

/**
 * Build search queries from low-confidence words
 * Groups adjacent low-confidence words into phrases
 */
export function buildSearchQueries(
  lowConfidenceWords: Array<{ word: string; position: number }>,
  allWords: string[]
): string[] {
  const queries: string[] = [];
  const usedPositions = new Set<number>();

  // Sort by position
  const sorted = [...lowConfidenceWords].sort((a, b) => a.position - b.position);

  // Group adjacent words into phrases
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    let end = start;
    let j = i + 1;

    // Find consecutive low-confidence words
    while (j < sorted.length && sorted[j].position === end.position + 1) {
      end = sorted[j];
      j++;
    }

    // Build phrase from grouped words
    const phraseWords: string[] = [];
    for (let pos = start.position; pos <= end.position; pos++) {
      if (pos < allWords.length) {
        phraseWords.push(allWords[pos]);
        usedPositions.add(pos);
      }
    }

    if (phraseWords.length > 0) {
      queries.push(phraseWords.join(" "));
    }

    // Also add individual words if phrase is long
    if (phraseWords.length > 2) {
      for (const word of phraseWords) {
        if (word.length >= 3) {
          queries.push(word);
        }
      }
    }

    i = j;
  }

  // Add context: include word before/after low-confidence sections
  for (const lcw of sorted) {
    // Word before
    if (lcw.position > 0 && !usedPositions.has(lcw.position - 1)) {
      const contextWord = allWords[lcw.position - 1];
      if (contextWord && contextWord.length >= 3) {
        queries.push(`${contextWord} ${lcw.word}`);
      }
    }
    // Word after
    if (lcw.position < allWords.length - 1 && !usedPositions.has(lcw.position + 1)) {
      const contextWord = allWords[lcw.position + 1];
      if (contextWord && contextWord.length >= 3) {
        queries.push(`${lcw.word} ${contextWord}`);
      }
    }
  }

  // Deduplicate
  return [...new Set(queries)];
}

/**
 * Main correction function
 * 
 * @param request - The correction request with transcript and word confidences
 * @param config - Optional configuration overrides
 * @returns Correction response with modified transcript and details
 */
export async function correctTranscript(
  request: CorrectionRequest,
  config: Partial<CorrectorConfig> = {}
): Promise<CorrectionResponse> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CORRECTOR_CONFIG, ...config };
  
  log(`Processing: "${request.transcript.substring(0, 60)}..."`, {
    sessionId: request.sessionId,
    wordCount: request.wordConfidences.length,
    isFinal: request.isFinal,
  });

  // Track request
  globalStats.totalRequests++;

  try {
    // Step 1: Identify low-confidence words (Deepgram told us it was unsure)
    const threshold = request.confidenceThreshold || cfg.confidenceThreshold;
    const lowConfidenceWords = identifyLowConfidenceWords(request.wordConfidences, threshold);

    log(`Found ${lowConfidenceWords.length} low-confidence words (threshold: ${threshold})`);

    // Step 2: Check if session has indexed content. Without a vocabulary there's
    // nothing to correct against, so bail early.
    const hasContent = await hasSessionContent(request.sessionId).catch(() => false);

    if (!hasContent && !cfg.cachedTerms?.length) {
      log("No indexed content for session - skipping correction");
      return createUnchangedResponse(request, startTime);
    }

    // Step 3: Fetch session terms up-front. We need them before the phonetic
    // sweep can run, regardless of whether low-confidence words were found.
    let sessionTerms: ExtractedTerm[] = cfg.cachedTerms || [];

    if (sessionTerms.length === 0) {
      log("Fetching session terms for phonetic sweep / hybrid search...");
      sessionTerms = await getSessionTerms(request.sessionId);
      log(`Retrieved ${sessionTerms.length} terms`);

      if (sessionTerms.length > 0) {
        const sampleTerms = sessionTerms.slice(0, 5).map(t => t.term);
        log(`Sample terms: ${sampleTerms.join(", ")}`);
      }
    }

    // Step 4: Phonetic sweep. Scan EVERY word in the transcript against indexed
    // terms, regardless of Deepgram confidence. This catches high-confidence
    // real-word mishearings like "Groq" → "rock" that the confidence gate misses.
    const allWords = request.transcript.split(/\s+/);
    const suspiciousPositions = new Map<
      number,
      { word: string; confidence: number; position: number; start: number; end: number }
    >();

    // Seed with low-confidence words first
    for (const lcw of lowConfidenceWords) {
      suspiciousPositions.set(lcw.position, lcw);
    }

    log(
      `[SWEEP] Entering phonetic sweep. ` +
        `wordConfidences=${request.wordConfidences.length}, ` +
        `sessionTerms=${sessionTerms.length}`
    );
    if (sessionTerms.length > 0) {
      log(
        `[SWEEP] First 10 indexed terms: ${sessionTerms
          .slice(0, 10)
          .map(t => t.term)
          .join(", ")}`
      );
    }

    if (sessionTerms.length > 0) {
      const { calculatePhoneticSimilarity } = await import("./phoneticMatcher");
      const sweepThreshold = 0.6; // similarity at/above this = worth investigating

      // Build a lowercase set of indexed terms (and their head words) for fast
      // "already correct" checks. A word is only "already correct" if it exactly
      // matches an indexed term string — NOT if it merely shares a phonetic code
      // (homophones like "Grock"/"Groq" share a metaphone but one is wrong).
      const indexedWordSet = new Set<string>();
      for (const term of sessionTerms) {
        const norm = term.normalizedTerm || term.term.toLowerCase();
        indexedWordSet.add(norm);
        for (const w of norm.split(/\s+/)) {
          if (w) indexedWordSet.add(w);
        }
      }

      for (let i = 0; i < request.wordConfidences.length; i++) {
        if (suspiciousPositions.has(i)) continue; // already queued via low-confidence path

        const wc = request.wordConfidences[i];
        // Skip trivial words — tiny tokens produce noisy phonetic matches
        const cleaned = wc.word.replace(/[^\p{L}\p{N}]/gu, "");
        if (cleaned.length < 3) {
          log(`[SWEEP] skip "${wc.word}" @${i} — too short (cleaned="${cleaned}")`);
          continue;
        }

        const cleanedLower = cleaned.toLowerCase();
        // Exact match against an indexed term → word is already correct
        if (indexedWordSet.has(cleanedLower)) {
          log(`[SWEEP] skip "${wc.word}" @${i} — already in indexed term set`);
          continue;
        }

        let bestSim = 0;
        let bestTerm = "";
        for (const term of sessionTerms) {
          // Compare against the first word of multi-word terms too, since we're
          // scanning per-word against potentially multi-word vocabulary entries.
          const termHead = term.term.split(/\s+/)[0];
          const { similarity } = calculatePhoneticSimilarity(cleaned, termHead);
          if (similarity > bestSim) {
            bestSim = similarity;
            bestTerm = termHead;
          }
        }

        log(
          `[SWEEP] word "${wc.word}" @${i} conf=${wc.confidence.toFixed(2)} ` +
            `bestSim=${bestSim.toFixed(3)} bestTerm="${bestTerm}" ` +
            `→ ${bestSim >= sweepThreshold ? "FLAGGED" : "ok"}`
        );

        // A homophone (phonetic similarity 1.0 but different spelling) is the
        // MOST important case to catch, e.g. "Grock" ↔ "Groq" both encode to KRK.
        if (bestSim >= sweepThreshold) {
          suspiciousPositions.set(i, {
            word: wc.word,
            confidence: wc.confidence,
            position: i,
            start: wc.start,
            end: wc.end,
          });
        }
      }
    }

    const suspiciousWords = Array.from(suspiciousPositions.values()).sort(
      (a, b) => a.position - b.position
    );

    log(
      `Total suspicious words: ${suspiciousWords.length} ` +
        `(${lowConfidenceWords.length} low-confidence + ` +
        `${suspiciousWords.length - lowConfidenceWords.length} phonetic-sweep)`
    );

    // Early exit: nothing suspicious in either bucket
    if (suspiciousWords.length < cfg.minLowConfidenceWords) {
      log("No correction needed - no low-confidence or phonetically suspicious words");
      return createUnchangedResponse(request, startTime);
    }

    // Step 5: Build search queries from the combined suspicious set
    const searchQueries = buildSearchQueries(
      suspiciousWords.map(w => ({ word: w.word, position: w.position })),
      allWords
    );

    log(`Built ${searchQueries.length} search queries`, searchQueries, true);

    // Step 6: Search for matching terms
    let candidateTerms: VectorSearchResult[] = [];

    if (cfg.skipVectorSearch && sessionTerms.length > 0) {
      // Phonetic-only search using cached terms (for testing or offline mode)
      log("Using phonetic-only search with cached terms");
      const { findPhoneticallySimilarTerms } = await import("./phoneticMatcher");
      
      for (const query of searchQueries.slice(0, 5)) {
        log(`Phonetic search for: "${query}"`);
        const phoneticMatches = findPhoneticallySimilarTerms(query, sessionTerms, {
          minSimilarity: 0.3,
          maxResults: cfg.maxTermsToRetrieve,
        });
        
        log(`  Found ${phoneticMatches.length} phonetic matches`);
        for (const match of phoneticMatches) {
          log(`    - "${match.term.term}" (similarity: ${match.similarity.toFixed(3)})`);
          candidateTerms.push({
            term: match.term,
            semanticScore: 0,
            phoneticScore: match.similarity,
            combinedScore: match.similarity,
            matchType: "phonetic",
          });
        }
      }
    } else if (cfg.useHybridSearch && sessionTerms.length > 0) {
      // Use hybrid search with session terms for phonetic matching
      log("Using hybrid search (semantic + phonetic)");
      for (const query of searchQueries.slice(0, 5)) { // Limit queries
        log(`Hybrid search for: "${query}"`);
        const results = await hybridSearch(
          request.sessionId,
          query,
          sessionTerms,
          cfg.maxTermsToRetrieve
        );
        candidateTerms.push(...results);
      }
    } else {
      // Use semantic search only
      for (const query of searchQueries.slice(0, 5)) {
        const results = await searchSessionTerms(
          request.sessionId,
          query,
          cfg.maxTermsToRetrieve
        );
        candidateTerms.push(...results);
      }
    }

    // Deduplicate candidate terms
    const uniqueTerms = new Map<string, VectorSearchResult>();
    for (const result of candidateTerms) {
      const key = result.term.normalizedTerm;
      const existing = uniqueTerms.get(key);
      if (!existing || result.combinedScore > existing.combinedScore) {
        uniqueTerms.set(key, result);
      }
    }
    candidateTerms = Array.from(uniqueTerms.values());

    log(`Found ${candidateTerms.length} unique candidate terms`);
    
    // Debug: log candidate terms found
    if (candidateTerms.length > 0) {
      log("Candidate terms for correction:");
      for (const ct of candidateTerms.slice(0, 10)) {
        log(`  - "${ct.term.term}" (semantic: ${ct.semanticScore.toFixed(3)}, phonetic: ${ct.phoneticScore.toFixed(3)}, combined: ${ct.combinedScore.toFixed(3)}, type: ${ct.matchType})`);
      }
    }

    // Early exit: no matching terms found
    if (candidateTerms.length === 0) {
      log("No matching terms found - returning original");
      return createUnchangedResponse(request, startTime);
    }

    // Step 7: Apply corrections using LLM. Pass the full suspicious set
    // (low-confidence ∪ phonetic sweep) as explicit focus words so the LLM and
    // rule-based fallback both know to look at high-confidence mishearings.
    const focusWords = suspiciousWords.map(w => ({
      word: w.word,
      confidence: w.confidence,
      position: w.position,
    }));

    // Build the set of "already correct" terms from the full session vocabulary
    // (not just retrieved candidates). Words already matching one of these are
    // never rewritten, and every proposed correction is validated against it.
    // This is what prevents a correctly-transcribed indexed word like
    // "jailbreak" from being mangled into "java break".
    const protectedTermSet = new Set<string>();
    for (const term of sessionTerms) {
      const norm = (term.normalizedTerm || term.term).toLowerCase().trim();
      if (!norm) continue;
      protectedTermSet.add(norm);
      for (const w of norm.split(/\s+/)) {
        if (w.length >= 3) protectedTermSet.add(w);
      }
    }

    const correctionResult = await processCorrection(
      request,
      candidateTerms,
      {
        useLLM: cfg.useLLMCorrection,
        apiKey: process.env.GROQ_API_KEY,
        ruleBasedThreshold: cfg.similarityThreshold,
      },
      focusWords,
      protectedTermSet
    );

    // Step 8: Build response
    const processingTimeMs = Date.now() - startTime;

    const response: CorrectionResponse = {
      ...correctionResult,
      processingTimeMs,
    };

    // Update stats
    if (response.wasModified) {
      globalStats.totalCorrections += response.corrections.length;
      globalStats.lastCorrectionAt = new Date();
    }
    updateAverages(processingTimeMs, candidateTerms.length);

    log(`Completed in ${processingTimeMs}ms`, {
      wasModified: response.wasModified,
      corrections: response.corrections.length,
      termsRetrieved: candidateTerms.length,
    });

    // Log individual corrections
    if (response.corrections.length > 0 && cfg.debug) {
      for (const c of response.corrections) {
        log(`  Correction: "${c.original}" → "${c.corrected}" (${c.matchType})`);
      }
    }

    return response;

  } catch (error) {
    globalStats.errorCount++;
    log("Error during correction - returning original", { error: String(error) });
    
    return createUnchangedResponse(request, startTime, [
      `Correction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    ]);
  }
}

/**
 * Create an unchanged response (when no corrections needed or on error)
 */
function createUnchangedResponse(
  request: CorrectionRequest,
  startTime: number,
  warnings?: string[]
): CorrectionResponse {
  return {
    originalTranscript: request.transcript,
    correctedTranscript: request.transcript,
    wasModified: false,
    corrections: [],
    processingTimeMs: Date.now() - startTime,
    termsRetrieved: 0,
    sessionId: request.sessionId,
    warnings,
  };
}

/**
 * Update running averages
 */
function updateAverages(processingTimeMs: number, termsRetrieved: number): void {
  const n = globalStats.totalRequests;
  globalStats.avgProcessingTimeMs = 
    ((globalStats.avgProcessingTimeMs * (n - 1)) + processingTimeMs) / n;
  globalStats.avgTermsRetrieved = 
    ((globalStats.avgTermsRetrieved * (n - 1)) + termsRetrieved) / n;
}

/**
 * Get current correction statistics
 */
export function getCorrectionStats(): CorrectionStats {
  return { ...globalStats };
}

/**
 * Reset correction statistics
 */
export function resetCorrectionStats(): void {
  globalStats = {
    totalRequests: 0,
    totalCorrections: 0,
    avgProcessingTimeMs: 0,
    avgTermsRetrieved: 0,
    errorCount: 0,
    lastCorrectionAt: null,
  };
}

/**
 * Convenience function to correct a simple transcript string
 * Creates mock word confidences with all words at low confidence
 */
export async function correctSimpleTranscript(
  transcript: string,
  sessionId: string,
  cachedTerms?: ExtractedTerm[],
  config: Partial<CorrectorConfig> = {}
): Promise<string> {
  const words = transcript.split(/\s+/);
  
  const wordConfidences: WordConfidence[] = words.map((word, i) => ({
    word,
    confidence: 0.5, // Low confidence to trigger correction
    start: i * 0.5,
    end: (i + 1) * 0.5,
  }));

  const request: CorrectionRequest = {
    transcript,
    wordConfidences,
    sessionId,
    language: "en",
    isFinal: true,
    confidenceThreshold: 0.7,
  };

  const response = await correctTranscript(request, {
    ...config,
    cachedTerms,
  });

  return response.correctedTranscript;
}

/**
 * Check if RAG correction is enabled
 */
export function isRAGEnabled(): boolean {
  return process.env.RAG_ENABLED === "true";
}

/**
 * Get RAG configuration from environment
 */
export function getRAGConfig(): Partial<CorrectorConfig> {
  return {
    enabled: process.env.RAG_ENABLED === "true",
    confidenceThreshold: parseFloat(process.env.RAG_CONFIDENCE_THRESHOLD || "0.7"),
    useLLMCorrection: !!process.env.GROQ_API_KEY,
    debug: process.env.NODE_ENV === "development",
  };
}
