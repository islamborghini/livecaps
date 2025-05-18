import { NextRequest, NextResponse } from 'next/server';

// Simple translation function using Google Translate's unofficial API
// Used as fallback when DeepL is unavailable
async function translateWithGoogle(text: string, targetLanguage: string) {
  try {
    // Create the Google Translate URL
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Translation API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract translation from Google's response structure
    let translatedText = '';
    if (data && data[0]) {
      // Google returns an array of translated sentences
      for (let i = 0; i < data[0].length; i++) {
        if (data[0][i][0]) {
          translatedText += data[0][i][0];
        }
      }
    }
    
    return translatedText || text;
  } catch (error) {
    console.error('Google Translate error:', error);
    // Return original text if translation fails
    return text;
  }
}

// DeepL API translation function
async function translateWithDeepL(text: string, targetLanguage: string) {
  // Get API key from environment variable
  const apiKey = process.env.DEEPL_API_KEY;
  
  if (!apiKey || apiKey === 'your_deepl_api_key_here') {
    console.warn('DeepL API key is missing or not properly configured. Please check your .env.local file.');
    throw new Error('DeepL API key not configured properly');
  }
  
  try {
    // Convert language codes if necessary (DeepL uses different codes than Google for some languages)
    const deepLLanguage = convertToDeepLCode(targetLanguage);
    
    console.log(`Using DeepL for translation to language: ${deepLLanguage}`);
    
    // DeepL API endpoint
    const url = 'https://api-free.deepl.com/v2/translate';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        target_lang: deepLLanguage
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`DeepL API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Extract translation from DeepL's response
    if (data && data.translations && data.translations.length > 0) {
      console.log('Successfully used DeepL for translation');
      return data.translations[0].text;
    }
    
    throw new Error('Invalid response format from DeepL');
  } catch (error) {
    console.error('DeepL Translate error:', error);
    throw error;
  }
}

// Helper function to convert language codes for DeepL
function convertToDeepLCode(langCode: string): string {
  if (!langCode) return 'EN-US'; // Default to English if no language provided
  
  // DeepL uses uppercase language codes
  const code = langCode.toUpperCase();
  
  // Map of specific language code conversions
  // DeepL supports: BG, CS, DA, DE, EL, EN, ES, ET, FI, FR, HU, ID, IT, JA, KO, LT, LV, NB, NL, PL, PT, RO, RU, SK, SL, SV, TR, UK, ZH
  const languageMap: {[key: string]: string} = {
    // English variants
    'EN': 'EN-US', // Default to US English
    'EN-GB': 'EN-GB', // British English
    'EN-US': 'EN-US', // American English
    
    // Chinese variants
    'ZH': 'ZH', // Simplified Chinese
    'ZH-CN': 'ZH', // Simplified Chinese
    'ZH-TW': 'ZH', // DeepL doesn't distinguish traditional Chinese
    
    // Portuguese variants
    'PT': 'PT-PT', // European Portuguese
    'PT-BR': 'PT-BR', // Brazilian Portuguese
    
    // Other specific mappings
    'NO': 'NB', // Norwegian maps to Norwegian Bokmål
  };
  
  // Check if this language is supported by DeepL
  const supportedLanguages = [
    'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 
    'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'RO', 'RU', 'SK', 
    'SL', 'SV', 'TR', 'UK', 'ZH'
  ];
  
  // Get base language code (before the hyphen)
  const baseCode = code.split('-')[0];
  
  // Check if language is supported
  if (!supportedLanguages.includes(baseCode) && !supportedLanguages.includes(code)) {
    console.warn(`Language code ${code} is not supported by DeepL. Falling back to English.`);
    return 'EN-US';
  }
  
  // Return mapped language or the original code
  return languageMap[code] || languageMap[baseCode] || code;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, targetLanguage } = body;

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: "Text and target language are required" },
        { status: 400 }
      );
    }

    try {
      // First try to use DeepL
      try {
        const translatedText = await translateWithDeepL(text, targetLanguage);
        return NextResponse.json({ 
          translatedText, 
          provider: "deepl" 
        });
      } catch (deepLError) {
        console.error("DeepL translation error:", deepLError);
        
        console.log("Falling back to Google Translate");
        
        // Fall back to Google Translate
        const translatedText = await translateWithGoogle(text, targetLanguage);
        return NextResponse.json({ 
          translatedText, 
          provider: "google",
          note: "Used fallback due to DeepL API error"
        });
      }
    } catch (error) {
      console.error("Translation error:", error);
      
      // Return original text if translation fails
      return NextResponse.json({ 
        translatedText: text,
        error: "Translation service unavailable",
        provider: "none"
      });
    }
  } catch (error) {
    console.error("API error:", error);
    
    return NextResponse.json(
      { error: "Failed to translate text", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}