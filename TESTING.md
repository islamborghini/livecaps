# RAG Testing Documentation

This document describes the automated test suite for the LiveCaps RAG (Retrieval-Augmented Generation) implementation.

## Table of Contents

- [Overview](#overview)
- [Test Setup](#test-setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Test Coverage](#test-coverage)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)

## Overview

The RAG test suite validates the complete transcription correction pipeline, including:

1. **Document Parsing** - Extracting text from PDF, DOCX, PPTX, and plain text files
2. **Term Extraction** - Identifying important terms, proper nouns, acronyms, and technical vocabulary
3. **Phonetic Matching** - Finding sound-alike words to catch transcription errors
4. **Correction Pipeline** - The complete workflow from low-confidence word detection to correction
5. **Integration** - End-to-end tests validating the entire RAG system

## Test Setup

### Prerequisites

```bash
# Install dependencies
npm install
```

The test suite uses:
- **Jest** - Test framework
- **@testing-library/jest-dom** - DOM matchers
- **Node environment** - For testing server-side modules

### Environment Variables

Tests use mock environment variables configured in `jest.setup.js`. You don't need to set real API keys for most tests.

For tests that require real API calls (currently all mocked), you would set:
```bash
# Optional: only needed for integration tests with real APIs
export JINA_API_KEY=your-key
export UPSTASH_VECTOR_REST_URL=your-url
export UPSTASH_VECTOR_REST_TOKEN=your-token
export GROQ_API_KEY=your-key
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

This is useful during development - tests automatically re-run when files change.

### Run Tests with Coverage Report

```bash
npm run test:coverage
```

Generates a detailed coverage report showing which lines of code are tested.

### Run Specific Test Suites

```bash
# Run only RAG module tests
npm run test:rag

# Run only integration tests
npm run test:integration

# Run a specific test file
npm test phoneticMatcher.test

# Run tests matching a pattern
npm test -- --testNamePattern="phonetic"
```

### Run Tests in CI/CD

```bash
# Run all tests with coverage, fail if coverage below thresholds
npm run test:coverage -- --ci --coverage --maxWorkers=2
```

## Test Structure

```
livecaps/
├── app/
│   └── lib/
│       └── __tests__/           # Unit tests for RAG modules
│           ├── phoneticMatcher.test.ts
│           ├── termExtractor.test.ts
│           ├── documentParser.test.ts
│           └── corrector.test.ts
│
├── __tests__/                   # Integration tests
│   └── rag-integration.test.ts
│
├── jest.config.js              # Jest configuration
├── jest.setup.js               # Test environment setup
└── TESTING.md                  # This file
```

## Test Coverage

### Module: phoneticMatcher.test.ts

Tests phonetic similarity algorithms that catch sound-alike transcription errors.

**Key Test Cases:**
- ✅ Soundex code generation (e.g., "Kubernetes" → "K156")
- ✅ Metaphone code generation for advanced phonetic matching
- ✅ Levenshtein distance calculations
- ✅ Multi-word phrase matching
- ✅ Real-world transcription errors (e.g., "cooper netties" → "Kubernetes")
- ✅ Compound word splitting
- ✅ Best match finding with multiple candidates

**Example:**
```typescript
// Tests that "cooper netties" matches "Kubernetes"
const result = calculatePhoneticSimilarity('cooper netties', 'Kubernetes');
expect(result.similarity).toBeGreaterThan(0);
```

### Module: termExtractor.test.ts

Tests intelligent extraction of important terms from documents.

**Key Test Cases:**
- ✅ Sentence splitting with abbreviation handling
- ✅ Proper noun identification
- ✅ Acronym detection (API, HTTP, OAuth2)
- ✅ Technical term detection (camelCase, snake_case, kebab-case)
- ✅ Multi-word phrase extraction ("New York City")
- ✅ Term categorization (person, organization, product, technical)
- ✅ Context extraction for each term
- ✅ Phonetic code generation
- ✅ Frequency counting
- ✅ Term merging and deduplication

**Example:**
```typescript
// Tests extraction of technical terms
const text = 'OAuth2 provides authentication via RESTful APIs';
const terms = extractTerms(text, 'test.txt');
const acronyms = terms.filter(t => t.category === 'acronym');
expect(acronyms.length).toBeGreaterThan(0);
```

### Module: documentParser.test.ts

Tests extraction of text from various document formats.

**Key Test Cases:**
- ✅ Plain text file parsing
- ✅ Markdown file parsing
- ✅ PDF error handling (requires valid PDF files for full tests)
- ✅ DOCX error handling
- ✅ PPTX error handling
- ✅ UTF-8 encoding support
- ✅ Empty document handling
- ✅ Large document performance
- ✅ Term extraction integration
- ✅ Metadata inclusion (file size, processing time, etc.)

**Example:**
```typescript
// Tests parsing a text document and extracting terms
const buffer = Buffer.from('Kubernetes orchestrates containers', 'utf-8');
const result = await parseDocument(buffer, 'test.txt', 'text/plain');
expect(result.success).toBe(true);
expect(result.terms.length).toBeGreaterThan(0);
```

### Module: corrector.test.ts

Tests the main correction orchestrator.

**Key Test Cases:**
- ✅ Low-confidence word identification
- ✅ Confidence threshold handling
- ✅ Word position preservation
- ✅ Multiple error scenarios
- ✅ Edge cases (empty lists, missing data, unicode)
- ✅ Performance with large transcripts

**Example:**
```typescript
// Tests identifying words below confidence threshold
const words = [
  { word: 'cooper', confidence: 0.35, ... },
  { word: 'netties', confidence: 0.28, ... }
];
const lowConfidence = identifyLowConfidenceWords(words, 0.7);
expect(lowConfidence.length).toBe(2);
```

### Integration: rag-integration.test.ts

End-to-end tests validating the complete RAG workflow.

**Key Test Cases:**
- ✅ Complete workflow: Upload → Extract → Correct
- ✅ Multi-file upload scenarios
- ✅ Common transcription error corrections
- ✅ Performance with large documents
- ✅ Progressive transcript corrections
- ✅ Real-world conference presentation simulation
- ✅ Quality metrics validation
- ✅ Error recovery

**Example:**
```typescript
// Tests the complete RAG pipeline
const doc = Buffer.from('Kubernetes guide...', 'utf-8');
const parsed = await parseDocument(doc, 'guide.txt', 'text/plain');

// Simulate transcription errors
const transcript = 'cooper netties for containers';
const lowConfidence = identifyLowConfidenceWords(wordConfidences, 0.7);

// Find matches in extracted terms
const matches = findPhoneticallySimilarTerms('cooper netties', parsed.terms);
expect(matches.length).toBeGreaterThan(0);
```

## Test Coverage Goals

The test suite aims for the following coverage thresholds (configured in `jest.config.js`):

- **Branches:** 70%
- **Functions:** 70%
- **Lines:** 70%
- **Statements:** 70%

### Current Coverage

Run `npm run test:coverage` to see current coverage. Example output:

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
phoneticMatcher.ts |   95.2  |   88.4   |  100.0  |   95.2  |
termExtractor.ts   |   92.1  |   85.7   |   96.4  |   92.1  |
documentParser.ts  |   88.5  |   81.2   |   91.7  |   88.5  |
corrector.ts       |   85.3  |   78.9   |   88.9  |   85.3  |
-------------------|---------|----------|---------|---------|
```

## Writing New Tests

### Test File Location

- **Unit tests:** Place in `app/lib/__tests__/[module-name].test.ts`
- **Integration tests:** Place in `__tests__/[feature-name].test.ts`

### Test Structure Template

```typescript
/**
 * Tests for [Module Name]
 *
 * Brief description of what this module does
 */

import { functionToTest } from '../module';

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test data';

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe('expected output');
    });

    it('should handle edge cases', () => {
      expect(functionToTest('')).toBe('default');
      expect(functionToTest(null)).toThrow();
    });
  });
});
```

### Best Practices

1. **One assertion per test** (when possible) - Makes failures easier to diagnose
2. **Descriptive test names** - Use "should..." format
3. **Arrange-Act-Assert pattern** - Clear test structure
4. **Test edge cases** - Empty strings, null, undefined, very large inputs
5. **Test error conditions** - Verify error handling works
6. **Mock external dependencies** - Don't make real API calls in unit tests
7. **Use meaningful test data** - Real-world examples are better than "foo/bar"

### Example: Testing a New Function

```typescript
// Function to test
export function correctWord(
  word: string,
  candidates: string[],
  threshold: number
): string | null {
  // Implementation...
}

// Test file
describe('correctWord', () => {
  it('should return exact match if found', () => {
    const result = correctWord('test', ['test', 'Test', 'testing'], 0.9);
    expect(result).toBe('test');
  });

  it('should return null if no match above threshold', () => {
    const result = correctWord('xyz', ['abc', 'def'], 0.9);
    expect(result).toBeNull();
  });

  it('should handle empty candidates list', () => {
    const result = correctWord('test', [], 0.9);
    expect(result).toBeNull();
  });

  it('should be case-insensitive', () => {
    const result = correctWord('TEST', ['test'], 0.9);
    expect(result).toBeTruthy();
  });
});
```

## Troubleshooting

### Tests Failing to Run

**Issue:** `Cannot find module 'jest'`
```bash
npm install
```

**Issue:** `Unexpected token 'export'`
- Jest config may not be transpiling TypeScript correctly
- Check `jest.config.js` has correct `transform` settings

### Slow Tests

**Issue:** Tests take too long
```bash
# Run tests in parallel (default)
npm test

# Limit workers if running on low-memory system
npm test -- --maxWorkers=2
```

**Issue:** Specific test is slow
- Check for synchronous file operations
- Check for large data processing
- Add timeout: `it('test', async () => { ... }, 10000);` // 10 second timeout

### Mock Issues

**Issue:** Mocks not working
- Ensure mocks are defined before imports
- Use `jest.mock()` at the top of the file
- Clear mocks between tests: `jest.clearAllMocks()`

**Example:**
```typescript
jest.mock('../vectorStore', () => ({
  searchSessionTerms: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});
```

### Coverage Issues

**Issue:** Coverage below thresholds
```bash
# See uncovered lines
npm run test:coverage

# Open detailed HTML report
open coverage/lcov-report/index.html
```

Focus on:
1. Error handling paths
2. Edge cases
3. Conditional branches

### Debug Tests

**Issue:** Need to debug a failing test

```typescript
// Add debug output
it('should do something', () => {
  const result = functionToTest(input);
  console.log('Result:', result); // Will show in test output
  expect(result).toBe(expected);
});
```

```bash
# Run with verbose output
npm test -- --verbose

# Run single test file
npm test -- phoneticMatcher.test.ts

# Run specific test
npm test -- --testNamePattern="should match phonetically"
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Next.js Testing](https://nextjs.org/docs/testing)

## Summary

This test suite provides comprehensive coverage of the RAG implementation, ensuring:

✅ **Correctness** - All core functions work as expected
✅ **Reliability** - Error handling and edge cases are covered
✅ **Performance** - Large documents and transcripts are handled efficiently
✅ **Maintainability** - Clear tests document expected behavior
✅ **Quality** - Coverage thresholds ensure code is well-tested

Run tests before committing changes:
```bash
npm test
```

For questions or issues with tests, please check the troubleshooting section or open an issue.
