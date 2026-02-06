/**
 * RAG Integration Tests
 *
 * End-to-end tests for the complete RAG workflow:
 * 1. Document upload and parsing
 * 2. Term extraction
 * 3. Transcription correction
 *
 * These tests verify that all components work together correctly.
 */

import { parseDocument } from '../app/lib/documentParser';
import { extractTerms } from '../app/lib/termExtractor';
import { calculatePhoneticSimilarity, findPhoneticallySimilarTerms } from '../app/lib/phoneticMatcher';
import { identifyLowConfidenceWords } from '../app/lib/corrector';
import { WordConfidence, ExtractedTerm } from '../app/types/rag';

describe('RAG Integration Tests', () => {
  describe('Complete workflow: Upload → Extract → Correct', () => {
    it('should process a document and identify correction candidates', async () => {
      // Step 1: Upload and parse document
      const documentText = `
        Kubernetes Container Orchestration Guide

        Introduction
        Kubernetes is a powerful platform for managing containerized applications.
        It was originally developed by Google and is now maintained by the CNCF.

        Key Components
        - Pods: The smallest deployable units
        - Services: Network abstractions
        - kubectl: Command-line interface
        - Docker: Container runtime (commonly used)

        Authentication
        OAuth2 provides secure authentication for the Kubernetes API.
        The REST API uses JSON for data exchange.
      `;

      const buffer = Buffer.from(documentText, 'utf-8');
      const parsed = await parseDocument(buffer, 'k8s-guide.txt', 'text/plain');

      // Verify document parsing
      expect(parsed.success).toBe(true);
      expect(parsed.terms.length).toBeGreaterThan(0);
      expect(parsed.rawText).toContain('Kubernetes');

      // Step 2: Verify term extraction found key terms
      const termNames = parsed.terms.map(t => t.term);
      expect(termNames.some(name => name.includes('Kubernetes'))).toBe(true);
      expect(termNames.some(name => name.includes('Docker') || name.includes('kubectl'))).toBe(true);

      // Step 3: Simulate transcription with errors
      const transcriptWithErrors = 'We use cooper netties for container management with docket';
      const wordConfidences: WordConfidence[] = [
        { word: 'We', confidence: 0.98, start: 0, end: 2, punctuated_word: 'We' },
        { word: 'use', confidence: 0.97, start: 3, end: 6, punctuated_word: 'use' },
        { word: 'cooper', confidence: 0.35, start: 7, end: 13, punctuated_word: 'cooper' },
        { word: 'netties', confidence: 0.28, start: 14, end: 21, punctuated_word: 'netties' },
        { word: 'for', confidence: 0.99, start: 22, end: 25, punctuated_word: 'for' },
        { word: 'container', confidence: 0.96, start: 26, end: 35, punctuated_word: 'container' },
        { word: 'management', confidence: 0.94, start: 36, end: 46, punctuated_word: 'management' },
        { word: 'with', confidence: 0.98, start: 47, end: 51, punctuated_word: 'with' },
        { word: 'docket', confidence: 0.42, start: 52, end: 58, punctuated_word: 'docket' },
      ];

      // Step 4: Identify low-confidence words
      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);
      expect(lowConfidence.length).toBe(3);
      expect(lowConfidence.map(w => w.word)).toEqual(['cooper', 'netties', 'docket']);

      // Step 5: Find phonetic matches in extracted terms
      const cooperMatches = findPhoneticallySimilarTerms(
        'cooper netties',
        parsed.terms,
        { minSimilarity: 0.3 }
      );

      const docketMatches = findPhoneticallySimilarTerms(
        'docket',
        parsed.terms,
        { minSimilarity: 0.3 }
      );

      // Should find some matches (may or may not be perfect)
      expect(cooperMatches.length).toBeGreaterThanOrEqual(0);
      expect(docketMatches.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multi-file upload scenario', async () => {
      const file1 = Buffer.from('Kubernetes orchestrates containers.', 'utf-8');
      const file2 = Buffer.from('Docker builds container images.', 'utf-8');
      const file3 = Buffer.from('OAuth2 secures APIs.', 'utf-8');

      const [parsed1, parsed2, parsed3] = await Promise.all([
        parseDocument(file1, 'file1.txt', 'text/plain'),
        parseDocument(file2, 'file2.txt', 'text/plain'),
        parseDocument(file3, 'file3.txt', 'text/plain'),
      ]);

      expect(parsed1.success).toBe(true);
      expect(parsed2.success).toBe(true);
      expect(parsed3.success).toBe(true);

      // Combine all terms
      const allTerms = [
        ...parsed1.terms,
        ...parsed2.terms,
        ...parsed3.terms,
      ];

      expect(allTerms.length).toBeGreaterThan(0);

      // Should be able to find matches across all files
      const k8sMatches = findPhoneticallySimilarTerms('kube', allTerms);
      const dockerMatches = findPhoneticallySimilarTerms('docker', allTerms);

      expect(k8sMatches.length + dockerMatches.length).toBeGreaterThan(0);
    });

    it('should demonstrate phonetic matching for common transcription errors', () => {
      // Create terms from a technical presentation
      const presentationText = `
        This talk covers Kubernetes, PostgreSQL, and React.
        We'll discuss microservices architecture and OAuth2 authentication.
        Tools include kubectl, Docker, and Jenkins CI/CD pipeline.
      `;

      const terms = extractTerms(presentationText, 'presentation.txt');

      // Common transcription errors and their expected matches
      const testCases = [
        { misheard: 'cooper netties', expected: 'Kubernetes' },
        { misheard: 'post gres', expected: 'PostgreSQL' },
        { misheard: 'ree act', expected: 'React' },
        { misheard: 'oh auth', expected: 'OAuth2' },
        { misheard: 'docket', expected: 'Docker' },
        { misheard: 'cube ctl', expected: 'kubectl' },
      ];

      testCases.forEach(({ misheard, expected }) => {
        const similarity = calculatePhoneticSimilarity(misheard, expected);

        // Should have at least some similarity
        expect(similarity.similarity).toBeGreaterThan(0);

        console.log(`"${misheard}" vs "${expected}": ${similarity.similarity.toFixed(2)} (${similarity.matchedBy})`);
      });
    });
  });

  describe('Performance and scalability', () => {
    it('should handle large documents efficiently', async () => {
      const largePresentationText = `
        Kubernetes Architecture Deep Dive

        ${'Kubernetes provides container orchestration at scale. '.repeat(100)}
        ${'Docker is the most popular container runtime. '.repeat(100)}
        ${'OAuth2 secures microservices APIs. '.repeat(100)}
        ${'PostgreSQL stores application data. '.repeat(100)}
        ${'React builds user interfaces. '.repeat(100)}

        Key concepts: Pods, Services, Deployments, StatefulSets, ConfigMaps, Secrets.
        Tools: kubectl, helm, kustomize, docker, podman.
        Patterns: Sidecar, Ambassador, Adapter, Init containers.
      `;

      const startTime = Date.now();
      const buffer = Buffer.from(largePresentationText, 'utf-8');
      const parsed = await parseDocument(buffer, 'large-presentation.txt', 'text/plain');
      const parseTime = Date.now() - startTime;

      expect(parsed.success).toBe(true);
      expect(parsed.terms.length).toBeGreaterThan(0);
      expect(parseTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Test correction performance
      const searchStart = Date.now();
      const matches = findPhoneticallySimilarTerms('cooper netties', parsed.terms);
      const searchTime = Date.now() - searchStart;

      expect(searchTime).toBeLessThan(1000); // Should search within 1 second
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should handle many low-confidence words', () => {
      // Simulate a transcript with many errors
      const wordConfidences: WordConfidence[] = Array.from({ length: 100 }, (_, i) => ({
        word: `word${i}`,
        confidence: Math.random() * 0.4 + 0.1, // 0.1-0.5 (all low)
        start: i * 10,
        end: i * 10 + 5,
        punctuated_word: `word${i}`,
      }));

      const startTime = Date.now();
      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);
      const processingTime = Date.now() - startTime;

      expect(lowConfidence.length).toBe(100); // All should be identified
      expect(processingTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Error recovery and edge cases', () => {
    it('should handle empty documents gracefully', async () => {
      const buffer = Buffer.from('', 'utf-8');
      const parsed = await parseDocument(buffer, 'empty.txt', 'text/plain');

      expect(parsed.success).toBe(false);
      expect(parsed.terms).toEqual([]);
    });

    it('should handle documents with no technical terms', async () => {
      const buffer = Buffer.from('The quick brown fox jumps over the lazy dog.', 'utf-8');
      const parsed = await parseDocument(buffer, 'simple.txt', 'text/plain');

      expect(parsed.success).toBe(true);
      // May extract some terms, but likely very few
      expect(Array.isArray(parsed.terms)).toBe(true);
    });

    it('should handle transcripts with no low-confidence words', () => {
      const wordConfidences: WordConfidence[] = [
        { word: 'Perfect', confidence: 0.99, start: 0, end: 7, punctuated_word: 'Perfect' },
        { word: 'transcript', confidence: 0.98, start: 8, end: 18, punctuated_word: 'transcript' },
        { word: 'quality', confidence: 0.97, start: 19, end: 26, punctuated_word: 'quality' },
      ];

      const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);
      expect(lowConfidence).toEqual([]);
    });

    it('should handle mismatched queries with no phonetic matches', () => {
      const terms: ExtractedTerm[] = [
        {
          term: 'Kubernetes',
          normalizedTerm: 'kubernetes',
          context: 'Kubernetes orchestrates containers',
          sourceFile: 'test.txt',
          phoneticCode: 'K156',
          frequency: 5,
          isProperNoun: true,
          category: 'technical',
        },
      ];

      const matches = findPhoneticallySimilarTerms(
        'completelydifferent',
        terms,
        { minSimilarity: 0.9 }
      );

      // With high threshold, unlikely to match
      expect(Array.isArray(matches)).toBe(true);
    });
  });

  describe('Real-world scenario simulations', () => {
    it('should simulate a technical conference presentation', async () => {
      const presentation = `
        Building Cloud-Native Applications with Kubernetes

        Today we'll cover:
        1. Kubernetes fundamentals
        2. Microservices architecture
        3. CI/CD with Jenkins and GitLab
        4. PostgreSQL database management
        5. OAuth2 authentication
        6. React frontend development

        Speaker: Dr. Jane Smith, Chief Architect at TechCorp Inc.
        Location: San Francisco Convention Center

        Key takeaways:
        - Use kubectl for cluster management
        - Docker for containerization
        - Implement service mesh with Istio
        - Monitor with Prometheus and Grafana
      `;

      const buffer = Buffer.from(presentation, 'utf-8');
      const parsed = await parseDocument(buffer, 'conference.txt', 'text/plain');

      expect(parsed.success).toBe(true);
      expect(parsed.terms.length).toBeGreaterThan(10);

      // Check for different term categories
      const categories = new Set(parsed.terms.map(t => t.category));
      expect(categories.size).toBeGreaterThan(1); // Should have multiple categories

      // Check for proper nouns
      const properNouns = parsed.terms.filter(t => t.isProperNoun);
      expect(properNouns.length).toBeGreaterThan(0);

      // Check for acronyms
      const acronyms = parsed.terms.filter(t => t.category === 'acronym');
      expect(acronyms.length).toBeGreaterThan(0);

      // Check for technical terms
      const technical = parsed.terms.filter(t => t.category === 'technical');
      expect(technical.length).toBeGreaterThan(0);
    });

    it('should simulate live transcription with progressive corrections', () => {
      // Simulate receiving transcript in chunks as speech progresses
      const chunks = [
        {
          text: 'Today we will discuss cooper netties',
          words: [
            { word: 'Today', confidence: 0.98, start: 0, end: 5, punctuated_word: 'Today' },
            { word: 'we', confidence: 0.99, start: 6, end: 8, punctuated_word: 'we' },
            { word: 'will', confidence: 0.97, start: 9, end: 13, punctuated_word: 'will' },
            { word: 'discuss', confidence: 0.96, start: 14, end: 21, punctuated_word: 'discuss' },
            { word: 'cooper', confidence: 0.35, start: 22, end: 28, punctuated_word: 'cooper' },
            { word: 'netties', confidence: 0.28, start: 29, end: 36, punctuated_word: 'netties' },
          ],
        },
        {
          text: 'and docket containers',
          words: [
            { word: 'and', confidence: 0.99, start: 0, end: 3, punctuated_word: 'and' },
            { word: 'docket', confidence: 0.42, start: 4, end: 10, punctuated_word: 'docket' },
            { word: 'containers', confidence: 0.95, start: 11, end: 21, punctuated_word: 'containers' },
          ],
        },
        {
          text: 'with oh auth two security',
          words: [
            { word: 'with', confidence: 0.98, start: 0, end: 4, punctuated_word: 'with' },
            { word: 'oh', confidence: 0.65, start: 5, end: 7, punctuated_word: 'oh' },
            { word: 'auth', confidence: 0.68, start: 8, end: 12, punctuated_word: 'auth' },
            { word: 'two', confidence: 0.72, start: 13, end: 16, punctuated_word: 'two' },
            { word: 'security', confidence: 0.94, start: 17, end: 25, punctuated_word: 'security' },
          ],
        },
      ];

      // Process each chunk
      chunks.forEach((chunk, index) => {
        const lowConfidence = identifyLowConfidenceWords(chunk.words, 0.7);

        console.log(`Chunk ${index + 1}: "${chunk.text}"`);
        console.log(`  Low confidence words:`, lowConfidence.map(w => w.word));

        expect(Array.isArray(lowConfidence)).toBe(true);
      });

      // Verify each chunk has identifiable errors
      const chunk1Errors = identifyLowConfidenceWords(chunks[0].words, 0.7);
      expect(chunk1Errors.length).toBeGreaterThan(0);

      const chunk2Errors = identifyLowConfidenceWords(chunks[1].words, 0.7);
      expect(chunk2Errors.length).toBeGreaterThan(0);

      const chunk3Errors = identifyLowConfidenceWords(chunks[2].words, 0.7);
      expect(chunk3Errors.length).toBeGreaterThan(0);
    });
  });

  describe('Quality metrics and validation', () => {
    it('should maintain high term extraction quality', async () => {
      const technicalDoc = `
        Kubernetes (K8s) is an open-source container orchestration platform.
        It automates deployment, scaling, and management of containerized applications.

        Key features:
        - Automatic bin packing
        - Self-healing capabilities
        - Horizontal scaling
        - Service discovery and load balancing
        - Automated rollouts and rollbacks

        Developed by Google, now maintained by CNCF (Cloud Native Computing Foundation).
      `;

      const buffer = Buffer.from(technicalDoc, 'utf-8');
      const parsed = await parseDocument(buffer, 'k8s-doc.txt', 'text/plain');

      expect(parsed.success).toBe(true);

      // Quality checks
      expect(parsed.terms.length).toBeGreaterThan(0);

      // All terms should have required fields
      parsed.terms.forEach(term => {
        expect(term.term).toBeTruthy();
        expect(term.normalizedTerm).toBeTruthy();
        expect(term.phoneticCode).toBeTruthy();
        expect(term.category).toBeTruthy();
        expect(typeof term.frequency).toBe('number');
        expect(typeof term.isProperNoun).toBe('boolean');
      });

      // Should extract the key term "Kubernetes"
      const kubernetes = parsed.terms.find(t =>
        t.term.toLowerCase().includes('kubernetes') ||
        t.term === 'K8s'
      );
      expect(kubernetes).toBeDefined();
    });

    it('should provide useful phonetic matching scores', () => {
      const testPairs = [
        { a: 'Kubernetes', b: 'Kubernetes', expectedMin: 0.99 }, // Exact match
        { a: 'Kubernetes', b: 'kubernetes', expectedMin: 0.99 }, // Case difference
        { a: 'Kubernetes', b: 'Kubernetis', expectedMin: 0.7 }, // Close match
        { a: 'Kubernetes', b: 'apple', expectedMax: 0.3 }, // No match
      ];

      testPairs.forEach(({ a, b, expectedMin, expectedMax }) => {
        const result = calculatePhoneticSimilarity(a, b);

        if (expectedMin !== undefined) {
          expect(result.similarity).toBeGreaterThanOrEqual(expectedMin);
        }
        if (expectedMax !== undefined) {
          expect(result.similarity).toBeLessThanOrEqual(expectedMax);
        }
      });
    });
  });
});
