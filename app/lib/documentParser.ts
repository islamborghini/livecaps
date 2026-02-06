/**
 * Document Parser Module
 *
 * Extracts text and identifies important terms from various document formats:
 * - PDF files: Extract all text content from each page
 * - PPTX files: Extract text from slides and speaker notes
 * - DOCX files: Extract all text paragraphs
 * - Plain text/markdown: Use directly
 *
 * Uses the termExtractor module for intelligent term extraction.
 */

import mammoth from "mammoth";
import { extractText } from "unpdf";
import JSZip from "jszip";
import {
  ExtractedTerm,
  UploadedContent,
} from "../types/rag";
import { extractTerms, TermExtractionConfig } from "./termExtractor";

// Parse PDF using unpdf (compatible with Next.js App Router)
async function parsePDF(buffer: Buffer): Promise<string> {
  // unpdf requires Uint8Array, not Buffer
  const uint8Array = new Uint8Array(buffer);
  const { text } = await extractText(uint8Array, { mergePages: true });
  return text || "";
}

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
    // Use the parsePDF helper which handles dynamic import
    return await parsePDF(buffer);
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
 * Extract text from a PPTX file buffer using JSZip
 * PPTX files are ZIP archives containing XML files with slide content
 */
async function extractTextFromPPTX(buffer: Buffer): Promise<string> {
  try {
    // Convert Buffer to Uint8Array for JSZip compatibility
    const uint8Array = new Uint8Array(buffer);
    const zip = await JSZip.loadAsync(uint8Array);
    const textParts: string[] = [];
    
    // Get all slide XML files (ppt/slides/slide1.xml, slide2.xml, etc.)
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
        return numA - numB;
      });
    
    for (const slideFile of slideFiles) {
      const content = await zip.files[slideFile].async("text");
      // Extract text from XML - look for <a:t> tags (text runs)
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
      if (textMatches) {
        const slideText = textMatches
          .map(match => match.replace(/<\/?a:t>/g, "").trim())
          .filter(text => text.length > 0)
          .join(" ");
        if (slideText) {
          textParts.push(slideText);
        }
      }
    }
    
    // Also check notes slides for speaker notes
    const notesFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
    
    for (const notesFile of notesFiles) {
      const content = await zip.files[notesFile].async("text");
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
      if (textMatches) {
        const notesText = textMatches
          .map(match => match.replace(/<\/?a:t>/g, "").trim())
          .filter(text => text.length > 0)
          .join(" ");
        if (notesText) {
          textParts.push(notesText);
        }
      }
    }
    
    const result = textParts.join("\n\n");
    console.log(`📊 PPTX: Extracted ${result.length} chars from ${slideFiles.length} slides`);
    return result;
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
 * Re-export extractTerms from termExtractor as extractTermsFromText for backward compatibility
 */
export function extractTermsFromText(
  text: string,
  sourceFile: string
): ExtractedTerm[] {
  return extractTerms(text, sourceFile);
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
