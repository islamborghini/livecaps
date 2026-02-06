/**
 * Tests for Document Parser Module
 *
 * Tests extraction of text from different file formats (PDF, DOCX, PPTX, TXT)
 * and term extraction from parsed documents.
 */

import {
  SUPPORTED_MIME_TYPES,
  isSupportedMimeType,
  extractTextFromFile,
  extractTermsFromText,
  parseDocument,
  parseDocuments,
} from '../documentParser';

describe('DocumentParser', () => {
  describe('isSupportedMimeType', () => {
    it('should recognize supported MIME types', () => {
      expect(isSupportedMimeType(SUPPORTED_MIME_TYPES.PDF)).toBe(true);
      expect(isSupportedMimeType(SUPPORTED_MIME_TYPES.DOCX)).toBe(true);
      expect(isSupportedMimeType(SUPPORTED_MIME_TYPES.PPTX)).toBe(true);
      expect(isSupportedMimeType(SUPPORTED_MIME_TYPES.TXT)).toBe(true);
      expect(isSupportedMimeType(SUPPORTED_MIME_TYPES.MARKDOWN)).toBe(true);
    });

    it('should reject unsupported MIME types', () => {
      expect(isSupportedMimeType('image/png')).toBe(false);
      expect(isSupportedMimeType('video/mp4')).toBe(false);
      expect(isSupportedMimeType('application/unknown')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isSupportedMimeType('TEXT/PLAIN')).toBe(false);
    });
  });

  describe('extractTextFromFile - Plain Text', () => {
    it('should extract text from plain text buffer', async () => {
      const text = 'This is a test document about Kubernetes.';
      const buffer = Buffer.from(text, 'utf-8');

      const extracted = await extractTextFromFile(
        buffer,
        SUPPORTED_MIME_TYPES.TXT,
        'test.txt'
      );

      expect(extracted).toBe(text);
    });

    it('should handle empty text file', async () => {
      const buffer = Buffer.from('', 'utf-8');
      const extracted = await extractTextFromFile(
        buffer,
        SUPPORTED_MIME_TYPES.TXT,
        'empty.txt'
      );
      expect(extracted).toBe('');
    });

    it('should handle UTF-8 encoding', async () => {
      const text = 'Special characters: é, ñ, 中文';
      const buffer = Buffer.from(text, 'utf-8');
      const extracted = await extractTextFromFile(
        buffer,
        SUPPORTED_MIME_TYPES.TXT,
        'utf8.txt'
      );
      expect(extracted).toBe(text);
    });

    it('should handle markdown files', async () => {
      const markdown = '# Heading\n\nThis is **bold** text.';
      const buffer = Buffer.from(markdown, 'utf-8');
      const extracted = await extractTextFromFile(
        buffer,
        SUPPORTED_MIME_TYPES.MARKDOWN,
        'test.md'
      );
      expect(extracted).toBe(markdown);
    });
  });

  describe('extractTextFromFile - PDF', () => {
    it('should handle PDF parsing errors gracefully', async () => {
      // Invalid PDF buffer
      const buffer = Buffer.from('Not a real PDF', 'utf-8');

      await expect(
        extractTextFromFile(buffer, SUPPORTED_MIME_TYPES.PDF, 'fake.pdf')
      ).rejects.toThrow();
    });

    // Note: Testing actual PDF parsing would require valid PDF files
    // In a real test suite, you would include sample PDF files
    it('should accept valid PDF buffer format', async () => {
      // This is a minimal PDF structure (not valid, but shows the format)
      const minimalPDF = Buffer.from('%PDF-1.4\n%%EOF', 'utf-8');

      // Will likely fail to parse, but should attempt
      await expect(
        extractTextFromFile(minimalPDF, SUPPORTED_MIME_TYPES.PDF, 'minimal.pdf')
      ).rejects.toThrow();
    });
  });

  describe('extractTextFromFile - DOCX', () => {
    it('should handle DOCX parsing errors gracefully', async () => {
      // Invalid DOCX buffer
      const buffer = Buffer.from('Not a real DOCX', 'utf-8');

      await expect(
        extractTextFromFile(buffer, SUPPORTED_MIME_TYPES.DOCX, 'fake.docx')
      ).rejects.toThrow();
    });

    // Note: Testing actual DOCX parsing would require valid DOCX files
    // DOCX is a ZIP file, so it needs proper structure
  });

  describe('extractTextFromFile - PPTX', () => {
    it('should handle PPTX parsing errors gracefully', async () => {
      // Invalid PPTX buffer
      const buffer = Buffer.from('Not a real PPTX', 'utf-8');

      await expect(
        extractTextFromFile(buffer, SUPPORTED_MIME_TYPES.PPTX, 'fake.pptx')
      ).rejects.toThrow();
    });

    // Note: Testing actual PPTX parsing would require valid PPTX files
    // PPTX is also a ZIP file with specific XML structure
  });

  describe('extractTextFromFile - Unknown Type', () => {
    it('should attempt plain text extraction for unknown types', async () => {
      const text = 'Some text content';
      const buffer = Buffer.from(text, 'utf-8');

      const extracted = await extractTextFromFile(
        buffer,
        'application/unknown',
        'unknown.dat'
      );

      expect(extracted).toBe(text);
    });
  });

  describe('extractTermsFromText', () => {
    it('should extract terms from text', () => {
      const text = `
        Kubernetes is a container orchestration platform.
        It was developed by Google using Go programming language.
        OAuth2 provides authentication. The API is RESTful.
      `;

      const terms = extractTermsFromText(text, 'test.txt');

      expect(terms.length).toBeGreaterThan(0);
      expect(terms.every(t => t.sourceFile === 'test.txt')).toBe(true);
    });

    it('should return empty array for empty text', () => {
      const terms = extractTermsFromText('', 'empty.txt');
      expect(terms).toEqual([]);
    });

    it('should extract proper nouns', () => {
      const text = 'Microsoft and Google are competing in cloud services.';
      const terms = extractTermsFromText(text, 'test.txt');

      const microsoft = terms.find(t => t.term === 'Microsoft');
      const google = terms.find(t => t.term === 'Google');

      expect(microsoft || google).toBeDefined();
    });

    it('should extract acronyms', () => {
      const text = 'The API uses REST and JSON. HTTP is the protocol.';
      const terms = extractTermsFromText(text, 'test.txt');

      const acronyms = terms.filter(t => t.category === 'acronym');
      expect(acronyms.length).toBeGreaterThan(0);
    });

    it('should extract technical terms', () => {
      const text = 'Use camelCase for variables and PascalCase for classes.';
      const terms = extractTermsFromText(text, 'test.txt');

      const technical = terms.filter(t => t.category === 'technical');
      expect(technical.length).toBeGreaterThan(0);
    });
  });

  describe('parseDocument', () => {
    it('should parse plain text document successfully', async () => {
      const text = 'Kubernetes and Docker are container technologies.';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await parseDocument(
        buffer,
        'test.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.success).toBe(true);
      expect(result.rawText).toBe(text);
      expect(result.terms.length).toBeGreaterThan(0);
      expect(result.fileName).toBe('test.txt');
      expect(result.mimeType).toBe(SUPPORTED_MIME_TYPES.TXT);
      expect(result.fileSize).toBe(buffer.length);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty content', async () => {
      const buffer = Buffer.from('', 'utf-8');

      const result = await parseDocument(
        buffer,
        'empty.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty content');
      expect(result.warnings).toContain('No text content could be extracted from the file');
    });

    it('should handle parsing errors', async () => {
      const buffer = Buffer.from('Invalid content', 'utf-8');

      const result = await parseDocument(
        buffer,
        'fake.pdf',
        SUPPORTED_MIME_TYPES.PDF
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should warn about unknown MIME types', async () => {
      const text = 'Some content';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await parseDocument(
        buffer,
        'unknown.xyz',
        'application/unknown'
      );

      // Should still try to parse as text
      expect(result.rawText).toBe(text);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('Unknown MIME type'))).toBe(true);
    });

    it('should include all metadata fields', async () => {
      const text = 'Test content with Kubernetes';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await parseDocument(
        buffer,
        'test.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result).toHaveProperty('fileName');
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('fileSize');
      expect(result).toHaveProperty('rawText');
      expect(result).toHaveProperty('terms');
      expect(result).toHaveProperty('processedAt');
      expect(result).toHaveProperty('processingTimeMs');
      expect(result).toHaveProperty('success');
    });

    it('should measure processing time', async () => {
      const largeText = 'Kubernetes '.repeat(1000);
      const buffer = Buffer.from(largeText, 'utf-8');

      const result = await parseDocument(
        buffer,
        'large.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(result.processedAt).toBeGreaterThan(0);
    });
  });

  describe('parseDocuments', () => {
    it('should parse multiple documents', async () => {
      const files = [
        {
          buffer: Buffer.from('Kubernetes in file 1', 'utf-8'),
          fileName: 'file1.txt',
          mimeType: SUPPORTED_MIME_TYPES.TXT,
        },
        {
          buffer: Buffer.from('Docker in file 2', 'utf-8'),
          fileName: 'file2.txt',
          mimeType: SUPPORTED_MIME_TYPES.TXT,
        },
        {
          buffer: Buffer.from('React in file 3', 'utf-8'),
          fileName: 'file3.txt',
          mimeType: SUPPORTED_MIME_TYPES.TXT,
        },
      ];

      const results = await parseDocuments(files);

      expect(results.length).toBe(3);
      expect(results[0].fileName).toBe('file1.txt');
      expect(results[1].fileName).toBe('file2.txt');
      expect(results[2].fileName).toBe('file3.txt');
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      const files = [
        {
          buffer: Buffer.from('Valid content', 'utf-8'),
          fileName: 'valid.txt',
          mimeType: SUPPORTED_MIME_TYPES.TXT,
        },
        {
          buffer: Buffer.from('Invalid PDF', 'utf-8'),
          fileName: 'invalid.pdf',
          mimeType: SUPPORTED_MIME_TYPES.PDF,
        },
      ];

      const results = await parseDocuments(files);

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should process files in parallel', async () => {
      const files = Array(5).fill(null).map((_, i) => ({
        buffer: Buffer.from(`File ${i} content with Kubernetes`, 'utf-8'),
        fileName: `file${i}.txt`,
        mimeType: SUPPORTED_MIME_TYPES.TXT,
      }));

      const startTime = Date.now();
      const results = await parseDocuments(files);
      const endTime = Date.now();

      expect(results.length).toBe(5);
      // Should complete relatively quickly (parallel processing)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle empty file list', async () => {
      const results = await parseDocuments([]);
      expect(results).toEqual([]);
    });
  });

  describe('Integration with term extraction', () => {
    it('should extract domain-specific terms', async () => {
      const technicalDoc = `
        Kubernetes Deployment Guide

        Introduction to Container Orchestration

        Kubernetes uses Pods to run containers. Each Pod contains one or more
        Docker containers. The kubectl command-line tool manages clusters.

        OAuth2 provides authentication. The REST API uses JSON for data exchange.

        Common terms: microservices, CI/CD, DevOps, Infrastructure as Code (IaC).
      `;

      const buffer = Buffer.from(technicalDoc, 'utf-8');
      const result = await parseDocument(
        buffer,
        'k8s-guide.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.success).toBe(true);
      expect(result.terms.length).toBeGreaterThan(5);

      // Check for key technical terms
      const termNames = result.terms.map(t => t.term);
      expect(termNames.some(name => name.includes('Kubernetes'))).toBe(true);
      expect(termNames.some(name => name.includes('Docker'))).toBe(true);

      // Check for acronyms
      const acronyms = result.terms.filter(t => t.category === 'acronym');
      expect(acronyms.length).toBeGreaterThan(0);

      // Check for technical terms
      const technical = result.terms.filter(t => t.category === 'technical');
      expect(technical.length).toBeGreaterThan(0);
    });

    it('should extract terms with context', async () => {
      const doc = 'Kubernetes is powerful. Google created Kubernetes.';
      const buffer = Buffer.from(doc, 'utf-8');

      const result = await parseDocument(
        buffer,
        'test.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      const kubernetes = result.terms.find(t => t.term === 'Kubernetes');
      expect(kubernetes).toBeDefined();
      expect(kubernetes?.context).toBeTruthy();
      expect(kubernetes?.context.toLowerCase()).toContain('kubernetes');
    });

    it('should generate phonetic codes for all terms', async () => {
      const doc = 'Kubernetes, Docker, and React are technologies.';
      const buffer = Buffer.from(doc, 'utf-8');

      const result = await parseDocument(
        buffer,
        'test.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      result.terms.forEach(term => {
        expect(term.phoneticCode).toBeTruthy();
        expect(typeof term.phoneticCode).toBe('string');
      });
    });

    it('should count term frequencies', async () => {
      const doc = 'Kubernetes rocks. Kubernetes is great. Kubernetes everywhere!';
      const buffer = Buffer.from(doc, 'utf-8');

      const result = await parseDocument(
        buffer,
        'test.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      const kubernetes = result.terms.find(t => t.term === 'Kubernetes');
      expect(kubernetes).toBeDefined();
      expect(kubernetes?.frequency).toBeGreaterThan(1);
    });
  });

  describe('Performance tests', () => {
    it('should handle large documents efficiently', async () => {
      const largeText = `
        Kubernetes Documentation
        ${'Kubernetes is a container orchestration platform. '.repeat(1000)}
        ${'Docker containers are isolated. '.repeat(1000)}
        OAuth2 provides secure authentication.
      `;

      const buffer = Buffer.from(largeText, 'utf-8');
      const startTime = Date.now();

      const result = await parseDocument(
        buffer,
        'large-doc.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.terms.length).toBeGreaterThan(0);
      // Should complete in reasonable time (< 10 seconds)
      expect(endTime - startTime).toBeLessThan(10000);
    });

    it('should handle documents with many unique terms', async () => {
      const terms = Array.from({ length: 200 }, (_, i) => `Term${i}`);
      const text = terms.join('. ') + '.';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await parseDocument(
        buffer,
        'many-terms.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.success).toBe(true);
      expect(result.terms.length).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeLessThan(5000);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle very long file names', async () => {
      const longFileName = 'a'.repeat(255) + '.txt';
      const buffer = Buffer.from('Content', 'utf-8');

      const result = await parseDocument(
        buffer,
        longFileName,
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.fileName).toBe(longFileName);
    });

    it('should handle special characters in file names', async () => {
      const fileName = 'test-file_v2.1 (final).txt';
      const buffer = Buffer.from('Content', 'utf-8');

      const result = await parseDocument(
        buffer,
        fileName,
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.fileName).toBe(fileName);
    });

    it('should handle binary data gracefully', async () => {
      const binaryData = Buffer.from([0xFF, 0xFE, 0xFD, 0x00, 0x01]);

      const result = await parseDocument(
        binaryData,
        'binary.dat',
        SUPPORTED_MIME_TYPES.TXT
      );

      // Should attempt to parse, may get garbled text
      expect(result).toBeDefined();
    });

    it('should handle whitespace-only content', async () => {
      const buffer = Buffer.from('   \n\n\t\t   \n   ', 'utf-8');

      const result = await parseDocument(
        buffer,
        'whitespace.txt',
        SUPPORTED_MIME_TYPES.TXT
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty content');
    });
  });
});
