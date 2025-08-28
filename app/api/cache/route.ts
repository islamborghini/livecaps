import { NextRequest, NextResponse } from 'next/server';
import { serverTranslationCache, commonPhrases } from '../../lib/translationCache';

// Simple translation function using Google Translate's unofficial API
// Used for preloading common phrases
async function translateWithGoogle(text: string, targetLanguage: string) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Translation API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    let translatedText = '';
    if (data && data[0]) {
      for (let i = 0; i < data[0].length; i++) {
        if (data[0][i][0]) {
          translatedText += data[0][i][0];
        }
      }
    }
    
    return translatedText || text;
  } catch (error) {
    console.error('Google Translate error:', error);
    return text;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'stats':
        const stats = serverTranslationCache.getDetailedStats();
        return NextResponse.json({
          success: true,
          data: stats
        });

      case 'clear':
        serverTranslationCache.clear();
        return NextResponse.json({
          success: true,
          message: 'Cache cleared successfully'
        });

      default:
        const basicStats = serverTranslationCache.getStats();
        return NextResponse.json({
          success: true,
          data: basicStats
        });
    }
  } catch (error) {
    console.error("Cache API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process cache request" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, targetLanguage } = body;

    switch (action) {
      case 'preload':
        if (!targetLanguage) {
          return NextResponse.json(
            { success: false, error: "Target language is required for preloading" },
            { status: 400 }
          );
        }

        console.log(`[Cache] Starting preload for language: ${targetLanguage}`);
        
        // Preload common phrases in background
        const preloadPromise = preloadCommonPhrases(targetLanguage);
        
        // Don't await - let it run in background
        preloadPromise.catch(error => {
          console.error(`[Cache] Preload failed for ${targetLanguage}:`, error);
        });

        return NextResponse.json({
          success: true,
          message: `Started preloading common phrases for ${targetLanguage}`
        });

      case 'clear':
        serverTranslationCache.clear();
        return NextResponse.json({
          success: true,
          message: 'Cache cleared successfully'
        });

      default:
        return NextResponse.json(
          { success: false, error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Cache API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process cache request" },
      { status: 500 }
    );
  }
}

/**
 * Preload common phrases for a target language
 */
async function preloadCommonPhrases(targetLanguage: string): Promise<void> {
  const phrases = commonPhrases.en;
  const batchSize = 3;
  let loaded = 0;
  
  console.log(`[Cache] Preloading ${phrases.length} common phrases for ${targetLanguage}`);
  
  for (let i = 0; i < phrases.length; i += batchSize) {
    const batch = phrases.slice(i, i + batchSize);
    
    try {
      await Promise.all(
        batch.map(async (phrase: string) => {
          // Only translate if not already cached
          const cached = serverTranslationCache.get(phrase, targetLanguage);
          if (!cached) {
            const translatedText = await translateWithGoogle(phrase, targetLanguage);
            serverTranslationCache.set(phrase, targetLanguage, translatedText, 'preload');
            loaded++;
            console.log(`[Cache] Preloaded: "${phrase}" -> "${translatedText}"`);
          }
        })
      );
      
      // Add small delay between batches to be API-friendly
      if (i + batchSize < phrases.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.warn(`[Cache] Failed to preload batch starting at index ${i}:`, error);
    }
  }
  
  console.log(`[Cache] Completed preloading ${loaded} new phrases for ${targetLanguage}`);
}
