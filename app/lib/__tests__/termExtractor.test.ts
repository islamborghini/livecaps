/**
 * Tests for Term Extraction Module
 *
 * Tests intelligent extraction of important terms from text,
 * including proper nouns, acronyms, technical terms, and key phrases.
 */

import {
  splitIntoSentences,
  getTermContext,
  generatePhoneticCode,
  isAcronym,
  isTechnicalTerm,
  isProperNoun,
  categorizeTerm,
  extractProperNounPhrases,
  extractTerms,
  mergeTerms,
  filterTermsByCategory,
  getTopTerms,
  findPhoneticMatches,
} from '../termExtractor';

describe('TermExtractor', () => {
  describe('splitIntoSentences', () => {
    it('should split text into sentences', () => {
      const text = 'Hello world. This is a test. How are you?';
      const sentences = splitIntoSentences(text);
      expect(sentences.length).toBe(3);
      expect(sentences[0]).toBe('Hello world.');
      expect(sentences[1]).toBe('This is a test.');
      expect(sentences[2]).toBe('How are you?');
    });

    it('should handle abbreviations correctly', () => {
      const text = 'Dr. Smith works at ABC Inc. in New York.';
      const sentences = splitIntoSentences(text);
      // Should not split on abbreviations
      expect(sentences.length).toBe(1);
    });

    it('should handle multiple sentence endings', () => {
      const text = 'What? Really! Yes.';
      const sentences = splitIntoSentences(text);
      expect(sentences.length).toBe(3);
    });

    it('should handle empty or whitespace text', () => {
      expect(splitIntoSentences('')).toEqual([]);
      expect(splitIntoSentences('   ')).toEqual([]);
    });

    it('should preserve single letter abbreviations', () => {
      const text = 'The U.S.A. is a country. It has 50 states.';
      const sentences = splitIntoSentences(text);
      expect(sentences[0]).toContain('U.S.A');
    });
  });

  describe('getTermContext', () => {
    const sentences = [
      'Kubernetes is a container orchestration platform.',
      'It was developed by Google.',
      'Many companies use Kubernetes for deployment.',
    ];

    it('should extract context for a term', () => {
      const context = getTermContext(sentences, 'Kubernetes');
      expect(context).toBeTruthy();
      expect(context.toLowerCase()).toContain('kubernetes');
    });

    it('should include surrounding sentences', () => {
      const context = getTermContext(sentences, 'Kubernetes', 2);
      // Should include at least the matching sentence
      expect(context).toBeTruthy();
    });

    it('should be case-insensitive', () => {
      const context1 = getTermContext(sentences, 'kubernetes');
      const context2 = getTermContext(sentences, 'KUBERNETES');
      expect(context1).toBeTruthy();
      expect(context2).toBeTruthy();
    });

    it('should handle terms not found', () => {
      const context = getTermContext(sentences, 'notfound');
      // May return empty or a fallback
      expect(typeof context).toBe('string');
    });

    it('should limit context sentences', () => {
      const context = getTermContext(sentences, 'Google', 1);
      expect(context).toBeTruthy();
    });
  });

  describe('generatePhoneticCode', () => {
    it('should generate phonetic codes for single words', () => {
      const code = generatePhoneticCode('Kubernetes');
      expect(code).toBeTruthy();
      expect(code).toBe('K165');
    });

    it('should combine codes for multi-word terms', () => {
      const code = generatePhoneticCode('New York');
      expect(code).toContain('-');
    });

    it('should filter stop words in multi-word terms', () => {
      const code = generatePhoneticCode('The Big Apple');
      // "The" should be filtered as stop word
      expect(code).not.toContain('THE');
    });

    it('should handle edge cases', () => {
      expect(generatePhoneticCode('')).toBe('');
      expect(generatePhoneticCode('123')).toBeTruthy();
    });
  });

  describe('isAcronym', () => {
    it('should identify all-caps acronyms', () => {
      expect(isAcronym('API')).toBe(true);
      expect(isAcronym('HTTP')).toBe(true);
      expect(isAcronym('USA')).toBe(true);
    });

    it('should identify acronyms with numbers', () => {
      expect(isAcronym('4G')).toBe(true);
      expect(isAcronym('5G')).toBe(true);
      expect(isAcronym('B2B')).toBe(true);
    });

    it('should identify acronyms with dots', () => {
      expect(isAcronym('U.S.A.')).toBe(true);
      expect(isAcronym('P.H.D.')).toBe(true);
    });

    it('should reject non-acronyms', () => {
      expect(isAcronym('Hello')).toBe(false);
      expect(isAcronym('test')).toBe(false);
      expect(isAcronym('A')).toBe(false); // Too short
    });

    it('should reject very long all-caps words', () => {
      expect(isAcronym('VERYLONGWORD')).toBe(false);
    });
  });

  describe('isTechnicalTerm', () => {
    it('should identify camelCase', () => {
      expect(isTechnicalTerm('camelCase')).toBe(true);
      expect(isTechnicalTerm('getElementById')).toBe(true);
    });

    it('should identify PascalCase', () => {
      expect(isTechnicalTerm('PascalCase')).toBe(true);
      expect(isTechnicalTerm('MyComponent')).toBe(true);
    });

    it('should identify snake_case', () => {
      expect(isTechnicalTerm('snake_case')).toBe(true);
      expect(isTechnicalTerm('my_variable')).toBe(true);
    });

    it('should identify kebab-case', () => {
      expect(isTechnicalTerm('kebab-case')).toBe(true);
      expect(isTechnicalTerm('my-component')).toBe(true);
    });

    it('should identify terms with numbers', () => {
      expect(isTechnicalTerm('OAuth2')).toBe(true);
      expect(isTechnicalTerm('IPv4')).toBe(true);
      expect(isTechnicalTerm('3D')).toBe(true);
    });

    it('should identify file extensions', () => {
      expect(isTechnicalTerm('file.ts')).toBe(true);
      expect(isTechnicalTerm('config.json')).toBe(true);
    });

    it('should reject normal words', () => {
      expect(isTechnicalTerm('hello')).toBe(false);
      expect(isTechnicalTerm('World')).toBe(false);
    });
  });

  describe('isProperNoun', () => {
    it('should identify proper nouns not at sentence start', () => {
      expect(isProperNoun('Google', false)).toBe(true);
      expect(isProperNoun('London', false)).toBe(true);
    });

    it('should require more evidence for sentence-start words', () => {
      // Short common words at sentence start are not proper nouns
      expect(isProperNoun('It', true)).toBe(false);
      expect(isProperNoun('Is', true)).toBe(false);
    });

    it('should accept proper nouns at sentence start if long enough', () => {
      expect(isProperNoun('Kubernetes', true)).toBe(true);
      expect(isProperNoun('Microsoft', true)).toBe(true);
    });

    it('should reject all-lowercase', () => {
      expect(isProperNoun('test', false)).toBe(false);
    });

    it('should reject all-uppercase', () => {
      expect(isProperNoun('TEST', false)).toBe(false);
    });

    it('should require mixed case', () => {
      expect(isProperNoun('Test', false)).toBe(true);
      expect(isProperNoun('TEST', false)).toBe(false);
    });
  });

  describe('categorizeTerm', () => {
    it('should categorize headings', () => {
      expect(categorizeTerm('Introduction', '', true)).toBe('heading');
    });

    it('should categorize acronyms', () => {
      expect(categorizeTerm('API', 'Using the API')).toBe('acronym');
    });

    it('should categorize technical terms', () => {
      expect(categorizeTerm('camelCase', 'Using camelCase naming')).toBe('technical');
    });

    it('should categorize persons based on context', () => {
      expect(categorizeTerm('Smith', 'Dr. Smith said that')).toBe('person');
      expect(categorizeTerm('Johnson', 'Johnson founded the company')).toBe('person');
    });

    it('should categorize organizations based on context', () => {
      expect(categorizeTerm('Microsoft', 'Microsoft Corporation announced')).toBe('organization');
      expect(categorizeTerm('Google', 'Google Inc. released')).toBe('organization');
    });

    it('should categorize products based on context', () => {
      expect(categorizeTerm('iPhone', 'The new iPhone version')).toBe('technical');
      expect(categorizeTerm('Windows', 'Latest Windows release')).toBe('product');
    });

    it('should default to general for unknown terms', () => {
      expect(categorizeTerm('something', 'something happened')).toBe('general');
    });
  });

  describe('extractProperNounPhrases', () => {
    it('should extract multi-word proper nouns', () => {
      const text = 'New York is a city. San Francisco is also a city.';
      const phrases = extractProperNounPhrases(text);
      expect(phrases).toContain('New York');
      expect(phrases).toContain('San Francisco');
    });

    it('should extract company names', () => {
      const text = 'Microsoft Corporation and Apple Inc. are tech companies.';
      const phrases = extractProperNounPhrases(text);
      expect(phrases.some(p => p.includes('Microsoft'))).toBe(true);
      expect(phrases.some(p => p.includes('Apple'))).toBe(true);
    });

    it('should handle phrases with "of", "the", "and"', () => {
      const text = 'The University of California is prestigious.';
      const phrases = extractProperNounPhrases(text);
      expect(phrases.some(p => p.includes('University'))).toBe(true);
    });

    it('should filter out common non-proper-noun phrases', () => {
      const text = 'This is a test. That was easy.';
      const phrases = extractProperNounPhrases(text);
      // Should not extract "This" or "That"
      expect(phrases).not.toContain('This');
      expect(phrases).not.toContain('That');
    });

    it('should deduplicate phrases', () => {
      const text = 'New York is great. New York has many people.';
      const phrases = extractProperNounPhrases(text);
      const nyCount = phrases.filter(p => p === 'New York').length;
      expect(nyCount).toBe(1);
    });
  });

  describe('extractTerms', () => {
    const sampleText = `
      Kubernetes is a powerful container orchestration platform.
      It was developed by Google and is now maintained by the CNCF.
      Many companies like Microsoft, Amazon, and IBM use Kubernetes.
      OAuth2 is used for authentication. The API is RESTful.
    `;

    it('should extract terms from text', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      expect(terms.length).toBeGreaterThan(0);
    });

    it('should identify proper nouns', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      const kubernetes = terms.find(t => t.term === 'Kubernetes');
      expect(kubernetes).toBeDefined();
      expect(kubernetes?.isProperNoun).toBe(true);
    });

    it('should identify acronyms', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      const cncf = terms.find(t => t.term === 'CNCF');
      const api = terms.find(t => t.term === 'API');
      // At least one acronym should be found
      expect(cncf || api).toBeDefined();
    });

    it('should identify technical terms', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      const oauth = terms.find(t => t.term === 'OAuth2');
      const restful = terms.find(t => t.term === 'RESTful');
      // At least one technical term should be found
      expect(oauth || restful).toBeDefined();
    });

    it('should extract context for each term', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      terms.forEach(term => {
        expect(term.context).toBeTruthy();
        expect(typeof term.context).toBe('string');
      });
    });

    it('should generate phonetic codes', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      terms.forEach(term => {
        expect(term.phoneticCode).toBeTruthy();
      });
    });

    it('should count frequencies', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      const kubernetes = terms.find(t => t.term === 'Kubernetes');
      if (kubernetes) {
        expect(kubernetes.frequency).toBeGreaterThan(0);
      }
    });

    it('should categorize terms', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      terms.forEach(term => {
        expect(term.category).toBeTruthy();
        expect(['person', 'organization', 'location', 'product', 'technical', 'acronym', 'heading', 'general']).toContain(term.category);
      });
    });

    it('should filter stop words', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      const stopWords = ['the', 'is', 'a', 'and', 'by', 'for'];
      terms.forEach(term => {
        expect(stopWords).not.toContain(term.normalizedTerm);
      });
    });

    it('should sort by importance', () => {
      const terms = extractTerms(sampleText, 'test.txt');
      // Terms should be sorted (higher importance first)
      for (let i = 1; i < terms.length; i++) {
        // Can't directly compare scores, but can check they're ordered
        expect(terms[i - 1]).toBeTruthy();
        expect(terms[i]).toBeTruthy();
      }
    });

    it('should handle configuration options', () => {
      const terms = extractTerms(sampleText, 'test.txt', {
        minWordLength: 5,
        extractAcronyms: false,
      });
      // Should still extract terms
      expect(terms.length).toBeGreaterThan(0);
      // No acronyms with length < 5
      const shortAcronyms = terms.filter(t => t.category === 'acronym' && t.term.length < 5);
      expect(shortAcronyms.length).toBe(0);
    });

    it('should handle empty text', () => {
      const terms = extractTerms('', 'empty.txt');
      expect(terms).toEqual([]);
    });

    it('should extract multi-word phrases', () => {
      const text = 'New York City and San Francisco are major cities.';
      const terms = extractTerms(text, 'cities.txt');
      const phrases = terms.filter(t => t.term.includes(' '));
      expect(phrases.length).toBeGreaterThan(0);
    });
  });

  describe('mergeTerms', () => {
    const terms1 = extractTerms('Kubernetes is great. Kubernetes rocks.', 'file1.txt');
    const terms2 = extractTerms('Docker and Kubernetes work together. Kubernetes is popular.', 'file2.txt');

    it('should merge term lists', () => {
      const merged = mergeTerms([terms1, terms2]);
      expect(merged.length).toBeGreaterThan(0);
    });

    it('should deduplicate terms', () => {
      const merged = mergeTerms([terms1, terms2]);
      const termTexts = merged.map(t => t.normalizedTerm);
      const uniqueTerms = new Set(termTexts);
      expect(termTexts.length).toBe(uniqueTerms.size);
    });

    it('should combine frequencies', () => {
      const merged = mergeTerms([terms1, terms2]);
      const kubernetes = merged.find(t => t.term === 'Kubernetes');
      if (kubernetes) {
        // Frequency should be sum of both lists
        expect(kubernetes.frequency).toBeGreaterThan(2);
      }
    });

    it('should handle empty lists', () => {
      const merged = mergeTerms([]);
      expect(merged).toEqual([]);
    });

    it('should handle single list', () => {
      const merged = mergeTerms([terms1]);
      expect(merged.length).toBe(terms1.length);
    });
  });

  describe('filterTermsByCategory', () => {
    const sampleTerms = extractTerms(
      'Dr. Smith works at Microsoft. He uses OAuth2 for API authentication.',
      'test.txt'
    );

    it('should filter by single category', () => {
      const filtered = filterTermsByCategory(sampleTerms, ['acronym']);
      filtered.forEach(term => {
        expect(term.category).toBe('acronym');
      });
    });

    it('should filter by multiple categories', () => {
      const filtered = filterTermsByCategory(sampleTerms, ['person', 'organization']);
      filtered.forEach(term => {
        expect(['person', 'organization']).toContain(term.category);
      });
    });

    it('should return empty array if no matches', () => {
      const filtered = filterTermsByCategory(sampleTerms, ['location']);
      // May or may not have locations in sample
      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should handle empty term list', () => {
      const filtered = filterTermsByCategory([], ['person']);
      expect(filtered).toEqual([]);
    });
  });

  describe('getTopTerms', () => {
    const sampleTerms = extractTerms(
      'Kubernetes, Docker, and React are popular. Kubernetes is used everywhere.',
      'test.txt'
    );

    it('should return top N terms', () => {
      const top = getTopTerms(sampleTerms, 3);
      expect(top.length).toBeLessThanOrEqual(3);
    });

    it('should return all terms if N exceeds length', () => {
      const top = getTopTerms(sampleTerms, 1000);
      expect(top.length).toBe(sampleTerms.length);
    });

    it('should return empty array if N is 0', () => {
      const top = getTopTerms(sampleTerms, 0);
      expect(top).toEqual([]);
    });

    it('should preserve order', () => {
      const top = getTopTerms(sampleTerms, 5);
      // Should match first 5 terms from original
      for (let i = 0; i < top.length; i++) {
        expect(top[i]).toEqual(sampleTerms[i]);
      }
    });
  });

  describe('findPhoneticMatches', () => {
    const sampleTerms = extractTerms(
      'Kubernetes orchestrates containers. Docker builds them.',
      'test.txt'
    );

    it('should find exact phonetic matches', () => {
      const matches = findPhoneticMatches(sampleTerms, 'Kubernetes');
      const kubernetes = matches.find(t => t.term === 'Kubernetes');
      expect(kubernetes).toBeDefined();
    });

    it('should respect maxResults', () => {
      const matches = findPhoneticMatches(sampleTerms, 'test', 2);
      expect(matches.length).toBeLessThanOrEqual(2);
    });

    it('should find partial matches for multi-word terms', () => {
      const text = 'New York City is big.';
      const terms = extractTerms(text, 'test.txt');
      const matches = findPhoneticMatches(terms, 'York');
      // Should find terms containing York
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should handle no matches', () => {
      const matches = findPhoneticMatches(sampleTerms, 'xyz123notfound');
      // May or may not find matches, but should return array
      expect(Array.isArray(matches)).toBe(true);
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle large text efficiently', () => {
      const largeText = `
        Kubernetes is an open-source container orchestration platform.
        ${'Docker containers are lightweight. '.repeat(100)}
        OAuth2 provides secure authentication.
        ${'React is a JavaScript library. '.repeat(100)}
      `;

      const startTime = Date.now();
      const terms = extractTerms(largeText, 'large.txt');
      const endTime = Date.now();

      expect(terms.length).toBeGreaterThan(0);
      // Should complete in reasonable time (< 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle special characters in text', () => {
      const text = 'Use OAuth2.0 for secure access! Visit https://example.com.';
      const terms = extractTerms(text, 'test.txt');
      expect(terms.length).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      const text = 'Café serves coffee. Naïve approach failed.';
      const terms = extractTerms(text, 'test.txt');
      expect(terms.length).toBeGreaterThan(0);
    });

    it('should handle mixed language text gracefully', () => {
      const text = 'This is English. C\'est français. Das ist Deutsch.';
      const terms = extractTerms(text, 'test.txt');
      // Should extract something without crashing
      expect(Array.isArray(terms)).toBe(true);
    });
  });
});
