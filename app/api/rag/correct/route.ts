/**
 * RAG Correction API Endpoint
 * 
 * Applies RAG-based corrections to transcripts using indexed user content.
 * 
 * POST /api/rag/correct
 * 
 * Request body:
 * {
 *   transcript: string,           // The text to correct
 *   wordConfidences: WordConfidence[], // Confidence scores for each word
 *   sessionId: string,            // Session ID from file upload
 *   language?: string,            // Language code (default: "en")
 *   isFinal?: boolean,            // Whether this is a final transcript
 *   confidenceThreshold?: number  // Threshold for low-confidence words (default: 0.7)
 * }
 * 
 * Response:
 * {
 *   correctedTranscript: string,
 *   wasModified: boolean,
 *   corrections: CorrectionDetail[],
 *   termsRetrieved: number,
 *   processingTimeMs: number
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  correctTranscript, 
  correctSimpleTranscript,
  isRAGEnabled, 
  getRAGConfig,
  getCorrectionStats,
  resetCorrectionStats,
} from "@/app/lib/corrector";
import { hasSessionContent, getSessionStats } from "@/app/lib/vectorStore";
import { CorrectionRequest, WordConfidence } from "@/app/types/rag";

/**
 * Validate word confidence format
 */
function validateWordConfidences(
  wordConfidences: unknown
): { valid: boolean; error?: string; data?: WordConfidence[] } {
  if (!Array.isArray(wordConfidences)) {
    return { valid: false, error: "wordConfidences must be an array" };
  }

  if (wordConfidences.length === 0) {
    return { valid: false, error: "wordConfidences array is empty" };
  }

  const validated: WordConfidence[] = [];

  for (let i = 0; i < wordConfidences.length; i++) {
    const wc = wordConfidences[i];
    
    if (typeof wc !== "object" || wc === null) {
      return { valid: false, error: `wordConfidences[${i}] must be an object` };
    }

    if (typeof wc.word !== "string") {
      return { valid: false, error: `wordConfidences[${i}].word must be a string` };
    }

    if (typeof wc.confidence !== "number" || wc.confidence < 0 || wc.confidence > 1) {
      return { valid: false, error: `wordConfidences[${i}].confidence must be a number between 0 and 1` };
    }

    validated.push({
      word: wc.word,
      confidence: wc.confidence,
      start: typeof wc.start === "number" ? wc.start : i * 0.5,
      end: typeof wc.end === "number" ? wc.end : (i + 1) * 0.5,
    });
  }

  return { valid: true, data: validated };
}

/**
 * Generate word confidences from transcript (for simple mode)
 * Assigns low confidence to all words
 */
function generateWordConfidences(transcript: string): WordConfidence[] {
  const words = transcript.split(/\s+/).filter(w => w.length > 0);
  return words.map((word, i) => ({
    word,
    confidence: 0.5, // Low confidence triggers correction
    start: i * 0.5,
    end: (i + 1) * 0.5,
  }));
}

/**
 * POST handler for transcript correction
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check if RAG is enabled
    if (!isRAGEnabled()) {
      return NextResponse.json(
        { error: "RAG correction system is not enabled" },
        { status: 503 }
      );
    }

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Validate required fields
    const { transcript, wordConfidences, sessionId, language, isFinal, confidenceThreshold } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "transcript is required" },
        { status: 400 }
      );
    }

    // Skip empty transcripts
    if (transcript.trim().length === 0) {
      return NextResponse.json({
        correctedTranscript: transcript,
        wasModified: false,
        corrections: [],
        termsRetrieved: 0,
        processingTimeMs: Date.now() - startTime,
      });
    }

    // Check if session has indexed content
    const hasContent = await hasSessionContent(sessionId).catch(() => false);
    if (!hasContent) {
      return NextResponse.json(
        { 
          error: "Session not found or has no indexed content",
          hint: "Upload a document first using POST /api/rag/upload",
          sessionId,
        },
        { status: 404 }
      );
    }

    // Validate or generate word confidences
    let validatedWordConfidences: WordConfidence[];

    if (wordConfidences) {
      const validation = validateWordConfidences(wordConfidences);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }
      validatedWordConfidences = validation.data!;
    } else {
      // Simple mode: generate low-confidence for all words
      validatedWordConfidences = generateWordConfidences(transcript);
    }

    // Build correction request
    const correctionRequest: CorrectionRequest = {
      transcript,
      wordConfidences: validatedWordConfidences,
      sessionId,
      language: typeof language === "string" ? language : "en",
      isFinal: typeof isFinal === "boolean" ? isFinal : true,
      confidenceThreshold: typeof confidenceThreshold === "number" 
        ? Math.max(0, Math.min(1, confidenceThreshold)) 
        : undefined,
    };

    console.log(`🔧 RAG Correction request for session ${sessionId}: "${transcript.substring(0, 50)}..."`);

    // Call the corrector
    const response = await correctTranscript(correctionRequest);

    console.log(`✅ RAG Correction complete: ${response.wasModified ? "modified" : "unchanged"} (${response.processingTimeMs}ms)`);

    return NextResponse.json(response);

  } catch (error) {
    console.error("RAG Correction error:", error);
    
    // Return original transcript on error
    const body = await request.clone().json().catch(() => ({}));
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    
    return NextResponse.json({
      correctedTranscript: transcript,
      wasModified: false,
      corrections: [],
      termsRetrieved: 0,
      processingTimeMs: Date.now() - startTime,
      error: "Processing error - returning original transcript",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET handler - returns correction stats or API info
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const action = request.nextUrl.searchParams.get("action");

  // Reset stats action
  if (action === "reset-stats") {
    resetCorrectionStats();
    return NextResponse.json({ success: true, message: "Stats reset" });
  }

  // Get stats
  if (action === "stats") {
    const stats = getCorrectionStats();
    return NextResponse.json(stats);
  }

  // Get session info
  if (sessionId) {
    try {
      const hasContent = await hasSessionContent(sessionId);
      const stats = await getSessionStats(sessionId);
      
      return NextResponse.json({
        hasContent,
        ...stats,
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to get session info" },
        { status: 500 }
      );
    }
  }

  // Return API info
  const config = getRAGConfig();
  
  return NextResponse.json({
    status: isRAGEnabled() ? "ready" : "disabled",
    config,
    usage: {
      method: "POST",
      contentType: "application/json",
      requiredFields: {
        transcript: "The text to correct (string)",
        sessionId: "Session ID from file upload (string)",
      },
      optionalFields: {
        wordConfidences: "Array of { word, confidence, start?, end? } - if omitted, all words treated as low confidence",
        language: "Language code (default: 'en')",
        isFinal: "Whether this is a final transcript (default: true)",
        confidenceThreshold: "Threshold for low-confidence words (default: 0.7)",
      },
    },
    example: {
      transcript: "We use cooper netties for containers",
      sessionId: "rag-abc123-xyz789",
      wordConfidences: [
        { word: "We", confidence: 0.95 },
        { word: "use", confidence: 0.92 },
        { word: "cooper", confidence: 0.35 },
        { word: "netties", confidence: 0.28 },
        { word: "for", confidence: 0.95 },
        { word: "containers", confidence: 0.88 },
      ],
    },
  });
}
