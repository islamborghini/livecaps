// Simple language detection API endpoint
import { NextRequest, NextResponse } from 'next/server';

// Export an empty type to ensure it's treated as a module
export type DetectionResult = {
  detectedLanguage: string;
  confidence: number;
};

export async function POST(request: NextRequest) {
  // Always return a simple response for build and runtime
  return NextResponse.json({ 
    detectedLanguage: "en",
    confidence: 1.0
  });
}