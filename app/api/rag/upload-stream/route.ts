/**
 * RAG File Upload with Streaming Progress API
 * 
 * Uses Server-Sent Events (SSE) to stream progress updates during upload.
 * This provides real-time feedback for large document processing.
 * 
 * POST /api/rag/upload-stream
 */

import { NextRequest } from "next/server";
import { parseDocument } from "@/app/lib/documentParser";
import { indexSessionContent, IndexProgressCallback } from "@/app/lib/vectorStore";
import { ExtractedTerm } from "@/app/types/rag";
import crypto from "crypto";

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TERMS_TO_INDEX = 150;
const ALLOWED_EXTENSIONS = [".pdf", ".pptx", ".docx", ".txt", ".md"];

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString("hex");
  return `rag-${timestamp}-${randomPart}`;
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
 * SSE Progress Message Type
 */
interface ProgressMessage {
  type: "progress" | "complete" | "error";
  stage?: "validating" | "parsing" | "extracting" | "indexing" | "complete";
  progress?: number; // 0-100
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * POST handler with streaming progress
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      
      const sendProgress = (msg: ProgressMessage) => {
        if (isClosed) return; // Don't send if stream is closed
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch (e) {
          // Stream might be closed, mark it
          isClosed = true;
        }
      };
      
      const closeStream = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        }
      };

      const startTime = Date.now();

      try {
        // Check if RAG is enabled
        if (process.env.RAG_ENABLED !== "true") {
          sendProgress({ type: "error", message: "RAG system is not enabled" });
          closeStream();
          return;
        }

        sendProgress({ 
          type: "progress", 
          stage: "validating", 
          progress: 5, 
          message: "5% done" 
        });

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const customSessionId = formData.get("sessionId") as string | null;

        if (!file) {
          sendProgress({ type: "error", message: "No file provided" });
          closeStream();
          return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
          sendProgress({ 
            type: "error", 
            message: `File too large: ${sizeMB}MB. Maximum is 10MB.` 
          });
          closeStream();
          return;
        }

        // Validate extension
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          sendProgress({ 
            type: "error", 
            message: `Unsupported file type: ${ext}` 
          });
          closeStream();
          return;
        }

        sendProgress({ 
          type: "progress", 
          stage: "parsing", 
          progress: 10, 
          message: "10% done" 
        });

        // Get or create session ID
        const sessionId = customSessionId || generateSessionId();
        const mimeType = file.type || getMimeTypeFromExtension(ext);

        // Get file buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Parse document
        const parsedContent = await parseDocument(buffer, mimeType, file.name);

        // Check if document has actual text content (trim whitespace)
        const trimmedText = (parsedContent.rawText || "").trim();
        if (!trimmedText || trimmedText.length === 0) {
          sendProgress({ 
            type: "error", 
            message: "Document appears to be empty" 
          });
          closeStream();
          return;
        }

        sendProgress({ 
          type: "progress", 
          stage: "extracting", 
          progress: 25, 
          message: "25% done" 
        });

        // Get terms
        let terms: ExtractedTerm[] = parsedContent.terms || [];

        // Check if any terms were extracted
        if (terms.length === 0) {
          sendProgress({ 
            type: "error", 
            message: "No content found to index. Please upload a document with text." 
          });
          closeStream();
          return;
        }

        // Limit terms if needed
        if (terms.length > MAX_TERMS_TO_INDEX) {
          terms.sort((a, b) => {
            if (a.isProperNoun !== b.isProperNoun) {
              return a.isProperNoun ? -1 : 1;
            }
            return (b.frequency || 1) - (a.frequency || 1);
          });
          terms = terms.slice(0, MAX_TERMS_TO_INDEX);
        }

        sendProgress({ 
          type: "progress", 
          stage: "indexing", 
          progress: 30, 
          message: "30% done" 
        });

        // Index with progress callback
        const onProgress: IndexProgressCallback = (p) => {
          // Map indexing progress from 30% to 95%
          const indexProgress = 30 + (p.current / p.total) * 65;
          sendProgress({
            type: "progress",
            stage: p.stage,
            progress: Math.round(indexProgress),
            message: p.message,
          });
        };

        const result = await indexSessionContent(sessionId, terms, {}, onProgress);

        // Get category breakdown and sample terms
        const categoryBreakdown: Record<string, number> = {};
        const sampleTerms: Record<string, string[]> = {};
        
        for (const term of terms) {
          const category = term.category || "other";
          categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
          if (!sampleTerms[category]) {
            sampleTerms[category] = [];
          }
          if (sampleTerms[category].length < 10) {
            sampleTerms[category].push(term.term);
          }
        }

        const processingTimeMs = Date.now() - startTime;

        // Send completion
        sendProgress({
          type: "complete",
          stage: "complete",
          progress: 100,
          message: "Done!",
          data: {
            success: true,
            sessionId,
            file: {
              name: file.name,
              size: file.size,
              type: file.type,
            },
            parsing: {
              textLength: parsedContent.rawText.length,
              processingTimeMs: parsedContent.processingTimeMs,
            },
            terms: {
              extracted: terms.length,
              indexed: result.indexed,
              categories: categoryBreakdown,
              samples: sampleTerms,
            },
            processingTimeMs,
          },
        });

        console.log(`✨ Streaming upload complete for ${file.name} in ${processingTimeMs}ms`);
      } catch (error) {
        console.error("Upload stream error:", error);
        sendProgress({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error occurred",
        });
      } finally {
        closeStream();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
