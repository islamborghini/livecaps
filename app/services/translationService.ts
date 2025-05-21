import { NextRequest, NextResponse } from 'next/server';

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
 * This ensures each sentence is properly formatted before translation
 */
export async function translateBySentences(request: TranslationRequest): Promise<TranslationResponse> {
  // If the text is empty, return empty result
  if (!request.text.trim()) {
    return { translatedText: "" };
  }
  
  try {
    // Process text to ensure proper sentence formatting - each sentence on its own line
    const formattedText = processSentencesForTranslation(request.text);
    
    // Split into paragraphs to translate each separately
    const paragraphs = formattedText.split('\n\n');
    
    // Batch paragraphs for efficient translation (max 5 at a time)
    const batchSize = 5;
    const batches: string[][] = [];
    
    for (let i = 0; i < paragraphs.length; i += batchSize) {
      batches.push(paragraphs.slice(i, i + batchSize));
    }
    
    // Translate each batch
    const translatedBatches = await Promise.all(
      batches.map(async (batch) => {
        // Join batch with special separator that won't appear in normal text
        const batchText = batch.join('\n\u2022\n');
        
        if (!batchText.trim()) return [];
        
        const result = await translateText({
          text: batchText,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage
        });
        
        // Split the translated text back into paragraphs
        return result.translatedText.split('\n\u2022\n');
      })
    );
    
    // Flatten the batches back into a single array of paragraphs
    const translatedParagraphs = translatedBatches.flat();
    
    // Join paragraphs back with double line breaks
    return { 
      translatedText: translatedParagraphs.join('\n\n'),
      provider: translatedParagraphs.length > 0 ? "deepl" : "none" 
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