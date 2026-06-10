/**
 * LLM Correction Module
 *
 * Uses Groq's Llama model to intelligently correct transcription errors
 * based on user-uploaded vocabulary and context.
 *
 * Features:
 * - Context-aware correction using user's own terms
 * - Preserves sentence structure and grammar
 * - Conservative approach - only corrects when confident
 * - Rule-based fallback when API is unavailable
 */

import Groq from "groq-sdk";
import {
  CorrectionRequest,
  CorrectionResponse,
  CorrectionDetail,
  WordConfidence,
  ExtractedTerm,
  VectorSearchResult,
} from "../types/rag";
import { calculatePhoneticSimilarity } from "./phoneticMatcher";

/**
 * LLM correction configuration
 */
export interface LLMCorrectionConfig {
  /** Groq API key */
  apiKey: string;
  /** Model to use */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for generation (lower = more deterministic) */
  temperature: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Minimum similarity score to apply rule-based correction */
  ruleBasedThreshold: number;
  /** Whether to use LLM or just rule-based */
  useLLM: boolean;
  /**
   * Minimum phonetic similarity (0-1) between the original word and the
   * proposed replacement for a correction to be accepted. Guards against the
   * LLM substituting words that don't actually sound like any indexed term.
   */
  minCorrectionSimilarity: number;
}

/**
 * Default LLM correction configuration
 */
export const DEFAULT_LLM_CONFIG: LLMCorrectionConfig = {
  apiKey: process.env.GROQ_API_KEY || "",
  model: "llama-3.3-70b-versatile",
  maxTokens: 512,
  temperature: 0.1, // Low temperature for more consistent corrections
  timeoutMs: 5000,
  ruleBasedThreshold: 0.7, // Lowered from 0.85 for better phonetic matching
  useLLM: true,
  minCorrectionSimilarity: 0.6, // Reject substitutions that don't sound alike
};

/**
 * Margin by which a *different* candidate term must out-score the LLM's chosen
 * replacement (phonetically) before we veto the correction. Prevents picking
 * the wrong one of two similar indexed terms (e.g. "java" vs "jailbreak").
 */
const BETTER_CANDIDATE_MARGIN = 0.1;

/**
 * Cached Groq client instance
 */
let groqClient: Groq | null = null;

/**
 * Get or create the Groq client
 */
function getGroqClient(config: Partial<LLMCorrectionConfig> = {}): Groq {
  const cfg = { ...DEFAULT_LLM_CONFIG, ...config };

  if (!groqClient) {
    if (!cfg.apiKey) {
      throw new Error("Groq API key not configured. Set GROQ_API_KEY environment variable.");
    }

    groqClient = new Groq({
      apiKey: cfg.apiKey,
    });
  }

  return groqClient;
}

/**
 * Build the correction prompt for the LLM
 */
function buildCorrectionPrompt(
  transcript: string,
  lowConfidenceWords: Array<{ word: string; confidence: number; position: number }>,
  candidateTerms: VectorSearchResult[]
): string {
  // Format the candidate terms
  const termsSection = candidateTerms
    .map(r => `- "${r.term.term}" (${r.term.category || "general"}): ${r.term.context.substring(0, 100)}...`)
    .join("\n");

  // Format low confidence words
  const lowConfWords = lowConfidenceWords
    .map(w => `"${w.word}" (confidence: ${(w.confidence * 100).toFixed(0)}%)`)
    .join(", ");

  return `You are a transcription correction assistant. Your task is to fix misheard words in a speech transcript using terms from the speaker's own presentation materials.

## Speaker's Vocabulary (from their uploaded content):
${termsSection}

## Original Transcript:
"${transcript}"

## Words with Low Transcription Confidence:
${lowConfWords}

## Instructions:
1. ONLY replace words that sound similar to terms from the speaker's vocabulary above
2. Focus on the low-confidence words, but also check nearby words
3. Preserve the original sentence structure and grammar
4. If a word sounds like a term from the vocabulary (e.g., "cooper netties" sounds like "Kubernetes"), replace it
5. If you're uncertain about a correction, keep the original word
6. Technical terms, names, and acronyms are the most likely to be misheard

## Response Format:
Return ONLY a JSON object with this exact structure:
{
  "correctedTranscript": "the full corrected transcript",
  "corrections": [
    {
      "original": "misheard word or phrase",
      "corrected": "correct term",
      "reason": "brief explanation"
    }
  ]
}

If no corrections are needed, return:
{
  "correctedTranscript": "original transcript unchanged",
  "corrections": []
}

Return ONLY valid JSON, no other text.`;
}

/**
 * Parse the LLM response into structured corrections
 */
function parseLLMResponse(
  response: string,
  originalTranscript: string
): { correctedTranscript: string; corrections: Array<{ original: string; corrected: string; reason: string }> } {
  try {
    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Handle markdown code blocks
    if (jsonStr.includes("```json")) {
      const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonStr = match[1];
      }
    } else if (jsonStr.includes("```")) {
      const match = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonStr = match[1];
      }
    }

    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      correctedTranscript: parsed.correctedTranscript || originalTranscript,
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
    };
  } catch (error) {
    console.warn("Failed to parse LLM response as JSON:", error);

    // Try to extract corrections from non-JSON response
    // Look for patterns like "X" -> "Y" or "X" should be "Y"
    const corrections: Array<{ original: string; corrected: string; reason: string }> = [];

    const replacementPatterns = [
      /"([^"]+)"\s*(?:->|→|should be|becomes?|corrected to)\s*"([^"]+)"/gi,
      /replace\s+"([^"]+)"\s+with\s+"([^"]+)"/gi,
    ];

    for (const pattern of replacementPatterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        corrections.push({
          original: match[1],
          corrected: match[2],
          reason: "LLM suggestion",
        });
      }
    }

    // Apply corrections to get the corrected transcript
    let correctedTranscript = originalTranscript;
    for (const correction of corrections) {
      correctedTranscript = correctedTranscript.replace(
        new RegExp(correction.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        correction.corrected
      );
    }

    return { correctedTranscript, corrections };
  }
}

/**
 * Escape a string for safe use inside a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize a token/phrase for term comparison: lowercase, strip punctuation
 * (keeping intra-word apostrophes/hyphens), collapse whitespace.
 */
function cleanForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validate a single proposed correction before it is applied.
 *
 * The LLM returns a full rewritten transcript and will sometimes substitute
 * words that aren't similar to any indexed term, rewrite words that were
 * already correct, or pick the wrong one of two similar terms. Every proposed
 * correction must clear all of these gates or it is discarded.
 *
 * @param protectedTerms - Normalized set of indexed terms (and their tokens).
 *   A word that already exactly matches one of these is considered correct and
 *   must never be rewritten.
 */
function validateCorrection(
  original: string,
  corrected: string,
  candidateTerms: VectorSearchResult[],
  protectedTerms: Set<string>,
  minSimilarity: number
): { valid: boolean; reason: string } {
  const origNorm = cleanForCompare(original);
  const corrNorm = cleanForCompare(corrected);

  if (!origNorm || !corrNorm) return { valid: false, reason: "empty original/corrected" };
  if (origNorm === corrNorm) return { valid: false, reason: "no change" };

  // (a) The replacement must be a real indexed/candidate term — never let the
  //     LLM invent a substitution that isn't in the speaker's vocabulary.
  const knownTargets = new Set(candidateTerms.map(c => cleanForCompare(c.term.term)));
  if (!knownTargets.has(corrNorm) && !protectedTerms.has(corrNorm)) {
    return { valid: false, reason: `target "${corrected}" is not an indexed term` };
  }

  // (b) Never rewrite a word that is ALREADY a valid indexed term. This is the
  //     "jailbreak → java break" case: jailbreak was indexed and correct.
  if (protectedTerms.has(origNorm)) {
    return { valid: false, reason: `"${original}" is already a valid term` };
  }

  // (c) Phonetic floor — the original and replacement must actually sound alike.
  //     Kills nonsense substitutions between unrelated words.
  const chosenSim = calculatePhoneticSimilarity(origNorm, corrNorm).similarity;
  if (chosenSim < minSimilarity) {
    return {
      valid: false,
      reason: `phonetic similarity ${chosenSim.toFixed(2)} < ${minSimilarity}`,
    };
  }

  // (d) The chosen term must be (near) the best-sounding candidate. If a
  //     different candidate sounds clearly closer, the LLM picked wrong —
  //     reject rather than apply a confidently-wrong correction.
  for (const c of candidateTerms) {
    const t = cleanForCompare(c.term.term);
    if (t === corrNorm) continue;
    const otherSim = calculatePhoneticSimilarity(origNorm, t).similarity;
    if (otherSim > chosenSim + BETTER_CANDIDATE_MARGIN) {
      return {
        valid: false,
        reason: `"${c.term.term}" (${otherSim.toFixed(2)}) sounds closer than "${corrected}" (${chosenSim.toFixed(2)})`,
      };
    }
  }

  return { valid: true, reason: "ok" };
}

/**
 * Build the corrected transcript by applying ONLY validated corrections to the
 * original text. We deliberately do not trust the LLM's rewritten transcript,
 * since it may bundle in unvalidated changes.
 */
function applyValidatedCorrections(
  transcript: string,
  corrections: CorrectionDetail[]
): string {
  let out = transcript;
  for (const c of corrections) {
    const escaped = escapeRegExp(c.original);
    // Prefer word-boundary replacement; fall back to a loose replace for
    // multi-word originals or those carrying punctuation.
    const boundary = new RegExp(`\\b${escaped}\\b`, "gi");
    if (boundary.test(out)) {
      out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), c.corrected);
    } else {
      out = out.replace(new RegExp(escaped, "gi"), c.corrected);
    }
  }
  return out;
}

/**
 * Apply LLM-based correction to a transcript
 */
export async function correctWithLLM(
  transcript: string,
  lowConfidenceWords: Array<{ word: string; confidence: number; position: number }>,
  candidateTerms: VectorSearchResult[],
  config: Partial<LLMCorrectionConfig> = {},
  protectedTerms: Set<string> = new Set()
): Promise<{
  correctedTranscript: string;
  corrections: CorrectionDetail[];
  usedLLM: boolean;
}> {
  const cfg = { ...DEFAULT_LLM_CONFIG, ...config };
  const startTime = Date.now();

  // If no candidate terms, nothing to correct against
  if (candidateTerms.length === 0) {
    return {
      correctedTranscript: transcript,
      corrections: [],
      usedLLM: false,
    };
  }

  // If LLM is disabled, use rule-based only
  if (!cfg.useLLM || !cfg.apiKey) {
    console.log("Using rule-based correction (LLM disabled or no API key)");
    return applyRuleBasedCorrections(transcript, lowConfidenceWords, candidateTerms, cfg, protectedTerms);
  }

  try {
    const client = getGroqClient(cfg);

    const prompt = buildCorrectionPrompt(transcript, lowConfidenceWords, candidateTerms);

    console.log("Calling LLM for correction...");

    const completion = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        {
          role: "system",
          content: "You are a precise transcription correction assistant. You only output valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
    });

    const responseText = completion.choices[0]?.message?.content || "";

    console.log(`LLM response received (${Date.now() - startTime}ms)`);

    const parsed = parseLLMResponse(responseText, transcript);

    // Validate each proposed correction. The LLM's rewritten transcript is
    // NOT trusted: it routinely substitutes words that aren't similar to any
    // indexed term, or picks the wrong one of two similar terms. We keep only
    // corrections that pass phonetic + indexed-term validation, then rebuild
    // the transcript ourselves from those.
    const corrections: CorrectionDetail[] = [];
    for (let i = 0; i < parsed.corrections.length; i++) {
      const c = parsed.corrections[i];
      const check = validateCorrection(
        c.original,
        c.corrected,
        candidateTerms,
        protectedTerms,
        cfg.minCorrectionSimilarity
      );

      if (!check.valid) {
        console.log(`  Rejected LLM correction "${c.original}" → "${c.corrected}": ${check.reason}`);
        continue;
      }

      corrections.push({
        original: c.original,
        corrected: c.corrected,
        reason: c.reason,
        confidence: 0.8, // LLM corrections get moderate confidence
        matchedTerm: candidateTerms.find(t =>
          t.term.term.toLowerCase() === c.corrected.toLowerCase()
        )?.term.term,
        matchType: "llm" as const,
        position: i,
      });
    }

    // Rebuild from validated corrections only — never apply the raw LLM rewrite.
    const correctedTranscript = applyValidatedCorrections(transcript, corrections);

    return {
      correctedTranscript,
      corrections,
      usedLLM: true,
    };
  } catch (error) {
    console.warn("LLM correction failed, falling back to rule-based:", error);
    return applyRuleBasedCorrections(transcript, lowConfidenceWords, candidateTerms, cfg, protectedTerms);
  }
}

/**
 * Apply rule-based corrections without LLM
 * Used as fallback when API is unavailable or for high-confidence matches
 */
export function applyRuleBasedCorrections(
  transcript: string,
  lowConfidenceWords: Array<{ word: string; confidence: number; position: number }>,
  candidateTerms: VectorSearchResult[],
  config: Partial<LLMCorrectionConfig> = {},
  protectedTerms: Set<string> = new Set()
): {
  correctedTranscript: string;
  corrections: CorrectionDetail[];
  usedLLM: boolean;
} {
  const cfg = { ...DEFAULT_LLM_CONFIG, ...config };
  const corrections: CorrectionDetail[] = [];
  let correctedTranscript = transcript;

  console.log("Applying rule-based corrections...");

  // Build a map of potential replacements from candidate terms
  const termMap = new Map<string, VectorSearchResult>();
  for (const result of candidateTerms) {
    termMap.set(result.term.normalizedTerm, result);
  }

  // Process each low-confidence word
  for (const lcWord of lowConfidenceWords) {
    const word = lcWord.word.toLowerCase();

    // Skip words that are already a valid indexed term — they're correct.
    if (protectedTerms.has(cleanForCompare(word))) {
      continue;
    }

    // Find the best matching term
    let bestMatch: VectorSearchResult | null = null;
    let bestScore = 0;

    for (const result of candidateTerms) {
      // Check phonetic similarity between the word and the term
      const phoneticResult = calculatePhoneticSimilarity(word, result.term.term);

      // Only use phonetic score - the combinedScore from search was for the query, not this word
      const matchScore = phoneticResult.similarity;

      if (matchScore > bestScore && matchScore >= cfg.ruleBasedThreshold) {
        bestScore = matchScore;
        bestMatch = result;
      }
    }

    // Apply correction if we found a high-confidence match
    if (bestMatch && bestScore >= cfg.ruleBasedThreshold) {
      const original = lcWord.word;
      const corrected = bestMatch.term.term;

      // Only apply if different
      if (original.toLowerCase() !== corrected.toLowerCase()) {
        // Replace in transcript (case-insensitive, preserve surrounding punctuation)
        const pattern = new RegExp(
          `\\b${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "gi"
        );

        correctedTranscript = correctedTranscript.replace(pattern, corrected);

        corrections.push({
          original,
          corrected,
          reason: `High phonetic/semantic similarity (${(bestScore * 100).toFixed(0)}%)`,
          confidence: bestScore,
          matchedTerm: corrected,
          matchType: bestMatch.matchType === "phonetic" ? "phonetic" : "semantic",
          position: lcWord.position,
        });

        console.log(`  "${original}" → "${corrected}" (${(bestScore * 100).toFixed(0)}%)`);
      }
    }
  }

  // Also check for multi-word phrase corrections
  // This catches cases like "cooper netties" -> "Kubernetes"
  for (const result of candidateTerms) {
    const term = result.term.term;
    const termLower = term.toLowerCase();

    // Skip single words (already handled above)
    if (!term.includes(" ")) continue;

    // Check if any variation of this term exists in the transcript
    const words = transcript.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length - 1; i++) {
      // Try 2-word and 3-word combinations
      for (let len = 2; len <= Math.min(3, words.length - i); len++) {
        const phrase = words.slice(i, i + len).join(" ");

        // Skip phrases that already exactly match an indexed term.
        if (protectedTerms.has(cleanForCompare(phrase))) {
          continue;
        }

        const phoneticResult = calculatePhoneticSimilarity(phrase, term);

        if (phoneticResult.similarity >= cfg.ruleBasedThreshold) {
          // Find the actual phrase in the original transcript
          const originalPhrase = transcript
            .split(/\s+/)
            .slice(i, i + len)
            .join(" ");

          if (originalPhrase.toLowerCase() !== termLower) {
            // Replace the phrase
            correctedTranscript = correctedTranscript.replace(
              new RegExp(
                originalPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "gi"
              ),
              term
            );

            corrections.push({
              original: originalPhrase,
              corrected: term,
              reason: `Phrase phonetic match (${(phoneticResult.similarity * 100).toFixed(0)}%)`,
              confidence: phoneticResult.similarity,
              matchedTerm: term,
              matchType: "phonetic",
              position: i,
            });

            console.log(`  "${originalPhrase}" → "${term}" (phrase match)`);
          }
        }
      }
    }
  }

  return {
    correctedTranscript,
    corrections,
    usedLLM: false,
  };
}

/**
 * Process a complete correction request
 * This is the main entry point for the correction system
 *
 * @param focusWords - Optional explicit list of words to focus correction on.
 *   When provided, overrides the default confidence-based filter. This lets
 *   upstream (corrector.ts) flag high-confidence phonetic near-misses like
 *   "Grock" ↔ "Groq" that the confidence gate would otherwise miss.
 * @param protectedTerms - Normalized set of indexed terms (and their tokens).
 *   Words already matching one of these are treated as correct and never
 *   rewritten; proposed corrections are validated against this set.
 */
export async function processCorrection(
  request: CorrectionRequest,
  candidateTerms: VectorSearchResult[],
  config: Partial<LLMCorrectionConfig> = {},
  focusWords?: Array<{ word: string; confidence: number; position: number }>,
  protectedTerms: Set<string> = new Set()
): Promise<CorrectionResponse> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_LLM_CONFIG, ...config };

  console.log(`\nProcessing correction for: "${request.transcript.substring(0, 50)}..."`);

  // Prefer explicit focus list (from upstream phonetic sweep); fall back to
  // confidence-only filtering when the caller didn't provide one.
  const wordsToCorrect =
    focusWords ??
    request.wordConfidences
      .filter(wc => wc.confidence < (request.confidenceThreshold || 0.7))
      .map((wc, idx) => ({
        word: wc.word,
        confidence: wc.confidence,
        position: idx,
      }));

  console.log(`  Words to correct: ${wordsToCorrect.length}`);
  console.log(`  Candidate terms: ${candidateTerms.length}`);

  // If no words to correct or no candidate terms, return unchanged
  if (wordsToCorrect.length === 0 || candidateTerms.length === 0) {
    return {
      originalTranscript: request.transcript,
      correctedTranscript: request.transcript,
      wasModified: false,
      corrections: [],
      processingTimeMs: Date.now() - startTime,
      termsRetrieved: candidateTerms.length,
      sessionId: request.sessionId,
    };
  }

  // Try LLM correction, with rule-based fallback
  const result = await correctWithLLM(
    request.transcript,
    wordsToCorrect,
    candidateTerms,
    cfg,
    protectedTerms
  );

  const response: CorrectionResponse = {
    originalTranscript: request.transcript,
    correctedTranscript: result.correctedTranscript,
    wasModified: result.corrections.length > 0,
    corrections: result.corrections,
    processingTimeMs: Date.now() - startTime,
    termsRetrieved: candidateTerms.length,
    sessionId: request.sessionId,
    warnings: result.usedLLM ? undefined : ["Used rule-based correction (LLM unavailable)"],
  };

  console.log(`  Result: ${response.wasModified ? "Modified" : "Unchanged"} (${response.processingTimeMs}ms)`);

  return response;
}

/**
 * Quick correction without full request structure
 * Useful for testing or simple use cases
 */
export async function quickCorrect(
  transcript: string,
  terms: ExtractedTerm[],
  config: Partial<LLMCorrectionConfig> = {}
): Promise<string> {
  // Convert ExtractedTerms to VectorSearchResults
  const candidateTerms: VectorSearchResult[] = terms.map(term => ({
    term,
    semanticScore: 0.8,
    phoneticScore: 0.8,
    combinedScore: 0.8,
    matchType: "semantic" as const,
  }));

  // Create fake word confidences (assume all low confidence)
  const words = transcript.split(/\s+/);
  const wordConfidences: WordConfidence[] = words.map((word, i) => ({
    word,
    confidence: 0.5, // Low confidence to trigger correction
    start: i,
    end: i + 1,
  }));

  const request: CorrectionRequest = {
    transcript,
    wordConfidences,
    sessionId: "quick-correct",
    language: "en",
    isFinal: true,
    confidenceThreshold: 0.7,
  };

  const response = await processCorrection(request, candidateTerms, config);
  return response.correctedTranscript;
}

/**
 * Reset the Groq client (useful for testing)
 */
export function resetGroqClient(): void {
  groqClient = null;
}
