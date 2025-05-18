/**
 * Translation service using our API endpoint
 * This service handles the translation of text using multiple fallback options
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
}

/**
 * Translate text while preserving paragraph structure
 */
export async function translateBySentences(request: TranslationRequest): Promise<TranslationResponse> {
  // If the text is empty, return empty result
  if (!request.text.trim()) {
    return { translatedText: "" };
  }
  
  try {
    // Split into paragraphs, translate each paragraph separately
    const paragraphs = request.text.split('\n\n');
    
    // Translate each paragraph
    const translatedParagraphs = await Promise.all(
      paragraphs.map(async (paragraph) => {
        if (!paragraph.trim()) return '';
        
        const result = await translateText({
          text: paragraph,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage
        });
        
        return result.translatedText;
      })
    );
    
    // Join paragraphs back with double line breaks
    return { 
      translatedText: translatedParagraphs.join('\n\n') 
    };
  } catch (error) {
    console.error("Translation error:", error);
    return { 
      translatedText: request.text,
      error: error instanceof Error ? error.message : "Unknown translation error"
    };
  }
}

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

    return await response.json();
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
 * Detect sentences in a text
 * This is a simple implementation that will work for most Western languages
 * For more complex languages, a more sophisticated approach would be needed
 */
export function detectSentences(text: string): string[] {
  // Simple regex to split text into sentences
  // This works for most Western languages with periods, question marks, and exclamation points
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const sentences = text.match(sentenceRegex);
  
  if (!sentences) {
    // If no complete sentences found, return the whole text as one sentence
    return text.trim() ? [text] : [];
  }
  
  return sentences.map(sentence => sentence.trim());
} 