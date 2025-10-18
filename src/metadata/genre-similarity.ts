/**
 * Genre Similarity Service
 * Uses EveryNoise (5,453 genres) and Voltraco (736 genres) datasets
 * Caches results in database and in-memory to avoid repeated lookups
 *
 * Data Sources (in priority order):
 * 1. In-memory cache (fast, session-scoped)
 * 2. Database cache (persistent, 90-day TTL)
 * 3. EveryNoise dataset (coordinate-based distance, threshold 1220)
 * 4. Voltraco dataset (hierarchical category-based)
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { genreSimilarity } from '../db/schema.js';
import { logger } from '../logger.js';
import { getEveryNoiseDataSource, getVoltracoDataSource } from './genre-data-sources.js';

// 90-day cache TTL (genre taxonomy changes slowly)
const SIMILARITY_CACHE_TTL_DAYS = 90;

// EveryNoise distance threshold (calibrated from test pairs)
const EVERYNOISE_SIMILARITY_THRESHOLD = 1220;

/**
 * Genre Similarity Service
 * Hybrid approach using EveryNoise (primary) and Voltraco (fallback)
 */
export class GenreSimilarityService {
  // In-memory cache for current session (cleared between runs)
  private memoryCache: Map<string, boolean> = new Map();
  /**
   * Check if two genres are similar
   * Uses EveryNoise (primary) and Voltraco (fallback) with multi-level caching
   * Symmetrical: if genre1 is similar to genre2, then genre2 is similar to genre1
   *
   * @param genre1 - First genre (case-insensitive)
   * @param genre2 - Second genre (case-insensitive)
   * @returns True if genres are considered similar
   */
  async areGenresSimilar(genre1: string, genre2: string): Promise<boolean> {
    if (!genre1 || !genre2) {
      return false;
    }

    // Normalize to lowercase
    const g1 = genre1.toLowerCase().trim();
    const g2 = genre2.toLowerCase().trim();

    // Exact match = not similar (they're the same genre!)
    if (g1 === g2) {
      return false;
    }

    // Check in-memory cache first (fastest)
    const memKey = this.getMemoryCacheKey(g1, g2);
    if (this.memoryCache.has(memKey)) {
      return this.memoryCache.get(memKey)!;
    }

    // Check database cache (try both orderings)
    const cached = await this.getCachedSimilarity(g1, g2);
    if (cached !== null) {
      this.memoryCache.set(memKey, cached);
      logger.debug({ genre1: g1, genre2: g2, isSimilar: cached }, 'genre similarity cache hit');
      return cached;
    }

    // Compute similarity from data sources
    const isSimilar = await this.computeSimilarity(g1, g2);

    // Cache the result (both directions)
    this.memoryCache.set(memKey, isSimilar);
    await this.cacheSimilarity(g1, g2, isSimilar);
    await this.cacheSimilarity(g2, g1, isSimilar);

    return isSimilar;
  }

  /**
   * Clear in-memory cache
   * Called between playlist generations to free memory
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Get memory cache statistics
   */
  getMemoryCacheStats(): { size: number } {
    return { size: this.memoryCache.size };
  }

  /**
   * Get all genres similar to the given genre
   * Returns a Set of similar genre names (lowercase)
   */
  async getSimilarGenres(genre: string): Promise<Set<string>> {
    if (!genre) {
      return new Set();
    }

    const normalized = genre.toLowerCase().trim();

    // First check cache for any known similar genres
    const db = getDb();
    const cachedSimilar = await db
      .select()
      .from(genreSimilarity)
      .where(
        and(
          eq(genreSimilarity.genre1, normalized),
          eq(genreSimilarity.isSimilar, true)
        )
      );

    // Check if we have a recent full fetch (not expired)
    const now = new Date();
    const hasRecentFullFetch = cachedSimilar.some(
      row => row.expiresAt && row.expiresAt > now
    );

    if (hasRecentFullFetch) {
      return new Set(cachedSimilar.map(row => row.genre2));
    }

    // Fetch from data sources
    const everynoise = getEveryNoiseDataSource();
    const voltraco = getVoltracoDataSource();

    let similarGenres: string[] = [];

    // Try EveryNoise first (better coverage)
    if (everynoise.hasGenre(normalized)) {
      similarGenres = everynoise.getSimilarGenres(normalized, EVERYNOISE_SIMILARITY_THRESHOLD, 20);
      logger.debug({ genre: normalized, source: 'EveryNoise', count: similarGenres.length }, 'fetched similar genres');
    }
    // Fall back to Voltraco
    else if (voltraco.hasGenre(normalized)) {
      similarGenres = voltraco.getSimilarGenres(normalized);
      logger.debug({ genre: normalized, source: 'Voltraco', count: similarGenres.length }, 'fetched similar genres');
    } else {
      logger.debug({ genre: normalized }, 'genre not found in any data source');
      return new Set();
    }

    // Cache all results
    const expiresAt = new Date(Date.now() + SIMILARITY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    for (const tag of similarGenres) {
      await this.cacheSimilarity(normalized, tag, true, expiresAt);
    }

    return new Set(similarGenres);
  }

  /**
   * Group genres into families based on similarity
   * Returns a Map where each genre maps to its "representative" genre
   * Genres in the same family share the same representative
   *
   * @param genres - Array of genre names to group
   * @returns Map of genre -> representative genre
   */
  async groupGenresIntoFamilies(genres: string[]): Promise<Map<string, string>> {
    const familyMap = new Map<string, string>();

    if (genres.length === 0) {
      return familyMap;
    }

    // Normalize all genres
    const normalizedGenres = genres.map(g => g.toLowerCase().trim());

    // Build similarity graph
    const similarityGraph = new Map<string, Set<string>>();

    for (const genre of normalizedGenres) {
      similarityGraph.set(genre, new Set([genre])); // Include self
    }

    // Check all pairs for similarity
    for (let i = 0; i < normalizedGenres.length; i++) {
      for (let j = i + 1; j < normalizedGenres.length; j++) {
        const g1 = normalizedGenres[i];
        const g2 = normalizedGenres[j];

        const areSimilar = await this.areGenresSimilar(g1, g2);

        if (areSimilar) {
          // Add bidirectional edges
          similarityGraph.get(g1)?.add(g2);
          similarityGraph.get(g2)?.add(g1);
        }
      }
    }

    // Find connected components (genre families)
    const visited = new Set<string>();
    const families: string[][] = [];

    for (const genre of normalizedGenres) {
      if (visited.has(genre)) {
        continue;
      }

      // BFS to find connected component
      const family: string[] = [];
      const queue: string[] = [genre];
      visited.add(genre);

      while (queue.length > 0) {
        const current = queue.shift()!;
        family.push(current);

        const neighbors = similarityGraph.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      families.push(family);
    }

    // Assign representative genre (alphabetically first) to each family
    for (const family of families) {
      const representative = family.sort()[0];
      for (const genre of family) {
        familyMap.set(genre, representative);
      }
    }

    logger.debug(
      {
        totalGenres: genres.length,
        families: families.length,
        familyDetails: families.map(f => ({
          representative: f.sort()[0],
          members: f
        }))
      },
      'grouped genres into similarity families'
    );

    return familyMap;
  }

  /**
   * Generate memory cache key (normalized, order-independent)
   */
  private getMemoryCacheKey(genre1: string, genre2: string): string {
    // Sort to ensure consistent key regardless of order
    const [g1, g2] = [genre1, genre2].sort();
    return `${g1}|${g2}`;
  }

  /**
   * Compute similarity using EveryNoise and Voltraco data sources
   */
  private async computeSimilarity(genre1: string, genre2: string): Promise<boolean> {
    const everynoise = getEveryNoiseDataSource();
    const voltraco = getVoltracoDataSource();

    // Try EveryNoise first (primary source, better coverage)
    if (everynoise.hasGenre(genre1) && everynoise.hasGenre(genre2)) {
      const isSimilar = everynoise.areGenresSimilar(genre1, genre2, EVERYNOISE_SIMILARITY_THRESHOLD);
      logger.debug({ genre1, genre2, isSimilar, source: 'EveryNoise' }, 'computed genre similarity');
      return isSimilar;
    }

    // Fall back to Voltraco (high accuracy for genres it has)
    if (voltraco.hasGenre(genre1) && voltraco.hasGenre(genre2)) {
      const isSimilar = voltraco.areGenresSimilar(genre1, genre2);
      logger.debug({ genre1, genre2, isSimilar, source: 'Voltraco' }, 'computed genre similarity');
      return isSimilar;
    }

    // No data available for these genres
    logger.debug({ genre1, genre2 }, 'genres not found in any data source');
    return false;
  }

  /**
   * Get cached similarity (checks both orderings)
   */
  private async getCachedSimilarity(genre1: string, genre2: string): Promise<boolean | null> {
    const db = getDb();

    // Try exact ordering first
    const cached = await db
      .select()
      .from(genreSimilarity)
      .where(
        and(
          eq(genreSimilarity.genre1, genre1),
          eq(genreSimilarity.genre2, genre2)
        )
      )
      .limit(1);

    if (cached.length > 0) {
      const record = cached[0];

      // Check if expired
      if (record.expiresAt && record.expiresAt < new Date()) {
        logger.debug({ genre1, genre2 }, 'genre similarity cache expired');
        return null;
      }

      return record.isSimilar;
    }

    // Try reverse ordering
    const cachedReverse = await db
      .select()
      .from(genreSimilarity)
      .where(
        and(
          eq(genreSimilarity.genre1, genre2),
          eq(genreSimilarity.genre2, genre1)
        )
      )
      .limit(1);

    if (cachedReverse.length > 0) {
      const record = cachedReverse[0];

      // Check if expired
      if (record.expiresAt && record.expiresAt < new Date()) {
        logger.debug({ genre1, genre2 }, 'genre similarity cache expired (reverse)');
        return null;
      }

      return record.isSimilar;
    }

    return null;
  }

  /**
   * Cache similarity result in database
   */
  private async cacheSimilarity(
    genre1: string,
    genre2: string,
    isSimilar: boolean,
    expiresAt?: Date
  ): Promise<void> {
    const db = getDb();
    const expiration = expiresAt || new Date(Date.now() + SIMILARITY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

    try {
      await db
        .insert(genreSimilarity)
        .values({
          genre1,
          genre2,
          isSimilar,
          expiresAt: expiration
        })
        .onConflictDoUpdate({
          target: [genreSimilarity.genre1, genreSimilarity.genre2],
          set: {
            isSimilar,
            cachedAt: new Date(),
            expiresAt: expiration
          }
        });

      logger.debug({ genre1, genre2, isSimilar }, 'cached genre similarity');
    } catch (error) {
      logger.warn({ genre1, genre2, error }, 'failed to cache genre similarity');
    }
  }
}

// Singleton instance
let genreSimilarityService: GenreSimilarityService | null = null;

export const getGenreSimilarityService = (): GenreSimilarityService => {
  if (!genreSimilarityService) {
    genreSimilarityService = new GenreSimilarityService();
  }
  return genreSimilarityService;
};
