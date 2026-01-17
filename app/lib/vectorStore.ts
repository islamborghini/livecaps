/**
 * Vector Store Service
 *
 * Interfaces with Upstash Vector for storing and retrieving term embeddings.
 * Features:
 * - Per-session content isolation using metadata
 * - Hybrid search combining semantic similarity with phonetic re-ranking
 * - Efficient batch operations for indexing
 * - Session cleanup and statistics
 */

import { Index } from "@upstash/vector";
import { ExtractedTerm, TermVectorRecord, VectorSearchResult, RAGSessionStats } from "../types/rag";
import { embedText, embedBatch, cosineSimilarity } from "./embeddingsService";
import { findPhoneticallySimilarTerms, calculatePhoneticSimilarity, PhoneticMatch } from "./phoneticMatcher";

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
  /** Upstash Vector REST URL */
  url: string;
  /** Upstash Vector REST Token */
  token: string;
  /** Namespace prefix for session isolation */
  namespacePrefix: string;
  /** Default number of results to return */
  defaultTopK: number;
  /** Weight for semantic similarity (0-1) */
  semanticWeight: number;
  /** Weight for phonetic similarity (0-1) */
  phoneticWeight: number;
  /** Minimum similarity threshold */
  minSimilarity: number;
  /** Batch size for indexing */
  indexBatchSize: number;
}

/**
 * Default vector store configuration
 */
export const DEFAULT_VECTOR_STORE_CONFIG: VectorStoreConfig = {
  url: process.env.UPSTASH_VECTOR_REST_URL || "",
  token: process.env.UPSTASH_VECTOR_REST_TOKEN || "",
  namespacePrefix: "livecaps_rag_",
  defaultTopK: 10,
  semanticWeight: 0.6,
  phoneticWeight: 0.4,
  minSimilarity: 0.5,
  indexBatchSize: 50,
};

/**
 * Cached Upstash Vector index instance
 */
let vectorIndex: Index | null = null;

/**
 * Get or create the vector index instance
 */
function getVectorIndex(config: Partial<VectorStoreConfig> = {}): Index {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };

  if (!vectorIndex) {
    if (!cfg.url || !cfg.token) {
      throw new Error("Upstash Vector credentials not configured. Set UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN");
    }

    vectorIndex = new Index({
      url: cfg.url,
      token: cfg.token,
    });
  }

  return vectorIndex;
}

/**
 * Generate a unique vector ID for a term
 */
function generateVectorId(sessionId: string, term: ExtractedTerm): string {
  // Create a deterministic ID based on session and term
  const normalizedTerm = term.normalizedTerm.replace(/[^a-z0-9]/g, "_");
  return `${sessionId}_${normalizedTerm}_${term.sourceFile.replace(/[^a-z0-9]/gi, "_")}`;
}

/**
 * Convert ExtractedTerm to vector record metadata
 */
function termToMetadata(sessionId: string, term: ExtractedTerm): Record<string, string | number | boolean> {
  return {
    sessionId,
    term: term.term,
    normalizedTerm: term.normalizedTerm,
    context: term.context.substring(0, 1000), // Limit context size
    sourceFile: term.sourceFile,
    phoneticCode: term.phoneticCode,
    frequency: term.frequency,
    isProperNoun: term.isProperNoun,
    category: term.category || "general",
    indexedAt: Date.now(),
  };
}

/**
 * Convert vector search result back to ExtractedTerm
 */
function metadataToTerm(metadata: Record<string, unknown>): ExtractedTerm {
  return {
    term: String(metadata.term || ""),
    normalizedTerm: String(metadata.normalizedTerm || ""),
    context: String(metadata.context || ""),
    sourceFile: String(metadata.sourceFile || ""),
    phoneticCode: String(metadata.phoneticCode || ""),
    frequency: Number(metadata.frequency || 1),
    isProperNoun: Boolean(metadata.isProperNoun),
    category: String(metadata.category || "general"),
  };
}

/**
 * Index all terms from a session's uploaded content
 */
export async function indexSessionContent(
  sessionId: string,
  terms: ExtractedTerm[],
  config: Partial<VectorStoreConfig> = {}
): Promise<{ indexed: number; failed: number; duration: number }> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };
  const startTime = Date.now();

  if (terms.length === 0) {
    return { indexed: 0, failed: 0, duration: 0 };
  }

  const index = getVectorIndex(cfg);
  let indexed = 0;
  let failed = 0;

  console.log(`📥 Indexing ${terms.length} terms for session ${sessionId}...`);

  // Process in batches
  for (let i = 0; i < terms.length; i += cfg.indexBatchSize) {
    const batch = terms.slice(i, i + cfg.indexBatchSize);
    const batchTexts = batch.map(t => `${t.term}: ${t.context.substring(0, 200)}`);

    try {
      // Generate embeddings for the batch
      const embeddings = await embedBatch(batchTexts, {
        apiKey: process.env.JINA_API_KEY,
      });

      // Prepare upsert data
      const vectors: Array<{
        id: string;
        vector: number[];
        metadata: Record<string, string | number | boolean>;
      }> = [];

      for (let j = 0; j < batch.length; j++) {
        const term = batch[j];
        const embedding = embeddings[j];

        if (embedding && embedding.vector.length > 0) {
          vectors.push({
            id: generateVectorId(sessionId, term),
            vector: embedding.vector,
            metadata: termToMetadata(sessionId, term),
          });
        }
      }

      // Upsert to Upstash Vector
      if (vectors.length > 0) {
        await index.upsert(vectors);
        indexed += vectors.length;
        console.log(`  ✅ Indexed batch ${Math.floor(i / cfg.indexBatchSize) + 1}: ${vectors.length} terms`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to index batch ${Math.floor(i / cfg.indexBatchSize) + 1}:`, error);
      failed += batch.length;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`📊 Indexing complete: ${indexed} indexed, ${failed} failed, ${duration}ms`);

  return { indexed, failed, duration };
}

/**
 * Search for similar terms within a specific session
 * Uses hybrid search: semantic similarity + phonetic re-ranking
 */
export async function searchSessionTerms(
  sessionId: string,
  query: string,
  topK: number = 10,
  config: Partial<VectorStoreConfig> = {}
): Promise<VectorSearchResult[]> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };
  const index = getVectorIndex(cfg);

  console.log(`🔍 Searching for "${query}" in session ${sessionId}...`);

  try {
    // Generate embedding for the query
    const queryEmbedding = await embedText(query, {
      apiKey: process.env.JINA_API_KEY,
    });

    // Search with filter for session ID
    const searchResults = await index.query({
      vector: queryEmbedding.vector,
      topK: topK * 2, // Get more results for re-ranking
      includeMetadata: true,
      includeVectors: false,
      filter: `sessionId = '${sessionId}'`,
    });

    if (!searchResults || searchResults.length === 0) {
      console.log("  No results found");
      return [];
    }

    // Convert to VectorSearchResult with extracted terms
    const results: VectorSearchResult[] = [];

    for (const result of searchResults) {
      if (!result.metadata) continue;

      const term = metadataToTerm(result.metadata);
      const semanticScore = result.score || 0;

      // Calculate phonetic similarity for re-ranking
      const phoneticResult = calculatePhoneticSimilarity(query, term.term);
      const phoneticScore = phoneticResult.similarity;

      // Combine scores with weights
      const combinedScore =
        (semanticScore * cfg.semanticWeight) +
        (phoneticScore * cfg.phoneticWeight);

      if (combinedScore >= cfg.minSimilarity) {
        results.push({
          term,
          semanticScore,
          phoneticScore,
          combinedScore,
          matchType: phoneticScore > semanticScore ? "phonetic" : "semantic",
        });
      }
    }

    // Sort by combined score and limit results
    results.sort((a, b) => b.combinedScore - a.combinedScore);
    const finalResults = results.slice(0, topK);

    console.log(`  Found ${finalResults.length} results (best: ${finalResults[0]?.term.term || "none"})`);

    return finalResults;
  } catch (error) {
    console.error("  Search error:", error);
    return [];
  }
}

/**
 * Search using only phonetic matching (no vector search)
 * Useful when the query is likely a sound-alike error
 */
export async function searchByPhonetics(
  sessionId: string,
  query: string,
  allTerms: ExtractedTerm[],
  topK: number = 10,
  config: Partial<VectorStoreConfig> = {}
): Promise<VectorSearchResult[]> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };

  console.log(`🔊 Phonetic search for "${query}" in session ${sessionId}...`);

  // Filter terms for this session (if they have sessionId in metadata)
  // For now, use all provided terms
  const phoneticMatches = findPhoneticallySimilarTerms(query, allTerms, {
    minSimilarity: cfg.minSimilarity,
    maxResults: topK,
  });

  const results: VectorSearchResult[] = phoneticMatches.map(match => ({
    term: match.term,
    semanticScore: 0,
    phoneticScore: match.similarity,
    combinedScore: match.similarity,
    matchType: "phonetic" as const,
  }));

  console.log(`  Found ${results.length} phonetic matches`);

  return results;
}

/**
 * Hybrid search: combines vector search with phonetic matching
 * Best of both worlds for catching transcription errors
 */
export async function hybridSearch(
  sessionId: string,
  query: string,
  cachedTerms: ExtractedTerm[],
  topK: number = 10,
  config: Partial<VectorStoreConfig> = {}
): Promise<VectorSearchResult[]> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };

  console.log(`🔎 Hybrid search for "${query}" in session ${sessionId}...`);

  // Run both searches in parallel
  const [semanticResults, phoneticMatches] = await Promise.all([
    searchSessionTerms(sessionId, query, topK, cfg),
    Promise.resolve(findPhoneticallySimilarTerms(query, cachedTerms, {
      minSimilarity: 0.3,
      maxResults: topK,
    })),
  ]);

  // Merge results, preferring higher scores
  const resultMap = new Map<string, VectorSearchResult>();

  // Add semantic results
  for (const result of semanticResults) {
    resultMap.set(result.term.normalizedTerm, result);
  }

  // Merge phonetic results
  for (const match of phoneticMatches) {
    const existing = resultMap.get(match.term.normalizedTerm);

    if (existing) {
      // Update if phonetic score is better
      if (match.similarity > existing.phoneticScore) {
        existing.phoneticScore = match.similarity;
        existing.combinedScore =
          (existing.semanticScore * cfg.semanticWeight) +
          (match.similarity * cfg.phoneticWeight);
        if (match.similarity > existing.semanticScore) {
          existing.matchType = "phonetic";
        }
      }
    } else {
      // Add new result from phonetic match
      resultMap.set(match.term.normalizedTerm, {
        term: match.term,
        semanticScore: 0,
        phoneticScore: match.similarity,
        combinedScore: match.similarity * cfg.phoneticWeight,
        matchType: "phonetic",
      });
    }
  }

  // Convert to array and sort
  const results = Array.from(resultMap.values())
    .filter(r => r.combinedScore >= cfg.minSimilarity)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);

  console.log(`  Hybrid results: ${results.length} (semantic: ${semanticResults.length}, phonetic: ${phoneticMatches.length})`);

  return results;
}

/**
 * Clear all indexed content for a session
 * Note: Uses range query which is more efficient for cleanup
 */
export async function clearSession(
  sessionId: string,
  config: Partial<VectorStoreConfig> = {}
): Promise<{ deleted: number }> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };
  const index = getVectorIndex(cfg);

  console.log(`🗑️ Clearing session ${sessionId}...`);

  try {
    // Use deleteMany with filter for efficient deletion
    // This is more efficient than querying first
    await index.delete({
      filter: `sessionId = '${sessionId}'`,
    });

    console.log(`  Deleted vectors for session ${sessionId}`);
    return { deleted: -1 }; // We don't know exact count with filter delete
  } catch (error) {
    // Fallback: try to query and delete by IDs with a smaller limit
    try {
      const searchResults = await index.query({
        vector: new Array(768).fill(0),
        topK: 100, // Smaller limit to stay within bounds
        includeMetadata: true,
        includeVectors: false,
        filter: `sessionId = '${sessionId}'`,
      });

      if (!searchResults || searchResults.length === 0) {
        console.log("  No vectors to delete");
        return { deleted: 0 };
      }

      const idsToDelete = searchResults.map(r => r.id).filter((id): id is string => !!id);

      if (idsToDelete.length > 0) {
        await index.delete(idsToDelete);
      }

      console.log(`  Deleted ${idsToDelete.length} vectors`);
      return { deleted: idsToDelete.length };
    } catch (fallbackError) {
      console.error("  Clear session error:", fallbackError);
      return { deleted: 0 };
    }
  }
}

/**
 * Get statistics for a session's indexed content
 * Uses a smaller sample query to avoid read limits
 */
export async function getSessionStats(
  sessionId: string,
  config: Partial<VectorStoreConfig> = {}
): Promise<RAGSessionStats> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };
  const index = getVectorIndex(cfg);

  console.log(`📊 Getting stats for session ${sessionId}...`);

  try {
    // Query with a reasonable limit to avoid exceeding read limits
    const searchResults = await index.query({
      vector: new Array(768).fill(0),
      topK: 100, // Reasonable sample size
      includeMetadata: true,
      includeVectors: false,
      filter: `sessionId = '${sessionId}'`,
    });

    if (!searchResults || searchResults.length === 0) {
      return {
        sessionId,
        totalTerms: 0,
        documentCount: 0,
        lastUpdated: null,
        categoryBreakdown: {},
      };
    }

    // Calculate stats from results
    const sourceFiles = new Set<string>();
    const categories: Record<string, number> = {};
    let lastUpdated = 0;

    for (const result of searchResults) {
      if (!result.metadata) continue;

      // Count source files
      const sourceFile = result.metadata.sourceFile as string;
      if (sourceFile) sourceFiles.add(sourceFile);

      // Count categories
      const category = (result.metadata.category as string) || "general";
      categories[category] = (categories[category] || 0) + 1;

      // Track last update
      const indexedAt = result.metadata.indexedAt as number;
      if (indexedAt && indexedAt > lastUpdated) {
        lastUpdated = indexedAt;
      }
    }

    const stats: RAGSessionStats = {
      sessionId,
      totalTerms: searchResults.length, // This is a sample, may be more
      documentCount: sourceFiles.size,
      lastUpdated: lastUpdated ? new Date(lastUpdated) : null,
      categoryBreakdown: categories,
    };

    console.log(`  Terms (sampled): ${stats.totalTerms}, Documents: ${stats.documentCount}`);

    return stats;
  } catch (error) {
    console.error("  Get stats error:", error);
    return {
      sessionId,
      totalTerms: 0,
      documentCount: 0,
      lastUpdated: null,
      categoryBreakdown: {},
    };
  }
}

/**
 * Check if a session has any indexed content
 */
export async function hasSessionContent(
  sessionId: string,
  config: Partial<VectorStoreConfig> = {}
): Promise<boolean> {
  const stats = await getSessionStats(sessionId, config);
  return stats.totalTerms > 0;
}

/**
 * Get the vector store info (for debugging)
 */
export async function getVectorStoreInfo(
  config: Partial<VectorStoreConfig> = {}
): Promise<{ dimension: number; totalVectors: number }> {
  const cfg = { ...DEFAULT_VECTOR_STORE_CONFIG, ...config };
  const index = getVectorIndex(cfg);

  try {
    const info = await index.info();
    return {
      dimension: info.dimension || 768,
      totalVectors: info.vectorCount || 0,
    };
  } catch (error) {
    console.error("Get info error:", error);
    return { dimension: 768, totalVectors: 0 };
  }
}

/**
 * Reset the vector index instance (useful for testing)
 */
export function resetVectorIndex(): void {
  vectorIndex = null;
}
