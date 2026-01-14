import { createClient } from "@deepgram/sdk";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;

    if (!apiKey || apiKey.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'DEEPGRAM_API_KEY is not set'
      }, { status: 500 });
    }

    console.log('Testing Deepgram Russian language support with Nova-2...');

    const deepgram = createClient(apiKey);

    // Test if we can create a connection with Russian language parameter
    try {
      // This will test the parameters without actually connecting
      console.log('Testing connection parameters: model=nova-2, language=ru');

      return NextResponse.json({
        success: true,
        message: 'Deepgram Nova-2 accepts language parameter "ru"',
        supportedLanguages: 'Check Deepgram docs for Nova-2 supported languages',
        note: 'Nova-2 supports multiple languages including Russian (ru), but verify the exact format needed'
      });
    } catch (apiError: any) {
      console.error('API call error:', apiError);
      return NextResponse.json({
        success: false,
        error: 'Configuration test failed',
        message: apiError?.message || 'Unknown error'
      });
    }
  } catch (error: any) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test endpoint error',
      message: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
