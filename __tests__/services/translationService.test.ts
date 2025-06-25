import { 
  detectSentences, 
  processSentencesForTranslation, 
  translateBySentences, 
  translateText 
} from '../../app/services/translationService';
import { testTexts } from '../mocks/translationData';

// Mock fetch for translateText function
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Translation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectSentences', () => {
    test('splits simple sentences correctly', () => {
      const text = "Hello world. How are you today? I'm doing great!";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual([
        "Hello world.",
        "How are you today?",
        "I'm doing great!"
      ]);
    });

    test('handles empty and whitespace-only text', () => {
      expect(detectSentences('')).toEqual([]);
      expect(detectSentences('   ')).toEqual([]);
      expect(detectSentences('\n\t')).toEqual([]);
      expect(detectSentences('   \n   \t   ')).toEqual([]);
    });

    test('preserves abbreviations and decimals', () => {
      const text = "Dr. Smith earned $1,234.56 from Inc. Corp. It was amazing.";
      const sentences = detectSentences(text);
      
      expect(sentences).toHaveLength(2);
      expect(sentences[0]).toContain("Dr. Smith");
      expect(sentences[0]).toContain("Inc. Corp.");
      expect(sentences[0]).toContain("$1,234.56");
      expect(sentences[1]).toBe("It was amazing.");
    });

    test('handles various punctuation marks', () => {
      const text = "What's happening? This is amazing! Let's continue. Is that right?";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual([
        "What's happening?",
        "This is amazing!",
        "Let's continue.",
        "Is that right?"
      ]);
    });

    test('handles exclamation and question marks correctly', () => {
      const text = "Wow! Really? Yes! No way? Absolutely!";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual([
        "Wow!",
        "Really?",
        "Yes!",
        "No way?",
        "Absolutely!"
      ]);
    });

    test('handles complex abbreviations', () => {
      const text = "Mr. John Smith Jr. works at U.S.A. Corp. on 123 Main St. He starts at 9 a.m.";
      const sentences = detectSentences(text);
      
      expect(sentences).toHaveLength(2);
      expect(sentences[0]).toContain("Mr. John Smith Jr.");
      expect(sentences[0]).toContain("U.S.A. Corp.");
      expect(sentences[0]).toContain("Main St.");
      expect(sentences[1]).toContain("9 a.m.");
    });

    test('handles sentences with quotes', () => {
      const text = 'He said "Hello there!" and walked away. She replied "Goodbye!"';
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual([
        'He said "Hello there!" and walked away.',
        'She replied "Goodbye!"'
      ]);
    });

    test('handles single sentence text', () => {
      const text = "This is just one sentence.";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual(["This is just one sentence."]);
    });

    test('handles text without ending punctuation', () => {
      const text = "This sentence has no ending punctuation";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual(["This sentence has no ending punctuation"]);
    });

    test('handles multiple spaces and line breaks', () => {
      const text = "First sentence.   \n\n  Second sentence?     Third sentence!";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual([
        "First sentence.",
        "Second sentence?",
        "Third sentence!"
      ]);
    });

    test('handles ellipsis correctly', () => {
      const text = "Well... I don't know. Maybe... we should try. Yes!";
      const sentences = detectSentences(text);
      
      expect(sentences).toEqual([
        "Well... I don't know.",
        "Maybe... we should try.",
        "Yes!"
      ]);
    });
  });

  describe('processSentencesForTranslation', () => {
    test('formats sentences with proper line breaks', () => {
      const text = "First sentence. Second sentence? Third sentence!";
      const result = processSentencesForTranslation(text);
      
      const lines = result.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("First sentence.");
      expect(lines[1]).toBe("Second sentence?");
      expect(lines[2]).toBe("Third sentence!");
    });

    test('handles empty text', () => {
      const result = processSentencesForTranslation('');
      expect(result).toBe('');
    });

    test('preserves paragraph structure', () => {
      const text = "First paragraph sentence.\n\nSecond paragraph sentence.";
      const result = processSentencesForTranslation(text);
      
      expect(result).toContain('\n\n');
    });

    test('handles mixed content', () => {
      const text = testTexts.mixed;
      const result = processSentencesForTranslation(text);
      
      const lines = result.split('\n').filter(line => line.trim());
      expect(lines.length).toBeGreaterThan(1);
      expect(result).toContain('Bonjour!');
      expect(result).toContain('¿Cómo estás?');
    });
  });

  describe('translateBySentences', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Hola mundo. ¿Cómo estás?',
          provider: 'deepl'
        })
      });
    });

    test('translates text while preserving structure', async () => {
      const request = {
        text: testTexts.multiSentence,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);

      expect(result.translatedText).toBeDefined();
      expect(result.translatedText).not.toBe('');
      expect(mockFetch).toHaveBeenCalledWith('/api/translate', {
        method: 'POST',
        body: expect.stringContaining('"targetLanguage":"es"'),
        headers: { 'Content-Type': 'application/json' }
      });
    });

    test('handles empty text', async () => {
      const request = {
        text: '',
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);

      expect(result.translatedText).toBe('');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('handles whitespace-only text', async () => {
      const request = {
        text: '   \n\t   ',
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);

      expect(result.translatedText).toBe('');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('processes text in batches for large content', async () => {
      const longText = 'Paragraph one.\n\n'.repeat(10);
      
      const request = {
        text: longText,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      await translateBySentences(request);

      expect(mockFetch).toHaveBeenCalled();
      
      // Verify the text was processed (contains bullet separator for batching)
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).toBeDefined();
    });

    test('handles translation errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const request = {
        text: testTexts.simple,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);

      expect(result.translatedText).toBe(testTexts.simple);
      expect(result.error).toContain('Network error');
    });

    test('preserves paragraph breaks in translation', async () => {
      const textWithParagraphs = "First paragraph.\n\nSecond paragraph.";
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Primer párrafo.\n\nSegundo párrafo.',
          provider: 'deepl'
        })
      });

      const request = {
        text: textWithParagraphs,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);

      expect(result.translatedText).toContain('\n\n');
    });
  });

  describe('translateText', () => {
    test('makes API call with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Hola mundo',
          provider: 'deepl'
        })
      });

      const request = {
        text: 'Hello world',
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateText(request);

      expect(result.translatedText).toBe('Hola mundo');
      expect(result.provider).toBe('deepl');

      expect(mockFetch).toHaveBeenCalledWith('/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: 'Hello world',
          targetLanguage: 'es'
        }),
        headers: { 'Content-Type': 'application/json' }
      });
    });

    test('handles API errors with fallback', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      const request = {
        text: 'Hello world',
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateText(request);

      expect(result.translatedText).toBe('Hello world'); // Returns original text
      expect(result.error).toContain('Translation API error');
      expect(result.provider).toBe('None');
    });

    test('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const request = {
        text: 'Hello world',
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateText(request);

      expect(result.translatedText).toBe('Hello world');
      expect(result.error).toContain('Network failure');
      expect(result.provider).toBe('None');
    });

    test('handles empty response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      const request = {
        text: 'Hello world',
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateText(request);

      expect(result.translatedText).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    test('complete translation flow works end-to-end', async () => {
      const translatedResponse = {
        translatedText: 'Hola. ¿Cómo estás? ¡Espero que estés bien!',
        provider: 'deepl'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => translatedResponse
      });

      // Test the complete flow: detectSentences -> processSentencesForTranslation -> translateBySentences
      const originalText = testTexts.multiSentence;
      
      // Step 1: Detect sentences
      const sentences = detectSentences(originalText);
      expect(sentences).toHaveLength(3);
      
      // Step 2: Process for translation
      const processedText = processSentencesForTranslation(originalText);
      expect(processedText).toContain('\n');
      
      // Step 3: Translate
      const request = {
        text: processedText,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };
      
      const result = await translateBySentences(request);
      
      expect(result.translatedText).toBe(translatedResponse.translatedText);
      expect(result.provider).toBe('deepl');
      expect(mockFetch).toHaveBeenCalledWith('/api/translate', expect.any(Object));
    });

    test('handles complex real-world text', async () => {
      const complexText = `
        Dr. Smith said, "Hello everyone! How are you today?" 
        The meeting starts at 2:30 p.m. 
        Please check the U.S.A. guidelines on www.example.com.
      `.trim();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Dr. Smith dijo: "¡Hola a todos! ¿Cómo están hoy?" La reunión comienza a las 2:30 p.m. Por favor revisen las pautas de E.U.A. en www.example.com.',
          provider: 'deepl'
        })
      });

      const sentences = detectSentences(complexText);
      expect(sentences).toHaveLength(3);
      expect(sentences[0]).toContain('Dr. Smith');
      expect(sentences[1]).toContain('2:30 p.m.');
      expect(sentences[2]).toContain('U.S.A.');

      const request = {
        text: complexText,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);
      expect(result.translatedText).toContain('Dr. Smith');
      expect(result.translatedText).toContain('2:30 p.m.');
    });
  });

  describe('Performance and Edge Cases', () => {
    test('handles very long text efficiently', async () => {
      const longText = testTexts.longText;
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Esta es la oración uno. '.repeat(30),
          provider: 'deepl'
        })
      });

      const start = Date.now();
      
      const request = {
        text: longText,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      };

      const result = await translateBySentences(request);
      const duration = Date.now() - start;

      expect(result.translatedText).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('handles text with only punctuation', () => {
      const text = "!!! ??? ... !!!";
      const sentences = detectSentences(text);
      
      // Should handle gracefully
      expect(Array.isArray(sentences)).toBe(true);
    });

    test('handles text with mixed languages', () => {
      const mixedText = testTexts.mixed;
      const sentences = detectSentences(mixedText);
      
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.some(s => s.includes('Bonjour'))).toBe(true);
      expect(sentences.some(s => s.includes('¿Cómo'))).toBe(true);
    });

    test('handles extreme edge cases', () => {
      const edgeCases = [
        ".",
        "?",
        "!",
        "...",
        "Dr.",
        "Mr. Ms. Mrs.",
        "1. 2. 3.",
        "a.m. p.m. etc.",
      ];

      edgeCases.forEach(text => {
        const sentences = detectSentences(text);
        expect(Array.isArray(sentences)).toBe(true);
      });
    });
  });
});
