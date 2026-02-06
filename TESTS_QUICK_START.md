# RAG Tests - Quick Start Guide

## Installation

```bash
# Install all dependencies including test libraries
# Note: Requires --legacy-peer-deps for Next.js 14 compatibility
npm install --legacy-peer-deps
```

## Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only RAG module tests
npm run test:rag

# Run only integration tests
npm run test:integration
```

## What Gets Tested

### ✅ Phonetic Matching
- Sound-alike word detection (e.g., "cooper netties" → "Kubernetes")
- Soundex and Metaphone algorithms
- Multi-word phrase matching
- Compound word splitting

### ✅ Term Extraction
- Proper noun identification
- Acronym detection (API, HTTP, OAuth2)
- Technical term detection (camelCase, snake_case)
- Multi-word phrases ("New York City")
- Categorization (person, organization, technical, etc.)

### ✅ Document Parsing
- Text extraction from TXT, MD files
- PDF, DOCX, PPTX support (with error handling)
- UTF-8 and unicode support
- Large document performance

### ✅ Correction Pipeline
- Low-confidence word identification
- Confidence threshold handling
- Error recovery and edge cases

### ✅ End-to-End Integration
- Complete RAG workflow
- Real-world transcription scenarios
- Performance validation

## Test Results

After running tests, you'll see output like:

```
PASS  app/lib/__tests__/phoneticMatcher.test.ts
PASS  app/lib/__tests__/termExtractor.test.ts
PASS  app/lib/__tests__/documentParser.test.ts
PASS  app/lib/__tests__/corrector.test.ts
PASS  __tests__/rag-integration.test.ts

Test Suites: 5 passed, 5 total
Tests:       120 passed, 120 total
Snapshots:   0 total
Time:        15.234 s
```

## Coverage Report

```bash
npm run test:coverage
```

Generates:
- Terminal summary
- HTML report in `coverage/lcov-report/index.html`

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   89.5  |   83.2   |   92.7  |   89.5  |
-------------------|---------|----------|---------|---------|
```

## Common Test Scenarios

### Test Phonetic Matching
```bash
npm test -- phoneticMatcher.test
```

**Example test:** Verifies "cooper netties" matches "Kubernetes"

### Test Term Extraction
```bash
npm test -- termExtractor.test
```

**Example test:** Extracts "OAuth2", "API", "Kubernetes" from technical text

### Test Document Parsing
```bash
npm test -- documentParser.test
```

**Example test:** Parses text file and extracts 50+ terms

### Test Complete Workflow
```bash
npm run test:integration
```

**Example test:** Upload doc → Extract terms → Find corrections

## Debugging Failed Tests

```bash
# Run specific test file
npm test phoneticMatcher.test

# Run specific test by name
npm test -- --testNamePattern="should match phonetically"

# Run with verbose output
npm test -- --verbose

# Run without coverage (faster)
npm test -- --coverage=false
```

## Verify Your Implementation

Use these tests to verify RAG is working correctly:

### 1. Check Document Parsing
```bash
npm test documentParser.test
```
✅ Should parse TXT files
✅ Should extract terms
✅ Should handle errors

### 2. Check Term Extraction
```bash
npm test termExtractor.test
```
✅ Should find proper nouns
✅ Should detect acronyms
✅ Should identify technical terms

### 3. Check Phonetic Matching
```bash
npm test phoneticMatcher.test
```
✅ Should generate phonetic codes
✅ Should match sound-alike words
✅ Should handle real transcription errors

### 4. Check Correction Logic
```bash
npm test corrector.test
```
✅ Should identify low-confidence words
✅ Should respect thresholds
✅ Should handle edge cases

### 5. Check End-to-End
```bash
npm run test:integration
```
✅ Should complete full RAG workflow
✅ Should handle large documents
✅ Should perform well

## Expected Test Performance

- **Unit tests:** ~5-10 seconds
- **Integration tests:** ~5-10 seconds
- **All tests:** ~15-20 seconds
- **With coverage:** ~20-30 seconds

## Troubleshooting

### Tests won't run
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Tests are slow
```bash
# Reduce parallel workers
npm test -- --maxWorkers=2
```

### Need to see more output
```bash
# Verbose mode
npm test -- --verbose

# With all console logs
npm test -- --silent=false
```

## Next Steps

1. **Run all tests:** `npm test`
2. **Check coverage:** `npm run test:coverage`
3. **Read full docs:** See `TESTING.md`

All tests passing? Your RAG implementation is working correctly! 🎉
