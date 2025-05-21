import { NextRequest, NextResponse } from 'next/server';

/**
 * Language detection API route
 * This endpoint attempts to detect the language of provided text
 */

export async function POST(request: NextRequest) {
  // Skip API processing during build time
  if (process.env.VERCEL_BUILDING === "1") {
    console.log("Skipping language detection processing during build time");
    return NextResponse.json({ 
      detectedLanguage: "en",
      confidence: 1.0,
      message: "This is a build-time placeholder. Actual detection will happen at runtime."
    });
  }
  
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Text is required for language detection" },
        { status: 400 }
      );
    }

    // Simple language detection based on Google Translate's API
    // This uses the same endpoint as translation but just to get detected language
    try {
      // Use Google Translate's detection capability
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Google API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Google returns the detected language in the response
      let detectedLanguage = 'en'; // Default to English
      let confidence = 1.0;
      
      if (data && data[2]) {
        detectedLanguage = data[2];
      }
      
      return NextResponse.json({ 
        detectedLanguage,
        confidence,
        text: text.substring(0, 100) // Return a preview of the text
      });
    } catch (error) {
      console.error("Language detection error:", error);
      
      // Return default if detection fails
      return NextResponse.json({ 
        detectedLanguage: "en",
        confidence: 0.5,
        error: "Detection service unavailable"
      });
    }
  } catch (error) {
    console.error("API error:", error);
    
    return NextResponse.json(
      { error: "Failed to detect language", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}