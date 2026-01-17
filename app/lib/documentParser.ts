/**
 * Document Parser Module
 *
 * Extracts text and identifies important terms from various document formats:
 * - PDF files: Extract all text content from each page
 * - PPTX files: Extract text from slides and speaker notes
 * - DOCX files: Extract all text paragraphs
 * - Plain text/markdown: Use directly
 *
 * Also identifies:
 * - Proper nouns (capitalized words that aren't sentence starters)
 * - Technical terms (camelCase, acronyms, etc.)
 * - Repeated important terms
 * - Section headings
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { soundex } from "soundex-code";
import {
  ExtractedTerm,
  UploadedContent,
} from "../types/rag";

/**
 * Supported MIME types for document parsing
 */
export const SUPPORTED_MIME_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  TXT: "text/plain",
  MARKDOWN: "text/markdown",
} as const;

/**
 * Check if a MIME type is supported
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return Object.values(SUPPORTED_MIME_TYPES).includes(mimeType as any);
}

/**
 * Extract text from a PDF file buffer
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Convert Buffer to Uint8Array for pdf-parse
    const uint8Array = new Uint8Array(buffer);
    const pdfParser = new PDFParse({ data: uint8Array });
    const textResult = await pdfParser.getText();
    await pdfParser.destroy();
    return textResult.text || "";
  } catch (error) {
    console.error("❌ PDF parsing error:", error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Extract text from a DOCX file buffer
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages.length > 0) {
      console.warn("⚠️ DOCX parsing warnings:", result.messages);
    }
    return result.value || "";
  } catch (error) {
    console.error("❌ DOCX parsing error:", error);
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Extract text from a PPTX file buffer
 * Note: mammoth doesn't support PPTX natively, so we use a simplified approach
 * For full PPTX support, consider using a dedicated library like pptx-parser
 */
async function extractTextFromPPTX(buffer: Buffer): Promise<string> {
  try {
    // PPTX files are ZIP archives containing XML files
    // We'll use mammoth which can handle some Office formats
    // For a more robust solution, consider using JSZip + xml parsing
    const result = await mammoth.extractRawText({ buffer });
    if (result.value) {
      return result.value;
    }
    
    // Fallback: try to extract any readable text
    const textContent = buffer.toString("utf-8");
    // Extract text between XML tags (simplified approach)
    const textMatches = textContent.match(/>([^<>]+)</g);
    if (textMatches) {
      return textMatches
        .map(match => match.slice(1, -1).trim())
        .filter(text => text.length > 2 && !/^[\d\s]+$/.test(text))
        .join(" ");
    }
    
    return "";
  } catch (error) {
    console.error("❌ PPTX parsing error:", error);
    throw new Error(`Failed to parse PPTX: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Main function to extract text based on file type
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  console.log(`📄 Extracting text from ${fileName} (${mimeType})`);

  switch (mimeType) {
    case SUPPORTED_MIME_TYPES.PDF:
      return extractTextFromPDF(buffer);

    case SUPPORTED_MIME_TYPES.DOCX:
      return extractTextFromDOCX(buffer);

    case SUPPORTED_MIME_TYPES.PPTX:
      return extractTextFromPPTX(buffer);

    case SUPPORTED_MIME_TYPES.TXT:
    case SUPPORTED_MIME_TYPES.MARKDOWN:
      return buffer.toString("utf-8");

    default:
      // Try to handle as plain text
      console.warn(`⚠️ Unknown MIME type ${mimeType}, attempting plain text extraction`);
      return buffer.toString("utf-8");
  }
}

/**
 * Check if a word is a proper noun (capitalized but not a sentence starter)
 */
function isProperNoun(word: string, isAtSentenceStart: boolean): boolean {
  if (word.length < 2) return false;
  
  // Check if first letter is uppercase and rest contains lowercase
  const hasUpperFirst = /^[A-Z]/.test(word);
  const hasLowerCase = /[a-z]/.test(word);
  
  // If at sentence start, we can't be sure it's a proper noun
  if (isAtSentenceStart) return false;
  
  // Common words that are often capitalized but aren't proper nouns
  const commonCapitalized = new Set([
    "The", "A", "An", "This", "That", "These", "Those",
    "I", "We", "You", "He", "She", "It", "They",
    "What", "Who", "Where", "When", "Why", "How",
    "Is", "Are", "Was", "Were", "Will", "Would", "Could", "Should",
  ]);
  
  return hasUpperFirst && hasLowerCase && !commonCapitalized.has(word);
}

/**
 * Check if a word is a technical term
 */
function isTechnicalTerm(word: string): boolean {
  if (word.length < 2) return false;
  
  // Check for camelCase or PascalCase
  const isCamelCase = /^[a-z]+[A-Z]/.test(word);
  const isPascalCase = /^[A-Z][a-z]+[A-Z]/.test(word);
  
  // Check for acronyms (all caps, 2-6 letters)
  const isAcronym = /^[A-Z]{2,6}$/.test(word);
  
  // Check for snake_case or kebab-case
  const hasUnderscoreOrHyphen = /[_-]/.test(word) && /[a-zA-Z]/.test(word);
  
  // Check for words with numbers (like "API2", "v2", "OAuth2")
  const hasNumbers = /[a-zA-Z]+\d+|\d+[a-zA-Z]+/.test(word);
  
  // Check for file extensions or paths
  const isFilePath = /\.[a-z]{2,4}$/.test(word.toLowerCase());
  
  return isCamelCase || isPascalCase || isAcronym || hasUnderscoreOrHyphen || hasNumbers || isFilePath;
}

/**
 * Check if a line is likely a section heading
 */
function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  
  // Short lines that are all caps or title case
  if (trimmed.length < 100 && trimmed.length > 2) {
    // All caps heading
    if (/^[A-Z][A-Z\s\d:.-]+$/.test(trimmed)) return true;
    
    // Markdown heading
    if (/^#{1,6}\s+.+$/.test(trimmed)) return true;
    
    // Numbered heading (e.g., "1. Introduction", "1.2 Overview")
    if (/^\d+(\.\d+)*[\s.:]+[A-Z]/.test(trimmed)) return true;
    
    // Title case short line (likely heading)
    const words = trimmed.split(/\s+/);
    if (words.length <= 6) {
      const titleCaseWords = words.filter(w => /^[A-Z]/.test(w));
      if (titleCaseWords.length / words.length > 0.6) return true;
    }
  }
  
  return false;
}

/**
 * Extract words from text, handling punctuation
 */
function extractWords(text: string): string[] {
  // Split on whitespace and punctuation, keep alphanumeric with some special chars
  return text
    .split(/[\s,;:!?()\[\]{}"'<>]+/)
    .map(word => word.replace(/^[.\-_]+|[.\-_]+$/g, "")) // Trim leading/trailing punctuation
    .filter(word => word.length >= 2);
}

/**
 * Count word frequencies in text
 */
function countWordFrequencies(words: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  
  for (const word of words) {
    const normalized = word.toLowerCase();
    frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
  }
  
  return frequencies;
}

/**
 * Get sentence context for a word
 */
function getSentenceContext(text: string, wordIndex: number, word: string): string {
  // Find the sentence containing this word occurrence
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(word.toLowerCase())) {
      // Return a reasonable-length context
      if (sentence.length <= 200) {
        return sentence;
      }
      // Truncate long sentences
      const wordPos = sentence.toLowerCase().indexOf(word.toLowerCase());
      const start = Math.max(0, wordPos - 80);
      const end = Math.min(sentence.length, wordPos + word.length + 80);
      return (start > 0 ? "..." : "") + sentence.slice(start, end) + (end < sentence.length ? "..." : "");
    }
  }
  
  return "";
}

/**
 * Generate a phonetic code for a term using Soundex
 */
function generatePhoneticCode(term: string): string {
  try {
    // Handle multi-word terms by concatenating soundex of each word
    const words = term.split(/\s+/);
    if (words.length === 1) {
      return soundex(term) || term.substring(0, 4).toUpperCase();
    }
    
    return words
      .map(w => soundex(w) || w.substring(0, 4).toUpperCase())
      .join("-");
  } catch (error) {
    // Fallback to first 4 characters uppercase
    return term.substring(0, 4).toUpperCase();
  }
}

/**
 * Categorize a term based on its characteristics
 */
function categorizeTerm(term: string, context: string): string {
  const lowerTerm = term.toLowerCase();
  const lowerContext = context.toLowerCase();
  
  // Check for person indicators
  const personIndicators = ["mr.", "mrs.", "ms.", "dr.", "prof.", "said", "says", "told", "asked"];
  if (personIndicators.some(ind => lowerContext.includes(ind) && lowerContext.includes(lowerTerm))) {
    return "person";
  }
  
  // Check for organization indicators
  const orgIndicators = ["inc.", "corp.", "ltd.", "llc", "company", "organization", "foundation"];
  if (orgIndicators.some(ind => lowerContext.includes(ind))) {
    return "organization";
  }
  
  // Check for technical terms
  if (isTechnicalTerm(term)) {
    return "technical";
  }
  
  // Check for location indicators
  const locationIndicators = ["city", "country", "state", "located", "in the", "capital"];
  if (locationIndicators.some(ind => lowerContext.includes(ind) && lowerContext.includes(lowerTerm))) {
    return "location";
  }
  
  return "general";
}

/**
 * Extract important terms from text
 */
export function extractTermsFromText(
  text: string,
  sourceFile: string
): ExtractedTerm[] {
  const terms: ExtractedTerm[] = [];
  const seenTerms = new Set<string>();
  
  // Extract all words
  const words = extractWords(text);
  const wordFrequencies = countWordFrequencies(words);
  
  // Split into sentences to detect sentence starters
  const sentences = text.split(/[.!?]+/);
  const sentenceStarters = new Set<string>();
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 0) {
      const firstWord = trimmed.split(/\s+/)[0];
      if (firstWord) {
        sentenceStarters.add(firstWord);
      }
    }
  }
  
  // Process each word
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const normalizedWord = word.toLowerCase();
    
    // Skip if already processed
    if (seenTerms.has(normalizedWord)) continue;
    
    const frequency = wordFrequencies.get(normalizedWord) || 1;
    const isAtSentenceStart = sentenceStarters.has(word);
    const isProper = isProperNoun(word, isAtSentenceStart);
    const isTechnical = isTechnicalTerm(word);
    const isRepeated = frequency >= 3;
    
    // Decide if this term is worth extracting
    const shouldExtract = isProper || isTechnical || isRepeated;
    
    if (shouldExtract) {
      const context = getSentenceContext(text, i, word);
      const category = categorizeTerm(word, context);
      
      seenTerms.add(normalizedWord);
      
      terms.push({
        term: word,
        normalizedTerm: normalizedWord,
        context,
        sourceFile,
        phoneticCode: generatePhoneticCode(word),
        frequency,
        isProperNoun: isProper,
        category,
      });
    }
  }
  
  // Extract section headings as terms
  const lines = text.split("\n");
  for (const line of lines) {
    if (isSectionHeading(line)) {
      const heading = line.replace(/^#+\s*/, "").replace(/^\d+(\.\d+)*[\s.:]+/, "").trim();
      const normalizedHeading = heading.toLowerCase();
      
      if (!seenTerms.has(normalizedHeading) && heading.length > 2) {
        seenTerms.add(normalizedHeading);
        
        terms.push({
          term: heading,
          normalizedTerm: normalizedHeading,
          context: line,
          sourceFile,
          sourceLocation: "heading",
          phoneticCode: generatePhoneticCode(heading),
          frequency: 1,
          isProperNoun: false,
          category: "heading",
        });
      }
    }
  }
  
  // Extract multi-word proper nouns (consecutive capitalized words)
  const multiWordPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = multiWordPattern.exec(text)) !== null) {
    const phrase = match[1];
    const normalizedPhrase = phrase.toLowerCase();
    
    if (!seenTerms.has(normalizedPhrase)) {
      seenTerms.add(normalizedPhrase);
      
      const context = getSentenceContext(text, match.index, phrase);
      
      terms.push({
        term: phrase,
        normalizedTerm: normalizedPhrase,
        context,
        sourceFile,
        phoneticCode: generatePhoneticCode(phrase),
        frequency: 1,
        isProperNoun: true,
        category: categorizeTerm(phrase, context),
      });
    }
  }
  
  console.log(`📊 Extracted ${terms.length} terms from ${sourceFile}`);
  
  return terms;
}

/**
 * Main function to parse an uploaded document
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadedContent> {
  const startTime = Date.now();
  const warnings: string[] = [];
  
  try {
    // Validate MIME type
    if (!isSupportedMimeType(mimeType)) {
      warnings.push(`Unknown MIME type ${mimeType}, attempting to parse anyway`);
    }
    
    // Extract raw text
    const rawText = await extractTextFromFile(buffer, mimeType, fileName);
    
    if (!rawText || rawText.trim().length === 0) {
      return {
        fileName,
        mimeType,
        fileSize: buffer.length,
        rawText: "",
        terms: [],
        processedAt: Date.now(),
        processingTimeMs: Date.now() - startTime,
        warnings: ["No text content could be extracted from the file"],
        success: false,
        error: "Empty content",
      };
    }
    
    // Extract important terms
    const terms = extractTermsFromText(rawText, fileName);
    
    const processingTimeMs = Date.now() - startTime;
    console.log(`✅ Parsed ${fileName} in ${processingTimeMs}ms: ${rawText.length} chars, ${terms.length} terms`);
    
    return {
      fileName,
      mimeType,
      fileSize: buffer.length,
      rawText,
      terms,
      processedAt: Date.now(),
      processingTimeMs,
      warnings: warnings.length > 0 ? warnings : undefined,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Failed to parse ${fileName}:`, errorMessage);
    
    return {
      fileName,
      mimeType,
      fileSize: buffer.length,
      rawText: "",
      terms: [],
      processedAt: Date.now(),
      processingTimeMs: Date.now() - startTime,
      warnings,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Parse multiple documents
 */
export async function parseDocuments(
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>
): Promise<UploadedContent[]> {
  const results = await Promise.all(
    files.map(file => parseDocument(file.buffer, file.fileName, file.mimeType))
  );
  
  return results;
}
