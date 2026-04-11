/**
 * In-process cache of extracted terms per RAG session.
 *
 * Why this exists:
 * Upstash Vector has eventual consistency on filtered queries. After a
 * successful upload, `filter: sessionId = 'xxx'` may return 0 results for
 * several hundred milliseconds to seconds, even though the vectors were
 * written successfully. This broke the upload → speak flow: the correction
 * endpoint's `hasSessionContent` check would 404, and `getSessionTerms`
 * would return an empty list, so the phonetic sweep had no terms to match
 * against and no correction was ever applied.
 *
 * The upload route already has the full ExtractedTerm[] in memory. Caching
 * it here lets downstream code work immediately without waiting for Upstash
 * filter consistency to catch up.
 *
 * Scope: in-process only. On Vercel serverless each cold start gets an empty
 * cache, but that's fine because (a) users typically upload and speak in the
 * same warm instance, and (b) after enough time has passed, Upstash filters
 * catch up and the cache is no longer needed. For multi-instance prod you'd
 * want Redis/KV, but that's out of scope.
 */

import { ExtractedTerm } from "../types/rag";

interface CachedSession {
  terms: ExtractedTerm[];
  createdAt: number;
}

// Sessions older than this are evicted on read.
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const sessionCache = new Map<string, CachedSession>();

/**
 * Store the full extracted term list for a session. Overwrites any prior
 * entry for the same sessionId.
 */
export function setCachedSessionTerms(
  sessionId: string,
  terms: ExtractedTerm[]
): void {
  sessionCache.set(sessionId, {
    terms,
    createdAt: Date.now(),
  });
  console.log(
    `💾 sessionTermCache: stored ${terms.length} terms for ${sessionId}`
  );
}

/**
 * Retrieve the cached term list. Returns null if missing or expired.
 */
export function getCachedSessionTerms(
  sessionId: string
): ExtractedTerm[] | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    sessionCache.delete(sessionId);
    return null;
  }

  return entry.terms;
}

/**
 * Remove a session from the cache (e.g. on explicit delete).
 */
export function clearCachedSession(sessionId: string): void {
  sessionCache.delete(sessionId);
}

/**
 * True if the cache has non-empty terms for this session.
 */
export function hasCachedSession(sessionId: string): boolean {
  const terms = getCachedSessionTerms(sessionId);
  return terms !== null && terms.length > 0;
}
