import { POST } from '../../app/api/translate/route';
import { NextRequest } from 'next/server';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Translation API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEEPL_API_KEY = 'mock-deepl-key';
  });

  test('returns 400 for missing text parameter', async () => {
    const request = new NextRequest('http://localhost:3000/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        targetLanguage: 'es'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Text and target language are required');
  });

  test('returns 400 for missing targetLanguage parameter', async () => {
    const request = new NextRequest('http://localhost:3000/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Text and target language are required');
  });

  test('translates text successfully with DeepL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        translations: [{
          text: 'Hola mundo'
        }]
      })
    });

    const request = new NextRequest('http://localhost:3000/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        targetLanguage: 'es'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.translatedText).toBe('Hola mundo');
    expect(data.provider).toBe('deepl');
  });

  test('falls back to Google when DeepL fails', async () => {
    // Mock DeepL failure
    mockFetch
      .mockRejectedValueOnce(new Error('DeepL API Error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          [
            ['Hola mundo', 'Hello world']
          ]
        ]
      });

    const request = new NextRequest('http://localhost:3000/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        targetLanguage: 'es'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.translatedText).toBe('Hola mundo');
    expect(data.provider).toBe('google');
  });

  test('returns original text when both services fail', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('DeepL failed'))
      .mockRejectedValueOnce(new Error('Google failed'));

    const request = new NextRequest('http://localhost:3000/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        targetLanguage: 'es'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.translatedText).toBe('Hello world');
    expect(data.error).toContain('Translation service unavailable');
    expect(data.provider).toBe('none');
  });
});
