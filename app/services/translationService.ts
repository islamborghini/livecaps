/**
 * Translation service using backend API with server-side caching
 * This service handles the translation of text using backend caching for improved performance
 */

export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslationResponse {
  translatedText: string;
  error?: string;
  provider?: string;
  cached?: boolean;
}

/**
 * Enhanced sentence detection function that handles various punctuation marks
 * and intelligently identifies sentence boundaries
 */
export function detectSentences(text: string): string[] {
  if (!text.trim()) return [];

  // More sophisticated regex for sentence detection
  // This pattern looks for:
  // - Text followed by period, question mark, exclamation point, or ellipsis
  // - Optionally followed by space, quote mark, or newline
  // - Including proper handling of abbreviations and special cases
  
  // First, handle special cases that might confuse our sentence detection
  const preprocessed = text
    // Protect common abbreviations (e.g. "U.S.A.", "Dr.", "Inc.", etc.)
    .replace(/([A-Z]\.)+/g, match => match.replace(/\./g, '▲'))
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Corp|Sr|Jr|vs|etc|e\.g|i\.e)\./gi, match => match.replace('.', '▲'));
  
  // Regular expression to match sentences
  const sentenceRegex = /(.*?[.!?…]+"?(?:\s|$))/g;
  const matches = preprocessed.match(sentenceRegex);
  
  if (!matches) {
    // If no complete sentences found, return the whole text as one item
    return text.trim() ? [text.trim()] : [];
  }
  
  // Restore the original punctuation and clean up the detected sentences
  return matches
    .map(sentence => sentence.replace(/▲/g, '.').trim())
    .filter(sentence => sentence.length > 0);
}

/**
 * Process text into properly formatted sentences
 * - Ensures each sentence is in its own paragraph
 * - Preserves paragraph structure
 * - Handles various punctuation patterns
 */
export function processSentencesForTranslation(text: string): string {
  if (!text.trim()) return '';
  
  // Split text by paragraph breaks (double newlines)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  
  // Process each paragraph to ensure it contains complete sentences
  const formattedParagraphs: string[] = [];
  
  paragraphs.forEach(paragraph => {
    const sentences = detectSentences(paragraph);
    
    if (sentences.length === 0) {
      // If no complete sentences detected, keep paragraph as is
      if (paragraph.trim()) {
        formattedParagraphs.push(paragraph.trim());
      }
    } else {
      // Each complete sentence becomes its own paragraph
      sentences.forEach(sentence => {
        formattedParagraphs.push(sentence.trim());
      });
    }
  });
  
  // Join all processed paragraphs with paragraph breaks
  return formattedParagraphs.join('\n\n');
}

/**
 * Translate text while preserving paragraph structure
 * This function handles sentence-by-sentence translation using backend caching
 */
export async function translateBySentences(request: TranslationRequest): Promise<TranslationResponse> {
  // If the text is empty, return empty result
  if (!request.text.trim()) {
    return { translatedText: "" };
  }
  
  try {
    // For better caching, try translating the full text first
    const fullTextResult = await translateText(request);
    
    // If successful, return the result
    if (!fullTextResult.error) {
      return fullTextResult;
    }
    
    // If full text translation failed, try sentence by sentence
    console.log('Full text translation failed, trying sentence by sentence...');
    
    // Process text to ensure proper sentence formatting
    const formattedText = processSentencesForTranslation(request.text);
    
    // Split into paragraphs to translate each separately
    const paragraphs = formattedText.split('\n\n').filter(p => p.trim());
    
    // Translate each paragraph
    const translatedParagraphs = await Promise.all(
      paragraphs.map(async (paragraph) => {
        if (!paragraph.trim()) return '';
        
        try {
          const result = await translateText({
            text: paragraph,
            sourceLanguage: request.sourceLanguage,
            targetLanguage: request.targetLanguage
          });
          
          return result.translatedText;
        } catch (error) {
          console.error('Failed to translate paragraph:', error);
          return paragraph; // Return original if translation fails
        }
      })
    );
    
    // Join paragraphs back with double line breaks
    const fullTranslation = translatedParagraphs.join('\n\n');
    
    return { 
      translatedText: fullTranslation,
      provider: 'batch'
    };
  } catch (error) {
    console.error("Translation error:", error);
    return { 
      translatedText: request.text,
      error: error instanceof Error ? error.message : "Unknown translation error"
    };
  }
}

/**
 * Main translation function that calls the backend API
 * Backend handles all caching logic
 */
export async function translateText(request: TranslationRequest): Promise<TranslationResponse> {
  try {
    const response = await fetch('/api/translate', {
      method: "POST",
      body: JSON.stringify({
        text: request.text,
        targetLanguage: request.targetLanguage,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Translation error:", error);
    
    // For demo/development - provide a fallback
    return { 
      translatedText: request.text,
      error: error instanceof Error ? error.message : "Unknown translation error",
      provider: "None"
    };
  }
}

/**
 * Backend cache management utilities
 * These functions interact with the server-side cache API
 */
export const cacheUtils = {
  /**
   * Get cache statistics from backend
   */
  getStats: async () => {
    try {
      const response = await fetch(`${window.location.origin}/api/cache?action=stats`);
      const result = await response.json();
      return result.success ? result.data : { size: 0, hitRate: 0 };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { size: 0, hitRate: 0 };
    }
  },
  
  /**
   * Clear the backend translation cache
   */
  clearCache: async () => {
    try {
      const response = await fetch(`${window.location.origin}/api/cache?action=clear`);
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  },
  
  /**
   * Pre-populate backend cache with common phrases for a language
   */
  preloadCommonPhrases: async (targetLanguage: string) => {
    try {
      const response = await fetch(`${window.location.origin}/api/cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'preload',
          targetLanguage: targetLanguage
        })
      });
      
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Failed to request preload:', error);
      return false;
    }
  }
};