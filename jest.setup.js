// Add custom jest matchers
require('@testing-library/jest-dom')

// Mock environment variables for testing
process.env.RAG_ENABLED = 'true'
process.env.RAG_CONFIDENCE_THRESHOLD = '0.7'
process.env.JINA_API_KEY = 'test-jina-key'
process.env.UPSTASH_VECTOR_REST_URL = 'https://test-vector-url'
process.env.UPSTASH_VECTOR_REST_TOKEN = 'test-vector-token'
process.env.GROQ_API_KEY = 'test-groq-key'

// Suppress console logs during tests (comment out if you need to debug)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
}
