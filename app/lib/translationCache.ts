/**
 * Server-side Translation Cache
 * Handles caching of translations on the backend for better persistence and performance
 */

interface CacheEntry {
  translatedText: string;
  timestamp: number;
  provider: string;
  hitCount: number;
}

/**
 * Server-side Translation Cache Implementation
 * Singleton pattern to ensure single cache instance across requests
 */
class ServerTranslationCache {
  private static instance: ServerTranslationCache;
  private cache = new Map<string, CacheEntry>();
  private readonly maxCacheSize = 2000; // Larger cache for server
  private readonly cacheExpirationMs = 24 * 60 * 60 * 1000; // 24 hours
  
  private constructor() {
    // Private constructor for singleton pattern
    this.startCleanupInterval();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): ServerTranslationCache {
    if (!ServerTranslationCache.instance) {
      ServerTranslationCache.instance = new ServerTranslationCache();
    }
    return ServerTranslationCache.instance;
  }
  
  /**
   * Generate cache key from text and target language
   */
  private getCacheKey(text: string, targetLanguage: string): string {
    // Normalize text: trim, lowercase, remove extra spaces
    const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${normalizedText}|${targetLanguage}`;
  }
  
  /**
   * Check if cache entry is still valid
   */
  private isEntryValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheExpirationMs;
  }
  
  /**
   * Clean expired entries and enforce size limit
   */
  private cleanCache(): void {
    const now = Date.now();
    
    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isEntryValid(entry)) {
        this.cache.delete(key);
      }
    }
    
    // If still over limit, remove least recently used entries
    if (this.cache.size > this.maxCacheSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    // Clean cache every hour
    setInterval(() => {
      this.cleanCache();
      console.log(`[Cache] Periodic cleanup completed. Size: ${this.cache.size}`);
    }, 60 * 60 * 1000);
  }
  
  /**
   * Get cached translation if available
   */
  get(text: string, targetLanguage: string): string | null {
    const key = this.getCacheKey(text, targetLanguage);
    const entry = this.cache.get(key);
    
    if (!entry || !this.isEntryValid(entry)) {
      if (entry) {
        this.cache.delete(key);
      }
      return null;
    }
    
    // Update hit count and timestamp for LRU
    entry.hitCount++;
    entry.timestamp = Date.now();
    
    return entry.translatedText;
  }
  
  /**
   * Store translation in cache
   */
  set(text: string, targetLanguage: string, translatedText: string, provider: string): void {
    this.cleanCache();
    
    const key = this.getCacheKey(text, targetLanguage);
    this.cache.set(key, {
      translatedText,
      timestamp: Date.now(),
      provider,
      hitCount: 1
    });
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number; totalHits: number } {
    const totalHits = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.hitCount, 0);
    
    return {
      size: this.cache.size,
      hitRate: totalHits > 0 ? (totalHits - this.cache.size) / totalHits : 0,
      totalHits
    };
  }
  
  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    console.log('[Cache] Cache cleared manually');
  }
  
  /**
   * Get detailed cache information for debugging
   */
  getDetailedStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
    topTranslations: Array<{ text: string; language: string; hits: number; provider: string }>;
  } {
    const stats = this.getStats();
    
    // Get top 10 most accessed translations
    const topTranslations = Array.from(this.cache.entries())
      .sort((a, b) => b[1].hitCount - a[1].hitCount)
      .slice(0, 10)
      .map(([key, entry]) => {
        const [text, language] = key.split('|');
        return {
          text: text.length > 50 ? text.substring(0, 47) + '...' : text,
          language,
          hits: entry.hitCount,
          provider: entry.provider
        };
      });
    
    return {
      ...stats,
      topTranslations
    };
  }
}

// Export singleton instance
export const serverTranslationCache = ServerTranslationCache.getInstance();

/**
 * Common phrases for different languages
 * These will be pre-cached on server startup
 */
export const commonPhrases = {
  en: [
    "Hello", "Hi", "Good morning", "Good afternoon", "Good evening",
    "Thank you", "Thanks", "You're welcome", "Please", "Excuse me",
    "I'm sorry", "How are you?", "What's your name?", "Nice to meet you",
    "See you later", "Goodbye", "Yes", "No", "Maybe", "I don't know",
    "Can you help me?", "Where is?", "How much?", "What time is it?",
    "I understand", "I don't understand", "Could you repeat that?",
    "Let me think", "That's right", "That's wrong", "I agree", "I disagree",
    "One moment please", "Can I help you?", "What would you like?",
    "How was your day?", "See you tomorrow", "Have a good day"
  ]
};
