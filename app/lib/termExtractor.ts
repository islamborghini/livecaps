/**
 * Term Extraction Module
 *
 * Intelligent term extraction that:
 * - Identifies proper nouns and named entities (people, companies, products)
 * - Finds technical jargon and acronyms
 * - Extracts terms with their surrounding context (2-3 sentences)
 * - Generates phonetic codes for each term (for sound-alike matching)
 * - Deduplicates and ranks terms by importance
 */

import { soundex } from "soundex-code";
import { ExtractedTerm } from "../types/rag";

/**
 * Term categories for classification
 */
export type TermCategory =
  | "person"
  | "organization"
  | "location"
  | "product"
  | "technical"
  | "acronym"
  | "heading"
  | "general";

/**
 * Configuration for term extraction
 */
export interface TermExtractionConfig {
  /** Minimum word length to consider */
  minWordLength: number;
  /** Minimum frequency for general terms to be included */
  minFrequencyForGeneral: number;
  /** Maximum number of context sentences to include */
  maxContextSentences: number;
  /** Whether to extract acronyms */
  extractAcronyms: boolean;
  /** Whether to extract technical terms */
  extractTechnicalTerms: boolean;
  /** Whether to extract multi-word phrases */
  extractPhrases: boolean;
  /** Maximum phrase length (words) */
  maxPhraseLength: number;
}

/**
 * Default extraction configuration
 */
export const DEFAULT_EXTRACTION_CONFIG: TermExtractionConfig = {
  minWordLength: 2,
  minFrequencyForGeneral: 3,
  maxContextSentences: 2,
  extractAcronyms: true,
  extractTechnicalTerms: true,
  extractPhrases: true,
  maxPhraseLength: 4,
};

/**
 * Common English words to ignore (stop words)
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "before", "after", "above", "below", "between", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "can", "will", "just", "should", "now", "also", "like", "even", "way",
  "because", "any", "these", "those", "this", "that", "which", "what",
  "who", "whom", "whose", "its", "their", "our", "your", "his", "her",
  "we", "they", "you", "he", "she", "it", "i", "me", "my", "mine",
  "us", "them", "him", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "done", "say", "said", "says", "go", "going",
  "get", "got", "make", "made", "know", "known", "think", "see", "come",
  "take", "want", "use", "find", "give", "tell", "work", "may", "would",
  "could", "if", "as", "is", "are", "was", "were", "am",
]);

/**
 * Common title prefixes that indicate person names
 */
const PERSON_PREFIXES = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "professor", "sir", "madam",
  "rev", "reverend", "hon", "honorable", "pres", "president", "gov",
  "governor", "sen", "senator", "rep", "representative", "ceo", "cto",
  "cfo", "coo", "vp", "director", "manager", "chairman", "founder",
]);

/**
 * Common organization suffixes
 */
const ORG_SUFFIXES = new Set([
  "inc", "corp", "corporation", "ltd", "limited", "llc", "llp", "plc",
  "co", "company", "companies", "group", "holdings", "partners",
  "associates", "foundation", "institute", "university", "college",
  "technologies", "tech", "software", "systems", "solutions", "services",
  "labs", "laboratory", "research", "consulting", "international",
]);

/**
 * Common location indicators
 */
const LOCATION_INDICATORS = new Set([
  "city", "town", "village", "county", "state", "province", "country",
  "region", "district", "street", "avenue", "road", "boulevard", "lane",
  "drive", "plaza", "square", "park", "building", "tower", "center",
  "north", "south", "east", "west", "central", "downtown", "uptown",
]);

/**
 * Split text into sentences, handling edge cases
 */
export function splitIntoSentences(text: string): string[] {
  // Handle common abbreviations to avoid false splits
  const protectedText = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Corp|Jr|Sr|vs|etc|e\.g|i\.e)\./gi, "$1▲")
    .replace(/\b([A-Z])\./g, "$1▲"); // Single letter abbreviations

  // Split on sentence boundaries
  const sentences = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$/)
    .map(s => s.replace(/▲/g, ".").trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * Get surrounding context for a term using pre-built index
 */
export function getTermContextFast(
  term: string,
  sentenceIndex: Map<string, number[]>,
  sentences: string[],
  maxSentences: number = 2
): string {
  const termLower = term.toLowerCase();
  const matchingIndices = sentenceIndex.get(termLower);
  
  if (matchingIndices && matchingIndices.length > 0) {
    const matchingSentences: string[] = [];
    const firstIdx = matchingIndices[0];
    matchingSentences.push(sentences[firstIdx]);
    if (matchingSentences.length < maxSentences && firstIdx + 1 < sentences.length) {
      matchingSentences.push(sentences[firstIdx + 1]);
    }
    return matchingSentences.join(" ").trim();
  }
  
  // Fallback for phrases not in index - just return first 100 chars of term location
  return term;
}

/**
 * Get surrounding context for a term (2-3 sentences) - legacy
 */
export function getTermContext(
  sentences: string[],
  term: string,
  maxSentences: number = 2
): string {
  const termLower = term.toLowerCase();
  const matchingSentences: string[] = [];

  for (let i = 0; i < sentences.length && matchingSentences.length < maxSentences; i++) {
    if (sentences[i].toLowerCase().includes(termLower)) {
      // Include the matching sentence
      matchingSentences.push(sentences[i]);

      // Try to include the next sentence for more context if available
      if (matchingSentences.length < maxSentences && i + 1 < sentences.length) {
        matchingSentences.push(sentences[i + 1]);
      }
    }
  }

  if (matchingSentences.length === 0) {
    // Fallback: find any occurrence and extract surrounding text
    const termIndex = sentences.join(" ").toLowerCase().indexOf(termLower);
    if (termIndex !== -1) {
      const fullText = sentences.join(" ");
      const start = Math.max(0, termIndex - 100);
      const end = Math.min(fullText.length, termIndex + term.length + 100);
      return (start > 0 ? "..." : "") + fullText.slice(start, end).trim() + (end < fullText.length ? "..." : "");
    }
  }

  return matchingSentences.join(" ").trim();
}

/**
 * Generate phonetic code for a term using Soundex
 * Handles multi-word terms by combining codes
 */
export function generatePhoneticCode(term: string): string {
  try {
    const words = term.split(/\s+/).filter(w => w.length > 0);

    if (words.length === 1) {
      // Single word - direct soundex
      const code = soundex(words[0]);
      return code || words[0].substring(0, 4).toUpperCase();
    }

    // Multi-word - combine first letter + soundex of significant words
    const codes = words
      .filter(w => !STOP_WORDS.has(w.toLowerCase()))
      .slice(0, 3) // Max 3 words for phonetic code
      .map(w => {
        const code = soundex(w);
        return code || w.substring(0, 4).toUpperCase();
      });

    return codes.join("-");
  } catch (error) {
    return term.substring(0, 8).toUpperCase().replace(/\s+/g, "-");
  }
}

/**
 * Check if a word is an acronym
 */
export function isAcronym(word: string): boolean {
  // All caps, 2-6 characters
  if (/^[A-Z]{2,6}$/.test(word)) return true;

  // Caps with numbers (e.g., "4G", "5G", "B2B")
  if (/^[A-Z0-9]{2,6}$/.test(word) && /[A-Z]/.test(word)) return true;

  // Caps with dots (e.g., "U.S.A.")
  if (/^([A-Z]\.){2,}$/.test(word)) return true;

  return false;
}

/**
 * Check if a word is a technical term
 */
export function isTechnicalTerm(word: string): boolean {
  // camelCase
  if (/^[a-z]+[A-Z][a-zA-Z]*$/.test(word)) return true;

  // PascalCase with mixed case
  if (/^[A-Z][a-z]+[A-Z][a-zA-Z]*$/.test(word)) return true;

  // snake_case or kebab-case
  if (/^[a-zA-Z]+[_-][a-zA-Z_-]+$/.test(word)) return true;

  // Words with numbers mixed in (v2, 3D, OAuth2)
  if (/[a-zA-Z]+\d+[a-zA-Z]*|\d+[a-zA-Z]+/.test(word)) return true;

  // File extensions or paths
  if (/\.[a-z]{2,4}$/i.test(word)) return true;

  // Hash or code-like strings
  if (/^[a-f0-9]{6,}$/i.test(word)) return true;

  return false;
}

/**
 * Check if a word is likely a proper noun
 */
export function isProperNoun(word: string, isAtSentenceStart: boolean): boolean {
  // Must start with uppercase
  if (!/^[A-Z]/.test(word)) return false;

  // Must contain lowercase (not all caps)
  if (!/[a-z]/.test(word)) return false;

  // If at sentence start, we need more evidence
  if (isAtSentenceStart) {
    // Length > 1 and not a common word
    const lower = word.toLowerCase();
    return word.length > 1 && !STOP_WORDS.has(lower);
  }

  return true;
}

/**
 * Categorize a term based on context and patterns
 */
export function categorizeTerm(
  term: string,
  context: string,
  isFromHeading: boolean = false
): TermCategory {
  if (isFromHeading) return "heading";

  const termLower = term.toLowerCase();
  const contextLower = context.toLowerCase();

  // Check for acronym first
  if (isAcronym(term)) return "acronym";

  // Check for technical term
  if (isTechnicalTerm(term)) return "technical";

  // Check for person (title prefixes or action verbs)
  const personPatterns = [
    /\b(said|says|told|asked|explained|noted|added|wrote|founded|led|manages?|directs?)\b/i,
    new RegExp(`\\b(${Array.from(PERSON_PREFIXES).join("|")})\\.?\\s+${termLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
  ];
  if (personPatterns.some(p => p.test(contextLower))) return "person";

  // Check for organization
  const orgPatterns = [
    new RegExp(`${termLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(${Array.from(ORG_SUFFIXES).join("|")})`, "i"),
    /\b(company|firm|corporation|organization|founded|headquartered|acquired|merged)\b/i,
  ];
  if (orgPatterns.some(p => p.test(contextLower))) return "organization";

  // Check for location
  const hasLocationIndicator = Array.from(LOCATION_INDICATORS).some(
    ind => contextLower.includes(ind) && contextLower.includes(termLower)
  );
  const locationPatterns = [
    /\b(located|based|headquarters?|capital|city of|in the|from the)\b.*\b/i,
  ];
  if (hasLocationIndicator || locationPatterns.some(p => p.test(contextLower))) {
    return "location";
  }

  // Check for product (often with version numbers, features, etc.)
  const productPatterns = [
    /\b(version|release|feature|update|launch|product|platform|app|application|software)\b/i,
    /\b(introducing|announcing|new|latest)\b/i,
  ];
  if (productPatterns.some(p => p.test(contextLower))) return "product";

  return "general";
}

/**
 * Extract multi-word proper noun phrases
 */
export function extractProperNounPhrases(text: string): string[] {
  const phrases: string[] = [];
  const MAX_PHRASES = 200; // Limit to prevent slow processing

  // Match sequences of capitalized words (2-4 words)
  const patterns = [
    // Two or more capitalized words
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
    // Capitalized words with "of", "the", "and" in between
    /\b([A-Z][a-z]+(?:\s+(?:of|the|and|for)\s+[A-Z][a-z]+)+)\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null && phrases.length < MAX_PHRASES) {
      const phrase = match[1];
      // Filter out common phrases that aren't proper nouns
      if (!isCommonPhrase(phrase)) {
        phrases.push(phrase);
      }
    }
    if (phrases.length >= MAX_PHRASES) break;
  }

  return [...new Set(phrases)];
}

/**
 * Check if a phrase is a common non-proper-noun phrase
 */
function isCommonPhrase(phrase: string): boolean {
  const commonPhrases = new Set([
    "The End", "In The", "Of The", "For The", "And The",
    "New York", // This IS a proper noun, keep it
  ]);

  // Generic sentence starters
  if (/^(This|That|These|Those|There|Here|When|Where|What|Why|How)\s/i.test(phrase)) {
    return true;
  }

  return false;
}

/**
 * Extract terms from text with full analysis
 */
export function extractTerms(
  text: string,
  sourceFile: string,
  config: Partial<TermExtractionConfig> = {}
): ExtractedTerm[] {
  const cfg = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
  const terms: ExtractedTerm[] = [];
  const seenTerms = new Map<string, ExtractedTerm>();

  // Split text into sentences for context extraction
  const sentences = splitIntoSentences(text);

  // Build word-to-sentence index for O(1) context lookup
  const sentenceIndex = new Map<string, number[]>();
  for (let i = 0; i < sentences.length; i++) {
    const sentenceWords = sentences[i].toLowerCase().split(/\s+/);
    for (const word of sentenceWords) {
      const cleanWord = word.replace(/[^a-z0-9'-]/g, "");
      if (cleanWord.length >= 2) {
        const indices = sentenceIndex.get(cleanWord) || [];
        if (!indices.includes(i)) {
          indices.push(i);
          sentenceIndex.set(cleanWord, indices);
        }
      }
    }
  }

  // Extract sentence starters (to identify proper nouns correctly)
  const sentenceStarters = new Set<string>();
  for (const sentence of sentences) {
    const firstWord = sentence.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "");
    if (firstWord) sentenceStarters.add(firstWord);
  }

  // Count word frequencies
  const wordFrequencies = new Map<string, number>();
  const words = text.split(/\s+/).map(w => w.replace(/[^a-zA-Z0-9'-]/g, "")).filter(w => w.length >= cfg.minWordLength);

  for (const word of words) {
    const lower = word.toLowerCase();
    wordFrequencies.set(lower, (wordFrequencies.get(lower) || 0) + 1);
  }

  // Process each word
  for (const word of words) {
    const normalizedWord = word.toLowerCase();

    // Skip stop words and already processed terms
    if (STOP_WORDS.has(normalizedWord)) continue;
    if (seenTerms.has(normalizedWord)) continue;

    const frequency = wordFrequencies.get(normalizedWord) || 1;
    const isAtSentenceStart = sentenceStarters.has(word);

    // Determine if this term should be extracted
    let shouldExtract = false;
    let category: TermCategory = "general";

    // Check for acronyms
    if (cfg.extractAcronyms && isAcronym(word)) {
      shouldExtract = true;
      category = "acronym";
    }
    // Check for technical terms
    else if (cfg.extractTechnicalTerms && isTechnicalTerm(word)) {
      shouldExtract = true;
      category = "technical";
    }
    // Check for proper nouns
    else if (isProperNoun(word, isAtSentenceStart)) {
      shouldExtract = true;
      // Category will be determined by context
    }
    // Check for repeated terms
    else if (frequency >= cfg.minFrequencyForGeneral) {
      shouldExtract = true;
      category = "general";
    }

    if (shouldExtract) {
      const context = getTermContextFast(word, sentenceIndex, sentences, cfg.maxContextSentences);

      // Refine category based on context if not already specific
      if (category === "general" || !["acronym", "technical"].includes(category)) {
        category = categorizeTerm(word, context);
      }

      const extractedTerm: ExtractedTerm = {
        term: word,
        normalizedTerm: normalizedWord,
        context,
        sourceFile,
        phoneticCode: generatePhoneticCode(word),
        frequency,
        isProperNoun: isProperNoun(word, false),
        category,
      };

      seenTerms.set(normalizedWord, extractedTerm);
      terms.push(extractedTerm);
    }
  }

  // Extract multi-word phrases (limit to prevent slowness)
  if (cfg.extractPhrases) {
    const phrases = extractProperNounPhrases(text);

    for (const phrase of phrases) {
      const normalizedPhrase = phrase.toLowerCase();

      if (seenTerms.has(normalizedPhrase)) continue;

      // Check word count
      const wordCount = phrase.split(/\s+/).length;
      if (wordCount > cfg.maxPhraseLength) continue;

      // Use fast context lookup - for phrases, use first word
      const firstWord = phrase.split(/\s+/)[0]?.toLowerCase();
      const context = firstWord 
        ? getTermContextFast(firstWord, sentenceIndex, sentences, cfg.maxContextSentences)
        : phrase;
      const category = categorizeTerm(phrase, context);
      // Estimate frequency based on word frequencies (fast)
      const phraseWords = normalizedPhrase.split(/\s+/);
      const minWordFreq = Math.min(...phraseWords.map(w => wordFrequencies.get(w) || 1));
      const frequency = Math.max(1, Math.floor(minWordFreq / 2));

      const extractedTerm: ExtractedTerm = {
        term: phrase,
        normalizedTerm: normalizedPhrase,
        context,
        sourceFile,
        phoneticCode: generatePhoneticCode(phrase),
        frequency,
        isProperNoun: true,
        category,
      };

      seenTerms.set(normalizedPhrase, extractedTerm);
      terms.push(extractedTerm);
    }
  }

  // Extract headings as terms
  const headingPatterns = [
    /^#{1,6}\s+(.+)$/gm,  // Markdown headings
    /^([A-Z][A-Z\s]+)$/gm,  // ALL CAPS lines
    /^\d+(\.\d+)*\s+([A-Z].+)$/gm,  // Numbered headings
  ];

  for (const pattern of headingPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const heading = (match[2] || match[1]).trim();
      const normalizedHeading = heading.toLowerCase();

      if (seenTerms.has(normalizedHeading)) continue;
      if (heading.length < 3 || heading.length > 100) continue;

      const extractedTerm: ExtractedTerm = {
        term: heading,
        normalizedTerm: normalizedHeading,
        context: match[0],
        sourceFile,
        sourceLocation: "heading",
        phoneticCode: generatePhoneticCode(heading),
        frequency: 1,
        isProperNoun: false,
        category: "heading",
      };

      seenTerms.set(normalizedHeading, extractedTerm);
      terms.push(extractedTerm);
    }
  }

  // Sort by importance: frequency * category weight
  const categoryWeights: Record<TermCategory, number> = {
    person: 1.5,
    organization: 1.4,
    product: 1.3,
    location: 1.2,
    acronym: 1.1,
    technical: 1.0,
    heading: 0.9,
    general: 0.8,
  };

  terms.sort((a, b) => {
    const scoreA = a.frequency * (categoryWeights[a.category as TermCategory] || 1);
    const scoreB = b.frequency * (categoryWeights[b.category as TermCategory] || 1);
    return scoreB - scoreA;
  });

  console.log(`📊 Extracted ${terms.length} terms from ${sourceFile}`);
  console.log(`   Categories: ${Object.entries(
    terms.reduce((acc, t) => {
      acc[t.category || "unknown"] = (acc[t.category || "unknown"] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([k, v]) => `${k}:${v}`).join(", ")}`);

  return terms;
}

/**
 * Merge terms from multiple sources, deduplicating and combining contexts
 */
export function mergeTerms(termLists: ExtractedTerm[][]): ExtractedTerm[] {
  const mergedMap = new Map<string, ExtractedTerm>();

  for (const terms of termLists) {
    for (const term of terms) {
      const existing = mergedMap.get(term.normalizedTerm);

      if (existing) {
        // Merge: combine frequency, extend context if different
        existing.frequency += term.frequency;

        if (!existing.context.includes(term.context.substring(0, 50))) {
          // Add new context if it's different
          existing.context = existing.context + " | " + term.context;
        }

        // Keep the more specific category
        const categoryPriority: TermCategory[] = [
          "person", "organization", "product", "location",
          "acronym", "technical", "heading", "general"
        ];
        const existingPriority = categoryPriority.indexOf(existing.category as TermCategory);
        const newPriority = categoryPriority.indexOf(term.category as TermCategory);
        if (newPriority < existingPriority) {
          existing.category = term.category;
        }
      } else {
        mergedMap.set(term.normalizedTerm, { ...term });
      }
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Filter terms by category
 */
export function filterTermsByCategory(
  terms: ExtractedTerm[],
  categories: TermCategory[]
): ExtractedTerm[] {
  return terms.filter(t => categories.includes(t.category as TermCategory));
}

/**
 * Get top N terms by importance score
 */
export function getTopTerms(terms: ExtractedTerm[], n: number): ExtractedTerm[] {
  return terms.slice(0, n);
}

/**
 * Find terms that phonetically match a given word
 */
export function findPhoneticMatches(
  terms: ExtractedTerm[],
  word: string,
  maxResults: number = 5
): ExtractedTerm[] {
  const wordCode = generatePhoneticCode(word);

  // Find exact phonetic matches
  const exactMatches = terms.filter(t => t.phoneticCode === wordCode);

  if (exactMatches.length >= maxResults) {
    return exactMatches.slice(0, maxResults);
  }

  // Find partial matches (for multi-word terms)
  const partialMatches = terms.filter(t => {
    if (exactMatches.includes(t)) return false;
    return t.phoneticCode.includes(wordCode) || wordCode.includes(t.phoneticCode);
  });

  return [...exactMatches, ...partialMatches].slice(0, maxResults);
}
