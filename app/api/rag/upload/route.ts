/**
 * RAG File Upload API Endpoint
 * 
 * Handles file uploads for the RAG correction system:
 * - Accepts PDF, PPTX, DOCX, and TXT files
 * - Parses content and extracts specialized terms
 * - Indexes terms in vector store for correction lookup
 * 
 * POST /api/rag/upload
 */

import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/app/lib/documentParser";
import { extractTerms, TermExtractionConfig } from "@/app/lib/termExtractor";
import { indexSessionContent, hasSessionContent, getSessionStats } from "@/app/lib/vectorStore";
import { ExtractedTerm } from "@/app/types/rag";
import crypto from "crypto";

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TERMS_TO_INDEX = 500;
const ALLOWED_EXTENSIONS = [".pdf", ".pptx", ".docx", ".txt", ".md"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString("hex");
  return `rag-${timestamp}-${randomPart}`;
}

/**
 * Validate file type by extension and MIME type
 */
function validateFileType(
  filename: string,
  mimeType: string
): { valid: boolean; error?: string } {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }

  // MIME type validation (be lenient for text files)
  if (
    !ALLOWED_MIME_TYPES.includes(mimeType) &&
    !mimeType.startsWith("text/") &&
    mimeType !== "application/octet-stream"
  ) {
    console.warn(`Unexpected MIME type: ${mimeType} for ${filename}`);
    // Don't reject - some systems send wrong MIME types
  }

  return { valid: true };
}

/**
 * Extract file extension for parser
 */
function getFileExtension(filename: string): string {
  return filename.toLowerCase().slice(filename.lastIndexOf("."));
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(ext: string): string {
  const mimeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * POST handler for file upload
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check if RAG is enabled
    if (process.env.RAG_ENABLED !== "true") {
      return NextResponse.json(
        { error: "RAG system is not enabled" },
        { status: 503 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customSessionId = formData.get("sessionId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use 'file' field in multipart form." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error: `File too large: ${sizeMB}MB. Maximum allowed: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        },
        { status: 413 }
      );
    }

    // Validate file type
    const validation = validateFileType(file.name, file.type);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 415 });
    }

    console.log(`📄 Processing upload: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

    // Generate or use provided session ID
    const sessionId = customSessionId || generateSessionId();

    // Check if session already has content (prevent duplicate uploads)
    const existingContent = await hasSessionContent(sessionId).catch(() => false);
    if (existingContent && !customSessionId) {
      // This shouldn't happen with generated IDs, but just in case
      console.warn(`Session ${sessionId} already has content`);
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get MIME type (use file.type or infer from extension)
    const extension = getFileExtension(file.name);
    const mimeType = file.type || getMimeTypeFromExtension(extension);
    
    // Parse the document
    let parsedContent;
    
    try {
      parsedContent = await parseDocument(buffer, file.name, mimeType);
    } catch (parseError) {
      console.error("Document parsing error:", parseError);
      return NextResponse.json(
        {
          error: `Failed to parse document: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        },
        { status: 422 }
      );
    }

    if (!parsedContent.rawText || parsedContent.rawText.trim().length === 0) {
      return NextResponse.json(
        { error: "Document appears to be empty or could not extract text" },
        { status: 422 }
      );
    }

    console.log(`📝 Parsed ${parsedContent.rawText.length} characters from ${file.name}`);

    // Use pre-extracted terms from document parser, or extract separately
    let terms: ExtractedTerm[] = parsedContent.terms || [];

    console.log(`🔍 Extracted ${terms.length} terms from ${file.name}`);

    // Limit terms to prevent overwhelming the vector store
    if (terms.length > MAX_TERMS_TO_INDEX) {
      console.log(`⚠️ Limiting terms from ${terms.length} to ${MAX_TERMS_TO_INDEX}`);
      
      // Sort by frequency and prioritize proper nouns
      terms.sort((a, b) => {
        // Proper nouns first
        if (a.isProperNoun !== b.isProperNoun) {
          return a.isProperNoun ? -1 : 1;
        }
        // Then by frequency
        return (b.frequency || 1) - (a.frequency || 1);
      });
      
      terms = terms.slice(0, MAX_TERMS_TO_INDEX);
    }

    // Index terms in vector store
    let indexedCount = 0;
    try {
      const result = await indexSessionContent(sessionId, terms);
      indexedCount = result.indexed;
      console.log(`✅ Indexed ${indexedCount} terms for session ${sessionId}`);
    } catch (indexError) {
      console.error("Indexing error:", indexError);
      return NextResponse.json(
        {
          error: `Failed to index terms: ${indexError instanceof Error ? indexError.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    // Get category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const term of terms) {
      const category = term.category || "other";
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    }

    // Get sample terms for each category (for debug/preview)
    const sampleTerms: Record<string, string[]> = {};
    for (const term of terms) {
      const category = term.category || "other";
      if (!sampleTerms[category]) {
        sampleTerms[category] = [];
      }
      if (sampleTerms[category].length < 10) { // Max 10 samples per category
        sampleTerms[category].push(term.term);
      }
    }

    // Build response
    const processingTimeMs = Date.now() - startTime;

    const response = {
      success: true,
      sessionId,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        extension,
      },
      parsing: {
        textLength: parsedContent.rawText.length,
        processingTimeMs: parsedContent.processingTimeMs,
        warnings: parsedContent.warnings,
      },
      terms: {
        extracted: terms.length,
        indexed: indexedCount,
        limited: terms.length >= MAX_TERMS_TO_INDEX,
        categories: categoryBreakdown,
        samples: sampleTerms, // Sample terms for debug/preview
      },
      processingTimeMs,
      instructions: {
        message: "Use this sessionId when connecting to transcription",
        example: `Connect with sessionId: "${sessionId}"`,
      },
    };

    console.log(`✨ Upload complete for ${file.name} in ${processingTimeMs}ms`);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler - returns session info or API status
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (sessionId) {
    // Return session stats
    try {
      const stats = await getSessionStats(sessionId);
      return NextResponse.json(stats);
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to get session stats" },
        { status: 500 }
      );
    }
  }

  // Return API info
  return NextResponse.json({
    status: "ready",
    ragEnabled: process.env.RAG_ENABLED === "true",
    limits: {
      maxFileSize: `${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      maxTerms: MAX_TERMS_TO_INDEX,
      allowedTypes: ALLOWED_EXTENSIONS,
    },
    usage: {
      method: "POST",
      contentType: "multipart/form-data",
      fields: {
        file: "The document to upload (required)",
        sessionId: "Custom session ID (optional, auto-generated if not provided)",
      },
    },
  });
}

/**
 * DELETE handler - clear session data
 */
export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const { clearSession } = await import("@/app/lib/vectorStore");
    const result = await clearSession(sessionId);
    
    return NextResponse.json({
      success: true,
      sessionId,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to clear session" },
      { status: 500 }
    );
  }
}
