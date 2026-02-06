/**
 * Tests for Main Corrector Module
 *
 * Tests the orchestration of the complete RAG correction pipeline.
 */

import { identifyLowConfidenceWords } from '../corrector';
import { WordConfidence } from '../../types/rag';

// Mock the vector store and LLM modules
jest.mock('../vectorStore', () => ({
  hasSessionContent: jest.fn(),
  getSessionTerms: jest.fn(),
  hybridSearch: jest.fn(),
  searchSessionTerms: jest.fn(),
}));

jest.mock('../llmCorrection', () => ({
  processCorrection: jest.fn(),
}));

describe('Corrector', () => {
  describe('identifyLowConfidenceWords', () => {
    it('should identify words below threshold', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'Hello', confidence: 0.95, start: 0, end: 5, punctuated_word: 'Hello' },
        { word: 'cooper', confidence: 0.35, start: 6, end: 12, punctuated_word: 'cooper' },
        { word: 'netties', confidence: 0.28, start: 13, end: 20, punctuated_word: 'netties' },
        { word: 'world', confidence: 0.98, start: 21, end: 26, punctuated_word: 'world' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(2);
      expect(lowConfidence[0].word).toBe('cooper');
      expect(lowConfidence[0].confidence).toBe(0.35);
      expect(lowConfidence[1].word).toBe('netties');
      expect(lowConfidence[1].confidence).toBe(0.28);
    });

    it('should return empty array if all words are confident', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'Hello', confidence: 0.95, start: 0, end: 5, punctuated_word: 'Hello' },
        { word: 'world', confidence: 0.98, start: 6, end: 11, punctuated_word: 'world' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence).toEqual([]);
    });

    it('should handle edge case of confidence exactly at threshold', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'test', confidence: 0.7, start: 0, end: 4, punctuated_word: 'test' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      // 0.7 is not below 0.7, so should not be included
      expect(lowConfidence.length).toBe(0);
    });

    it('should handle very low confidence scores', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'garbled', confidence: 0.05, start: 0, end: 7, punctuated_word: 'garbled' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(1);
      expect(lowConfidence[0].confidence).toBe(0.05);
    });

    it('should preserve word positions', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'first', confidence: 0.2, start: 0, end: 5, punctuated_word: 'first' },
        { word: 'second', confidence: 0.3, start: 10, end: 16, punctuated_word: 'second' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence[0].position).toBe(0);
      expect(lowConfidence[0].start).toBe(0);
      expect(lowConfidence[0].end).toBe(5);
      expect(lowConfidence[1].position).toBe(1);
      expect(lowConfidence[1].start).toBe(10);
      expect(lowConfidence[1].end).toBe(16);
    });

    it('should handle empty word list', () => {
      const lowConfidence = identifyLowConfidenceWords([], 0.7);
      expect(lowConfidence).toEqual([]);
    });

    it('should handle different threshold values', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'high', confidence: 0.95, start: 0, end: 4, punctuated_word: 'high' },
        { word: 'medium', confidence: 0.75, start: 5, end: 11, punctuated_word: 'medium' },
        { word: 'low', confidence: 0.35, start: 12, end: 15, punctuated_word: 'low' },
      ];

      // Strict threshold
      const strict = identifyLowConfidenceWords(wordConfidences, 0.9);
      expect(strict.length).toBe(2); // medium and low

      // Lenient threshold
      const lenient = identifyLowConfidenceWords(wordConfidences, 0.5);
      expect(lenient.length).toBe(1); // only low
    });
  });

  describe('Corrector integration scenarios', () => {
    it('should handle typical transcription error scenario', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'We', confidence: 0.98, start: 0, end: 2, punctuated_word: 'We' },
        { word: 'use', confidence: 0.97, start: 3, end: 6, punctuated_word: 'use' },
        { word: 'cooper', confidence: 0.35, start: 7, end: 13, punctuated_word: 'cooper' },
        { word: 'netties', confidence: 0.28, start: 14, end: 21, punctuated_word: 'netties' },
        { word: 'for', confidence: 0.99, start: 22, end: 25, punctuated_word: 'for' },
        { word: 'orchestration', confidence: 0.92, start: 26, end: 39, punctuated_word: 'orchestration' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(2);
      expect(lowConfidence.map(w => w.word)).toEqual(['cooper', 'netties']);
    });

    it('should handle multiple low-confidence sections', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'The', confidence: 0.98, start: 0, end: 3, punctuated_word: 'The' },
        { word: 'cooper', confidence: 0.35, start: 4, end: 10, punctuated_word: 'cooper' },
        { word: 'netties', confidence: 0.28, start: 11, end: 18, punctuated_word: 'netties' },
        { word: 'and', confidence: 0.99, start: 19, end: 22, punctuated_word: 'and' },
        { word: 'docket', confidence: 0.42, start: 23, end: 29, punctuated_word: 'docket' },
        { word: 'work', confidence: 0.95, start: 30, end: 34, punctuated_word: 'work' },
        { word: 'together', confidence: 0.97, start: 35, end: 43, punctuated_word: 'together' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(3);
      expect(lowConfidence.map(w => w.word)).toEqual(['cooper', 'netties', 'docket']);
    });

    it('should handle all low-confidence scenario', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'garbled', confidence: 0.2, start: 0, end: 7, punctuated_word: 'garbled' },
        { word: 'audio', confidence: 0.3, start: 8, end: 13, punctuated_word: 'audio' },
        { word: 'quality', confidence: 0.25, start: 14, end: 21, punctuated_word: 'quality' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(3);
    });
  });

  describe('Configuration handling', () => {
    it('should respect custom confidence thresholds', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'test', confidence: 0.8, start: 0, end: 4, punctuated_word: 'test' },
      ];

      // Low threshold - should flag the word
      const lowThreshold = identifyLowConfidenceWords(wordConfidences, 0.9);
      expect(lowThreshold.length).toBe(1);

      // High threshold - should not flag
      const highThreshold = identifyLowConfidenceWords(wordConfidences, 0.5);
      expect(highThreshold.length).toBe(0);
    });

    it('should handle boundary conditions', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'zero', confidence: 0.0, start: 0, end: 4, punctuated_word: 'zero' },
        { word: 'one', confidence: 1.0, start: 5, end: 8, punctuated_word: 'one' },
        { word: 'half', confidence: 0.5, start: 9, end: 13, punctuated_word: 'half' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.5);

      // 0.0 is below, 0.5 is not below (equal), 1.0 is above
      expect(lowConfidence.length).toBe(1);
      expect(lowConfidence[0].word).toBe('zero');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle missing confidence scores gracefully', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'test', confidence: 0.5, start: 0, end: 4, punctuated_word: 'test' },
        // @ts-expect-error Testing runtime behavior with missing confidence
        { word: 'missing', start: 5, end: 12, punctuated_word: 'missing' },
      ];

      // Should not crash, may or may not include the word without confidence
      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);
      expect(Array.isArray(lowConfidence)).toBe(true);
    });

    it('should handle very long word lists', () => {
      const wordConfidences: WordConfidence[] = Array.from({ length: 1000 }, (_, i) => ({
        word: `word${i}`,
        confidence: i % 2 === 0 ? 0.9 : 0.3, // Alternate high/low
        start: i * 10,
        end: i * 10 + 5,
        punctuated_word: `word${i}`,
      }));

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      // 500 words should be low confidence (odd indices)
      expect(lowConfidence.length).toBe(500);
    });

    it('should handle words with special characters', () => {
      const wordConfidences: WordConfidence[] = [
        { word: "don't", confidence: 0.5, start: 0, end: 5, punctuated_word: "don't" },
        { word: 'O\'Brien', confidence: 0.4, start: 6, end: 13, punctuated_word: "O'Brien" },
        { word: 'test-word', confidence: 0.3, start: 14, end: 23, punctuated_word: 'test-word' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(3);
      expect(lowConfidence[0].word).toBe("don't");
      expect(lowConfidence[1].word).toBe("O'Brien");
      expect(lowConfidence[2].word).toBe('test-word');
    });

    it('should handle unicode characters', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'café', confidence: 0.3, start: 0, end: 4, punctuated_word: 'café' },
        { word: '北京', confidence: 0.2, start: 5, end: 7, punctuated_word: '北京' },
        { word: 'naïve', confidence: 0.4, start: 8, end: 13, punctuated_word: 'naïve' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

      expect(lowConfidence.length).toBe(3);
    });
  });
});
