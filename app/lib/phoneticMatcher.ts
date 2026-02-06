/**
 * Phonetic Matching Module
 *
 * Implements phonetic similarity for catching sound-alike transcription errors.
 * This is crucial because:
 * - "Kubernetes" sounds like "cooper netties"
 * - "OAuth" sounds like "oh auth"
 * - Semantic embeddings won't catch pronunciation similarity
 *
 * Uses multiple algorithms for better matching:
 * - Soundex: Classic algorithm, good for similar sounding names
 * - Metaphone: More sophisticated, handles more edge cases
 * - Levenshtein on phonetic codes: Catch partial matches
 */

import { soundex } from "soundex-code";
import { ExtractedTerm } from "../types/rag";

/**
 * Phonetic match result
 */
export interface PhoneticMatch {
  /** The matched term */
  term: ExtractedTerm;
  /** Phonetic similarity score (0-1) */
  similarity: number;
  /** The algorithm that produced the best match */
  matchedBy: "soundex" | "metaphone" | "normalized" | "combined";
  /** Phonetic code of the query */
  queryCode: string;
  /** Phonetic code of the matched term */
  termCode: string;
}

/**
 * Phonetic matching configuration
 */
export interface PhoneticMatchConfig {
  /** Minimum similarity score to consider a match (0-1) */
  minSimilarity: number;
  /** Maximum number of results to return */
  maxResults: number;
  /** Whether to use Metaphone algorithm in addition to Soundex */
  useMetaphone: boolean;
  /** Whether to compare word-by-word for phrases */
  compareWordByWord: boolean;
  /** Boost for exact phonetic code matches */
  exactMatchBoost: number;
}

/**
 * Default phonetic matching configuration
 */
export const DEFAULT_PHONETIC_CONFIG: PhoneticMatchConfig = {
  minSimilarity: 0.5,
  maxResults: 10,
  useMetaphone: true,
  compareWordByWord: true,
  exactMatchBoost: 0.2,
};

/**
 * Generate Soundex code for a word
 * Handles edge cases and normalizes input
 */
export function getSoundexCode(word: string): string {
  try {
    // Clean the word - remove non-alphabetic characters
    const cleaned = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (cleaned.length === 0) return "";

    const code = soundex(cleaned);
    return code || cleaned.substring(0, 4).toUpperCase();
  } catch {
    return word.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, "");
  }
}

/**
 * Generate Metaphone code for a word
 * A more sophisticated phonetic algorithm than Soundex
 */
export function getMetaphoneCode(word: string): string {
  const cleaned = word.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (cleaned.length === 0) return "";

  // Metaphone encoding rules (simplified implementation)
  let result = "";
  let i = 0;

  // Skip initial silent letters
  const skipInitial = ["KN", "GN", "PN", "AE", "WR"];
  for (const prefix of skipInitial) {
    if (cleaned.startsWith(prefix)) {
      i = 1;
      break;
    }
  }

  // Special case for initial X
  if (cleaned[0] === "X") {
    result += "S";
    i = 1;
  }

  while (i < cleaned.length) {
    const char = cleaned[i];
    const next = cleaned[i + 1] || "";
    const prev = cleaned[i - 1] || "";
    const next2 = cleaned[i + 2] || "";

    switch (char) {
      case "A":
      case "E":
      case "I":
      case "O":
      case "U":
        // Vowels only kept at start
        if (i === 0) result += char;
        break;

      case "B":
        // B is silent after M at end
        if (!(prev === "M" && i === cleaned.length - 1)) {
          result += "P";
        }
        break;

      case "C":
        // CI, CE, CY -> S
        if (["I", "E", "Y"].includes(next)) {
          result += "S";
        }
        // CH -> X (or K)
        else if (next === "H") {
          result += ["A", "O", "U"].includes(prev) ? "K" : "X";
          i++;
        }
        // CK -> K (skip the K)
        else if (next === "K") {
          result += "K";
          i++;
        }
        else {
          result += "K";
        }
        break;

      case "D":
        // DGE, DGI, DGY -> J
        if (next === "G" && ["E", "I", "Y"].includes(next2)) {
          result += "J";
          i++;
        } else {
          result += "T";
        }
        break;

      case "F":
        result += "F";
        break;

      case "G":
        // GH is silent before T
        if (next === "H" && next2 === "T") {
          i += 2;
        }
        // GN at end is silent
        else if (next === "N" && i === cleaned.length - 2) {
          i++;
        }
        // GI, GE, GY -> J
        else if (["I", "E", "Y"].includes(next)) {
          result += "J";
        }
        else if (next !== "H") {
          result += "K";
        }
        break;

      case "H":
        // H is kept only between vowels
        if (!"AEIOU".includes(prev) && "AEIOU".includes(next)) {
          result += "H";
        }
        break;

      case "J":
        result += "J";
        break;

      case "K":
        // K is silent after C
        if (prev !== "C") {
          result += "K";
        }
        break;

      case "L":
        result += "L";
        break;

      case "M":
        result += "M";
        break;

      case "N":
        result += "N";
        break;

      case "P":
        // PH -> F
        if (next === "H") {
          result += "F";
          i++;
        } else {
          result += "P";
        }
        break;

      case "Q":
        result += "K";
        break;

      case "R":
        result += "R";
        break;

      case "S":
        // SH, SIO, SIA -> X
        if (next === "H" || (next === "I" && (next2 === "O" || next2 === "A"))) {
          result += "X";
          if (next === "H") i++;
        } else {
          result += "S";
        }
        break;

      case "T":
        // TH -> 0 (theta sound)
        if (next === "H") {
          result += "0";
          i++;
        }
        // TIO, TIA -> X
        else if (next === "I" && (next2 === "O" || next2 === "A")) {
          result += "X";
        }
        else {
          result += "T";
        }
        break;

      case "V":
        result += "F";
        break;

      case "W":
        // W before vowel
        if ("AEIOU".includes(next)) {
          result += "W";
        }
        break;

      case "X":
        result += "KS";
        break;

      case "Y":
        // Y before vowel
        if ("AEIOU".includes(next)) {
          result += "Y";
        }
        break;

      case "Z":
        result += "S";
        break;
    }

    i++;
  }

  return result;
}

/**
 * Generate phonetic code for a phrase (multiple words)
 * Combines codes for each word
 */
export function getPhrasePhoneticCode(
  phrase: string,
  algorithm: "soundex" | "metaphone" = "soundex"
): string {
  const words = phrase
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.replace(/[^a-zA-Z]/g, ""))
    .filter(w => w.length > 0);

  if (words.length === 0) return "";

  const codeFunc = algorithm === "soundex" ? getSoundexCode : getMetaphoneCode;
  const codes = words.map(w => codeFunc(w));

  return codes.join("-");
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for comparing phonetic codes
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculate phonetic similarity between two strings (0-1)
 * Uses multiple algorithms and returns the best score
 */
export function calculatePhoneticSimilarity(
  query: string,
  target: string,
  config: Partial<PhoneticMatchConfig> = {}
): { similarity: number; matchedBy: PhoneticMatch["matchedBy"]; queryCode: string; termCode: string } {
  const cfg = { ...DEFAULT_PHONETIC_CONFIG, ...config };

  // Normalize inputs
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTarget = target.toLowerCase().trim();

  // Quick exact match check
  if (normalizedQuery === normalizedTarget) {
    return { similarity: 1.0, matchedBy: "normalized", queryCode: normalizedQuery, termCode: normalizedTarget };
  }

  // Get phonetic codes
  const querySoundex = getPhrasePhoneticCode(query, "soundex");
  const targetSoundex = getPhrasePhoneticCode(target, "soundex");

  // Soundex similarity
  let soundexSimilarity = 0;
  if (querySoundex && targetSoundex) {
    if (querySoundex === targetSoundex) {
      soundexSimilarity = 1.0;
    } else {
      const distance = levenshteinDistance(querySoundex, targetSoundex);
      const maxLen = Math.max(querySoundex.length, targetSoundex.length);
      soundexSimilarity = 1 - (distance / maxLen);
    }
  }

  let metaphoneSimilarity = 0;
  let queryMetaphone = "";
  let targetMetaphone = "";

  // Metaphone similarity (if enabled)
  if (cfg.useMetaphone) {
    queryMetaphone = getPhrasePhoneticCode(query, "metaphone");
    targetMetaphone = getPhrasePhoneticCode(target, "metaphone");

    if (queryMetaphone && targetMetaphone) {
      if (queryMetaphone === targetMetaphone) {
        metaphoneSimilarity = 1.0;
      } else {
        const distance = levenshteinDistance(queryMetaphone, targetMetaphone);
        const maxLen = Math.max(queryMetaphone.length, targetMetaphone.length);
        metaphoneSimilarity = 1 - (distance / maxLen);
      }
    }
  }

  // Word-by-word comparison for phrases
  let wordByWordSimilarity = 0;
  if (cfg.compareWordByWord) {
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 0);

    if (queryWords.length > 0 && targetWords.length > 0) {
      // Find best matching alignment
      let totalScore = 0;
      let matchCount = 0;

      for (const qWord of queryWords) {
        let bestWordScore = 0;
        for (const tWord of targetWords) {
          const qCode = getSoundexCode(qWord);
          const tCode = getSoundexCode(tWord);

          if (qCode === tCode) {
            bestWordScore = Math.max(bestWordScore, 1.0);
          } else if (qCode && tCode) {
            const dist = levenshteinDistance(qCode, tCode);
            const maxLen = Math.max(qCode.length, tCode.length);
            bestWordScore = Math.max(bestWordScore, 1 - (dist / maxLen));
          }
        }
        totalScore += bestWordScore;
        matchCount++;
      }

      // Penalize for different word counts
      const wordCountPenalty = 1 - (Math.abs(queryWords.length - targetWords.length) * 0.1);
      wordByWordSimilarity = (totalScore / matchCount) * Math.max(0.5, wordCountPenalty);
    }
  }

  // Choose the best result
  if (soundexSimilarity >= metaphoneSimilarity && soundexSimilarity >= wordByWordSimilarity) {
    return {
      similarity: soundexSimilarity,
      matchedBy: "soundex",
      queryCode: querySoundex,
      termCode: targetSoundex,
    };
  } else if (metaphoneSimilarity >= wordByWordSimilarity) {
    return {
      similarity: metaphoneSimilarity,
      matchedBy: "metaphone",
      queryCode: queryMetaphone,
      termCode: targetMetaphone,
    };
  } else {
    return {
      similarity: wordByWordSimilarity,
      matchedBy: "combined",
      queryCode: querySoundex,
      termCode: targetSoundex,
    };
  }
}

/**
 * Find phonetically similar terms from a list of extracted terms
 */
export function findPhoneticallySimilarTerms(
  query: string,
  terms: ExtractedTerm[],
  config: Partial<PhoneticMatchConfig> = {}
): PhoneticMatch[] {
  const cfg = { ...DEFAULT_PHONETIC_CONFIG, ...config };
  const matches: PhoneticMatch[] = [];

  for (const term of terms) {
    const result = calculatePhoneticSimilarity(query, term.term, cfg);

    if (result.similarity >= cfg.minSimilarity) {
      // Apply exact match boost
      const boostedSimilarity = result.similarity === 1.0
        ? Math.min(1.0, result.similarity + cfg.exactMatchBoost)
        : result.similarity;

      matches.push({
        term,
        similarity: boostedSimilarity,
        matchedBy: result.matchedBy,
        queryCode: result.queryCode,
        termCode: result.termCode,
      });
    }
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);

  return matches.slice(0, cfg.maxResults);
}

/**
 * Check if two phrases are phonetically similar
 * Useful for quick checks without full term list
 */
export function arePhoneticallySimilar(
  phrase1: string,
  phrase2: string,
  minSimilarity: number = 0.7
): boolean {
  const result = calculatePhoneticSimilarity(phrase1, phrase2);
  return result.similarity >= minSimilarity;
}

/**
 * Get all phonetic codes for a term (for debugging/display)
 */
export function getAllPhoneticCodes(text: string): {
  soundex: string;
  metaphone: string;
  phraseSoundex: string;
  phraseMetaphone: string;
} {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const firstWord = words[0] || text;

  return {
    soundex: getSoundexCode(firstWord),
    metaphone: getMetaphoneCode(firstWord),
    phraseSoundex: getPhrasePhoneticCode(text, "soundex"),
    phraseMetaphone: getPhrasePhoneticCode(text, "metaphone"),
  };
}

/**
 * Normalize text for phonetic comparison
 * Handles common transcription variations
 */
export function normalizeForPhonetic(text: string): string {
  return text
    .toLowerCase()
    // Remove punctuation except hyphens and apostrophes
    .replace(/[^\w\s'-]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split compound words that might have been run together in transcription
 * e.g., "coopernetties" might be "cooper netties"
 */
export function splitCompoundWord(word: string): string[] {
  if (word.length < 6) return [word];

  const results: string[] = [word];

  // Try splitting at various points
  for (let i = 3; i < word.length - 2; i++) {
    const part1 = word.substring(0, i);
    const part2 = word.substring(i);

    // Only consider splits where both parts are reasonable lengths
    if (part1.length >= 3 && part2.length >= 3) {
      results.push(`${part1} ${part2}`);
    }
  }

  return results;
}

/**
 * Find best phonetic match considering compound word splits
 */
export function findBestPhoneticMatch(
  query: string,
  terms: ExtractedTerm[],
  config: Partial<PhoneticMatchConfig> = {}
): PhoneticMatch | null {
  // Try the query as-is
  let matches = findPhoneticallySimilarTerms(query, terms, config);

  if (matches.length > 0 && matches[0].similarity >= 0.8) {
    return matches[0];
  }

  // Try splitting compound words in the query
  const queryWords = query.split(/\s+/);
  const expandedQueries: string[] = [query];

  for (const word of queryWords) {
    const splits = splitCompoundWord(word);
    for (const split of splits) {
      if (split !== word) {
        const newQuery = query.replace(word, split);
        expandedQueries.push(newQuery);
      }
    }
  }

  // Also try joining words together
  if (queryWords.length > 1) {
    for (let i = 0; i < queryWords.length - 1; i++) {
      const joined = queryWords.slice(0, i + 1).join("") + " " + queryWords.slice(i + 1).join(" ");
      expandedQueries.push(joined.trim());

      const joined2 = queryWords.slice(0, i + 1).join(" ") + queryWords.slice(i + 1).join("");
      expandedQueries.push(joined2.trim());
    }
    // All joined
    expandedQueries.push(queryWords.join(""));
  }

  // Find best match across all query variations
  let bestMatch: PhoneticMatch | null = null;

  for (const expandedQuery of expandedQueries) {
    const expandedMatches = findPhoneticallySimilarTerms(expandedQuery, terms, config);
    if (expandedMatches.length > 0) {
      if (!bestMatch || expandedMatches[0].similarity > bestMatch.similarity) {
        bestMatch = expandedMatches[0];
      }
    }
  }

  return bestMatch;
}
