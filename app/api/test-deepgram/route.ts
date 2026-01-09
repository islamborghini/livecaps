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

    console.log('Testing Deepgram API key...');
    console.log('API Key prefix:', apiKey.substring(0, 10) + '...');
    console.log('API Key length:', apiKey.length);

    // Create Deepgram client
    const deepgram = createClient(apiKey);

    // Try to get projects to verify the key works
    try {
      const { result: projects, error } = await deepgram.manage.getProjects();

      if (error) {
        console.error('Deepgram API error:', error);
        return NextResponse.json({
          success: false,
          error: 'Failed to authenticate with Deepgram',
          details: error,
          apiKeyInfo: {
            prefix: apiKey.substring(0, 10) + '...',
            length: apiKey.length
          }
        });
      }

      console.log('✅ Successfully authenticated with Deepgram');
      console.log('Projects found:', projects?.projects?.length || 0);

      return NextResponse.json({
        success: true,
        message: 'Successfully authenticated with Deepgram',
        projectCount: projects?.projects?.length || 0,
        apiKeyInfo: {
          prefix: apiKey.substring(0, 10) + '...',
          length: apiKey.length
        }
      });
    } catch (apiError: any) {
      console.error('API call error:', apiError);
      return NextResponse.json({
        success: false,
        error: 'API call failed',
        message: apiError?.message || 'Unknown error',
        apiKeyInfo: {
          prefix: apiKey.substring(0, 10) + '...',
          length: apiKey.length
        }
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
