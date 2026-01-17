/**
 * Embeddings Service
 *
 * Converts text to vectors using Jina AI's embedding API.
 * Features:
 * - Single text embedding for queries
 * - Batch embedding for processing many terms
 * - Fallback to hash-based embedding if API fails
 * - Rate limiting to stay within free tier
 * - Error recovery with retries
 * - In-memory caching to avoid re-embedding
 */

import { LRUCache } from "lru-cache";

/**
 * Embedding result from Jina API
 */
export interface EmbeddingResult {
  text: string;
  vector: number[];
  model: string;
  cached: boolean;
}

/**
 * Configuration for the embeddings service
 */
export interface EmbeddingsConfig {
  /** Jina API key */
  apiKey: string;
  /** Model to use (default: jina-embeddings-v3) */
  model: string;
  /** Maximum batch size for embedding requests */
  maxBatchSize: number;
  /** Delay between requests in ms (rate limiting) */
  requestDelayMs: number;
  /** Maximum retries on failure */
  maxRetries: number;
  /** Retry delay in ms */
  retryDelayMs: number;
  /** Whether to use fallback on API failure */
  useFallback: boolean;
  /** Cache max size */
  cacheMaxSize: number;
  /** Cache TTL in ms */
  cacheTtlMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_EMBEDDINGS_CONFIG: EmbeddingsConfig = {
  apiKey: process.env.JINA_API_KEY || "",
  model: "jina-embeddings-v3",
  maxBatchSize: 100, // Jina allows up to 2048, but we'll be conservative
  requestDelayMs: 100, // 100ms between requests
  maxRetries: 3,
  retryDelayMs: 1000,
  useFallback: true,
  cacheMaxSize: 10000,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Jina API response structure
 */
interface JinaEmbeddingResponse {
  model: string;
  object: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
}

/**
 * In-memory LRU cache for embeddings
 */
let embeddingCache: LRUCache<string, number[]> | null = null;

/**
 * Get or create the embedding cache
 */
function getCache(config: EmbeddingsConfig): LRUCache<string, number[]> {
  if (!embeddingCache) {
    embeddingCache = new LRUCache<string, number[]>({
      max: config.cacheMaxSize,
      ttl: config.cacheTtlMs,
    });
  }
  return embeddingCache;
}

/**
 * Generate a cache key for text
 */
function getCacheKey(text: string, model: string): string {
  return `${model}:${text.toLowerCase().trim()}`;
}

/**
 * Sleep utility for rate limiting and retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a simple hash-based fallback embedding
 * This creates a deterministic 768-dimensional vector from text
 * NOT suitable for semantic similarity, but works as a fallback
 */
export function generateFallbackEmbedding(text: string): number[] {
  const normalizedText = text.toLowerCase().trim();
  const dimension = 768; // Match Jina's output dimension
  const vector: number[] = new Array(dimension).fill(0);

  // Use a simple hash-based approach
  // This is deterministic but NOT semantically meaningful
  for (let i = 0; i < normalizedText.length; i++) {
    const charCode = normalizedText.charCodeAt(i);
    const position = i % dimension;

    // Mix the character code into multiple positions
    vector[position] += charCode * 0.01;
    vector[(position + 1) % dimension] += charCode * 0.005;
    vector[(position + 2) % dimension] += charCode * 0.0025;

    // Add some variation based on position
    vector[(charCode * 7) % dimension] += 0.01;
    vector[(charCode * 13) % dimension] += 0.005;
  }

  // Normalize the vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      vector[i] = vector[i] / magnitude;
    }
  } else {
    // If all zeros, create a small random vector
    for (let i = 0; i < dimension; i++) {
      vector[i] = (Math.random() - 0.5) * 0.01;
    }
  }

  return vector;
}

/**
 * Embed a single text using Jina AI API
 */
export async function embedText(
  text: string,
  config: Partial<EmbeddingsConfig> = {}
): Promise<EmbeddingResult> {
  const cfg = { ...DEFAULT_EMBEDDINGS_CONFIG, ...config };
  const cache = getCache(cfg);
  const cacheKey = getCacheKey(text, cfg.model);

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`📦 Cache hit for embedding: "${text.substring(0, 30)}..."`);
    return {
      text,
      vector: cached,
      model: cfg.model,
      cached: true,
    };
  }

  // Try API call with retries
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
    try {
      if (!cfg.apiKey) {
        throw new Error("Jina API key not configured");
      }

      const response = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          task: "retrieval.passage",
          dimensions: 768,
          late_chunking: false,
          embedding_type: "float",
          input: [text],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jina API error ${response.status}: ${errorText}`);
      }

      const data: JinaEmbeddingResponse = await response.json();

      if (!data.data || data.data.length === 0 || !data.data[0].embedding) {
        throw new Error("Invalid response from Jina API: no embeddings returned");
      }

      const vector = data.data[0].embedding;

      // Cache the result
      cache.set(cacheKey, vector);

      console.log(`✅ Embedded text: "${text.substring(0, 30)}..." (${vector.length} dims)`);

      return {
        text,
        vector,
        model: data.model,
        cached: false,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️ Embedding attempt ${attempt + 1}/${cfg.maxRetries} failed:`, lastError.message);

      if (attempt < cfg.maxRetries - 1) {
        await sleep(cfg.retryDelayMs * (attempt + 1)); // Exponential backoff
      }
    }
  }

  // All retries failed - use fallback if enabled
  if (cfg.useFallback) {
    console.warn(`⚠️ Using fallback embedding for: "${text.substring(0, 30)}..."`);
    const fallbackVector = generateFallbackEmbedding(text);

    // Cache the fallback too
    cache.set(cacheKey, fallbackVector);

    return {
      text,
      vector: fallbackVector,
      model: "fallback-hash",
      cached: false,
    };
  }

  throw lastError || new Error("Failed to generate embedding");
}

/**
 * Embed multiple texts in batch using Jina AI API
 * More efficient than calling embedText multiple times
 */
export async function embedBatch(
  texts: string[],
  config: Partial<EmbeddingsConfig> = {}
): Promise<EmbeddingResult[]> {
  const cfg = { ...DEFAULT_EMBEDDINGS_CONFIG, ...config };
  const cache = getCache(cfg);
  const results: EmbeddingResult[] = [];

  // Separate cached and uncached texts
  const uncachedTexts: { text: string; index: number }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const cacheKey = getCacheKey(text, cfg.model);
    const cached = cache.get(cacheKey);

    if (cached) {
      results[i] = {
        text,
        vector: cached,
        model: cfg.model,
        cached: true,
      };
    } else {
      uncachedTexts.push({ text, index: i });
    }
  }

  console.log(`📦 Batch embedding: ${texts.length} total, ${texts.length - uncachedTexts.length} cached, ${uncachedTexts.length} to embed`);

  if (uncachedTexts.length === 0) {
    return results;
  }

  // Process uncached texts in batches
  for (let batchStart = 0; batchStart < uncachedTexts.length; batchStart += cfg.maxBatchSize) {
    const batch = uncachedTexts.slice(batchStart, batchStart + cfg.maxBatchSize);
    const batchTexts = batch.map(item => item.text);

    // Rate limiting delay between batches
    if (batchStart > 0) {
      await sleep(cfg.requestDelayMs);
    }

    let lastError: Error | null = null;
    let success = false;

    for (let attempt = 0; attempt < cfg.maxRetries && !success; attempt++) {
      try {
        if (!cfg.apiKey) {
          throw new Error("Jina API key not configured");
        }

        const response = await fetch("https://api.jina.ai/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            task: "retrieval.passage",
            dimensions: 768,
            late_chunking: false,
            embedding_type: "float",
            input: batchTexts,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Jina API error ${response.status}: ${errorText}`);
        }

        const data: JinaEmbeddingResponse = await response.json();

        if (!data.data || data.data.length !== batchTexts.length) {
          throw new Error(`Invalid response: expected ${batchTexts.length} embeddings, got ${data.data?.length || 0}`);
        }

        // Process results
        for (let j = 0; j < data.data.length; j++) {
          const embedding = data.data[j];
          const originalItem = batch[j];
          const vector = embedding.embedding;

          // Cache the result
          cache.set(getCacheKey(originalItem.text, cfg.model), vector);

          results[originalItem.index] = {
            text: originalItem.text,
            vector,
            model: data.model,
            cached: false,
          };
        }

        console.log(`✅ Batch ${Math.floor(batchStart / cfg.maxBatchSize) + 1}: embedded ${batch.length} texts`);
        success = true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️ Batch attempt ${attempt + 1}/${cfg.maxRetries} failed:`, lastError.message);

        if (attempt < cfg.maxRetries - 1) {
          await sleep(cfg.retryDelayMs * (attempt + 1));
        }
      }
    }

    // If batch failed, use fallback for remaining items in this batch
    if (!success && cfg.useFallback) {
      console.warn(`⚠️ Using fallback embeddings for batch of ${batch.length} texts`);

      for (const item of batch) {
        if (!results[item.index]) {
          const fallbackVector = generateFallbackEmbedding(item.text);
          cache.set(getCacheKey(item.text, cfg.model), fallbackVector);

          results[item.index] = {
            text: item.text,
            vector: fallbackVector,
            model: "fallback-hash",
            cached: false,
          };
        }
      }
    } else if (!success) {
      throw lastError || new Error("Failed to generate batch embeddings");
    }
  }

  return results;
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; maxSize: number } {
  if (!embeddingCache) {
    return { size: 0, maxSize: DEFAULT_EMBEDDINGS_CONFIG.cacheMaxSize };
  }

  return {
    size: embeddingCache.size,
    maxSize: DEFAULT_EMBEDDINGS_CONFIG.cacheMaxSize,
  };
}

/**
 * Clear the embedding cache
 */
export function clearCache(): void {
  if (embeddingCache) {
    embeddingCache.clear();
    console.log("🗑️ Embedding cache cleared");
  }
}

/**
 * Validate that an embedding result is valid
 */
export function isValidEmbedding(result: EmbeddingResult): boolean {
  return (
    result &&
    Array.isArray(result.vector) &&
    result.vector.length === 768 &&
    result.vector.every(v => typeof v === "number" && !isNaN(v))
  );
}
