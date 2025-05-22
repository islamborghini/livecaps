// Simple language detection API endpoint
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    detectedLanguage: "en",
    confidence: 1.0
  });
}