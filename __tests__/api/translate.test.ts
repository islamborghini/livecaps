import { POST } from '../../app/api/translate/route';
import { NextRequest } from 'next/server';
import { mockTranslationResponses, mockLanguageCodes, testTexts, mockApiErrors } from '../mocks/translationData';

// Mock fetch before any tests run
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('/api/translate Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env.DEEPL_API_KEY = 'mock-deepl-key';
  });

  describe('Basic Translation Functionality', () => {
    test('translates English to Spanish successfully with DeepL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTranslationResponses.deepl.success
      });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.simple,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toBe('Hola, ¿cómo estás?');
      expect(data.provider).toBe('deepl');
      expect(data.message).toContain('DeepL');
      
      // Verify DeepL API was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api-free.deepl.com/v2/translate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'DeepL-Auth-Key mock-deepl-key',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            text: [testTexts.simple],
            target_lang: 'ES'
          })
        })
      );
    });

    test('falls back to Google Translate when DeepL fails', async () => {
      // Mock DeepL failure
      mockFetch
        .mockRejectedValueOnce(new Error('DeepL API Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTranslationResponses.google.success
        });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.simple,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toBe('Hola, ¿cómo estás?');
      expect(data.provider).toBe('google');
      expect(data.message).toContain('Google Translate');
      
      // Verify both APIs were called
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('uses Google Translate when DeepL is not configured', async () => {
      // Remove DeepL API key
      delete process.env.DEEPL_API_KEY;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTranslationResponses.google.success
      });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.simple,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('google');
      
      // Verify only Google was called (DeepL should be skipped)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('translate.googleapis.com'),
        undefined
      );
    });
  });

  describe('Multi-sentence Translation', () => {
    test('handles multiple sentences correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTranslationResponses.deepl.multiSentence
      });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.multiSentence,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toContain('Hola.');
      expect(data.translatedText).toContain('¿Cómo estás?');
      expect(data.translatedText).toContain('Espero que estés bien.');
      
      // Verify sentence detection worked
      const sentences = data.translatedText.split(/[.!?]+/).filter(s => s.trim());
      expect(sentences.length).toBeGreaterThanOrEqual(3);
    });

    test('preserves sentence structure with Google Translate fallback', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('DeepL failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTranslationResponses.google.multiSentence
        });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.multiSentence,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('google');
      expect(data.translatedText).toContain('Hola.');
      expect(data.translatedText).toContain('¿Cómo estás?');
    });
  });

  describe('Special Characters and Formatting', () => {
    test('handles emojis and special characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTranslationResponses.deepl.withEmojis
      });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.withEmojis,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toContain('😊');
      expect(data.translatedText).toContain('🌟');
      expect(data.translatedText).toContain('¡Hola!');
    });

    test('preserves formatting and punctuation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTranslationResponses.deepl.withFormatting
      });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.withFormatting,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toContain('Dr. Smith');
      expect(data.translatedText).toContain('"');
      expect(data.translatedText).toContain('$29,99');
    });

    test('handles abbreviations correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          translations: [{
            text: 'Dr. Jones trabaja en Inc. Corp. en la 5ta calle.'
          }]
        })
      });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.withAbbreviations,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toContain('Dr. Jones');
      expect(data.translatedText).toContain('Inc. Corp.');
    });
  });

  describe('Language Code Validation', () => {
    test('accepts valid language codes', async () => {
      for (const langCode of mockLanguageCodes.valid) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockTranslationResponses.deepl.success
        });

        const request = new NextRequest('http://localhost:3000/api/translate', {
          method: 'POST',
          body: JSON.stringify({
            text: testTexts.simple,
            targetLanguage: langCode
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });

    test('handles language code variations', async () => {
      const variations = Object.entries(mockLanguageCodes.variations);
      
      for (const [input, expected] of variations) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockTranslationResponses.deepl.success
        });

        const request = new NextRequest('http://localhost:3000/api/translate', {
          method: 'POST',
          body: JSON.stringify({
            text: testTexts.simple,
            targetLanguage: input
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        
        // Verify the correct language code was sent to DeepL
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api-free.deepl.com/v2/translate',
          expect.objectContaining({
            body: JSON.stringify({
              text: [testTexts.simple],
              target_lang: expected
            })
          })
        );
      }
    });
  });

  describe('Error Handling', () => {
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
          text: testTexts.simple
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Text and target language are required');
    });

    test('handles empty text gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.empty,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Text and target language are required');
    });

    test('handles DeepL rate limiting gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => mockTranslationResponses.deepl.error429
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTranslationResponses.google.success
        });

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.simple,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('google'); // Should fallback to Google
    });

    test('returns original text when all translation services fail', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('DeepL failed'))
        .mockRejectedValueOnce(new Error('Google failed'));

      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.simple,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.translatedText).toBe(testTexts.simple);
      expect(data.error).toContain('Translation service unavailable');
      expect(data.provider).toBe('none');
    });

    test('handles malformed JSON gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });
  });

  describe('Performance Tests', () => {
    test('translation completes within reasonable time', async () => {
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: async () => mockTranslationResponses.deepl.success
          }), 100) // Simulate 100ms delay
        )
      );

      const start = Date.now();
      
      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.simple,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const end = Date.now();
      const duration = end - start;

      expect(response.status).toBe(200);
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('handles large text efficiently', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          translations: [{
            text: 'Esta es la oración uno. '.repeat(30)
          }]
        })
      });

      const start = Date.now();
      
      const request = new NextRequest('http://localhost:3000/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: testTexts.longText,
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      const end = Date.now();

      expect(response.status).toBe(200);
      expect(end - start).toBeLessThan(5000); // Should handle large text within 5 seconds
    });
  });

  describe('DeepL Language Code Conversion', () => {
    test('converts language codes correctly for DeepL', async () => {
      const testCases = [
        { input: 'zh-cn', expected: 'ZH' },
        { input: 'pt-br', expected: 'PT-BR' },
        { input: 'en-us', expected: 'EN-US' },
        { input: 'en-gb', expected: 'EN-GB' },
        { input: 'no', expected: 'NB' }
      ];

      for (const { input, expected } of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockTranslationResponses.deepl.success
        });

        const request = new NextRequest('http://localhost:3000/api/translate', {
          method: 'POST',
          body: JSON.stringify({
            text: testTexts.simple,
            targetLanguage: input
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        await POST(request);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api-free.deepl.com/v2/translate',
          expect.objectContaining({
            body: JSON.stringify({
              text: [testTexts.simple],
              target_lang: expected
            })
          })
        );
      }
    });
  });
});
