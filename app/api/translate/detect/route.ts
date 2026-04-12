/**
 * POST /api/translate/detect
 *
 * Stub language-detection endpoint. Always returns English ("en") with full
 * confidence. Language detection is currently handled client-side via
 * Deepgram's detected_language field; this route exists as a placeholder for
 * a future server-side detection implementation.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    detectedLanguage: "en",
    confidence: 1.0
  });
}