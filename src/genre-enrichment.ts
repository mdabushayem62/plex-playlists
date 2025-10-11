import { eq, and } from 'drizzle-orm';
import type { MusicSection } from '@ctrl/plex';
import { getDb } from './db/index.js';
import { genreCache, albumGenreCache } from './db/schema.js';
import { getLastFmClient } from './metadata/providers/lastfm.js';
import { getSpotifyClient } from './metadata/providers/spotify.js';
import { logger } from './logger.js';
import { getEffectiveConfig } from './db/settings-service.js';
import { getPlexServer } from './plex/client.js';
import { getExpirationTimestamp, CACHE_REFRESH_CONFIG } from './cache/cache-utils.js';

const CACHE_TTL_DAYS = CACHE_REFRESH_CONFIG.BASE_TTL_DAYS;

/**
 * Enriched genre service with caching
 * Priority: Cache > Plex Metadata (Genre + Style, Mood) > Spotify > Last.fm
 */
export class GenreEnrichmentService {
  // Map of artist name -> plex genre/style tags for bulk operations
  private plexGenreCache = new Map<string, string[]>();
  // Map of artist name -> plex mood tags for bulk operations
  private plexMoodCache = new Map<string, string[]>();
  // Map of "artist|album" -> plex album genre/style tags for bulk operations
  private plexAlbumGenreCache = new Map<string, string[]>();
  // Map of "artist|album" -> plex album mood tags for bulk operations
  private plexAlbumMoodCache = new Map<string, string[]>();
  // Cached effective config (DB settings + env fallbacks)
  private effectiveConfig: Awaited<ReturnType<typeof getEffectiveConfig>> | null = null;

  /**
   * Set Plex genres from bulk metadata fetch (used by cache warming)
   * Contains Genre + Style tags (semantic categories)
   */
  setPlexGenres(artistGenres: Map<string, string[]>): void {
    this.plexGenreCache = new Map(artistGenres);
  }

  /**
   * Set Plex moods from bulk metadata fetch (used by cache warming)
   * Contains Mood tags (emotional attributes)
   */
  setPlexMoods(artistMoods: Map<string, string[]>): void {
    this.plexMoodCache = new Map(artistMoods);
  }

  /**
   * Set Plex album genres from bulk metadata fetch (used by album cache warming)
   * Contains Genre + Style tags (semantic categories)
   */
  setPlexAlbumGenres(albumGenres: Map<string, string[]>): void {
    this.plexAlbumGenreCache = new Map(albumGenres);
  }

  /**
   * Set Plex album moods from bulk metadata fetch (used by album cache warming)
   * Contains Mood tags (emotional attributes)
   */
  setPlexAlbumMoods(albumMoods: Map<string, string[]>): void {
    this.plexAlbumMoodCache = new Map(albumMoods);
  }

  /**
   * Clear Plex genre cache to free memory
   */
  clearPlexGenres(): void {
    this.plexGenreCache.clear();
  }

  /**
   * Clear Plex mood cache to free memory
   */
  clearPlexMoods(): void {
    this.plexMoodCache.clear();
  }

  /**
   * Clear Plex album genre cache to free memory
   */
  clearPlexAlbumGenres(): void {
    this.plexAlbumGenreCache.clear();
  }

  /**
   * Clear Plex album mood cache to free memory
   */
  clearPlexAlbumMoods(): void {
    this.plexAlbumMoodCache.clear();
  }

  /**
   * Get effective configuration (cached to avoid repeated DB reads)
   * Merges database settings with environment variable fallbacks
   */
  private async getConfig(): Promise<Awaited<ReturnType<typeof getEffectiveConfig>>> {
    if (!this.effectiveConfig) {
      this.effectiveConfig = await getEffectiveConfig();
    }
    return this.effectiveConfig;
  }

  /**
   * Invalidate config cache (call when settings are updated)
   */
  invalidateConfigCache(): void {
    this.effectiveConfig = null;
  }
  /**
   * Get genres from cache
   */
  private async getCachedGenres(artistName: string): Promise<string[] | null> {
    const db = getDb();
    const normalizedName = artistName.toLowerCase();

    try {
      const cached = await db
        .select()
        .from(genreCache)
        .where(eq(genreCache.artistName, normalizedName))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const record = cached[0];

      // Check if expired
      if (record.expiresAt && record.expiresAt < new Date()) {
        logger.debug({ artistName }, 'genre cache expired');
        return null;
      }

      const genres = JSON.parse(record.genres) as string[];
      logger.debug(
        { artistName, genres, source: record.source },
        'genre cache hit'
      );

      return genres;
    } catch (error) {
      logger.warn({ artistName, error }, 'failed to read genre cache');
      return null;
    }
  }

  /**
   * Save genres and moods to cache
   * @param source - Can be a single source ('plex') or comma-separated ('plex,lastfm')
   */
  private async cacheGenres(
    artistName: string,
    genres: string[],
    source: string,
    moods: string[] = []
  ): Promise<void> {
    const db = getDb();
    const normalizedName = artistName.toLowerCase();
    const expiresAt = new Date(getExpirationTimestamp(CACHE_TTL_DAYS, CACHE_REFRESH_CONFIG.TTL_JITTER_PERCENT));

    try {
      await db
        .insert(genreCache)
        .values({
          artistName: normalizedName,
          genres: JSON.stringify(genres),
          moods: JSON.stringify(moods),
          source,
          expiresAt
        })
        .onConflictDoUpdate({
          target: genreCache.artistName,
          set: {
            genres: JSON.stringify(genres),
            moods: JSON.stringify(moods),
            source,
            cachedAt: new Date(),
            expiresAt
          }
        });

      logger.debug({ artistName, genres, moods, source }, 'cached genres and moods');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.warn(
        {
          artistName,
          genres,
          moods,
          source,
          errorMessage: errorMsg,
          errorStack
        },
        'failed to cache genres and moods'
      );
    }
  }

  /**
   * Get music section from Plex
   */
  private async getMusicSection(): Promise<MusicSection | null> {
    try {
      const server = await getPlexServer();
      const library = await server.library();
      const sections = await library.sections();
      const musicSection = sections.find(
        (s): s is MusicSection =>
          (s as MusicSection).searchTracks !== undefined && s.CONTENT_TYPE === 'audio'
      );
      return musicSection || null;
    } catch (error) {
      logger.warn({ error }, 'failed to get Plex music section');
      return null;
    }
  }

  /**
   * Get genres and moods from Plex metadata
   * First checks in-memory cache (populated by bulk operations)
   * Returns { genres, moods } or null if not available
   */
  private async getPlexData(artistName: string): Promise<{ genres: string[]; moods: string[] } | null> {
    // Check in-memory cache first (from bulk fetch)
    const normalizedName = artistName.toLowerCase();
    const cachedGenres = this.plexGenreCache.get(normalizedName);
    const cachedMoods = this.plexMoodCache.get(normalizedName);

    // If both caches have data (even if empty arrays), Plex metadata was fetched
    if (cachedGenres !== undefined && cachedMoods !== undefined) {
      if (cachedGenres.length > 0 || cachedMoods.length > 0) {
        logger.debug(
          { artistName, genres: cachedGenres, moods: cachedMoods },
          'genres/moods from Plex (cached)'
        );
        return { genres: cachedGenres, moods: cachedMoods };
      } else {
        logger.debug({ artistName }, 'no genres/moods in Plex metadata (cached)');
        return null;
      }
    }

    // If not in cache, Plex metadata isn't available
    // Don't make individual API calls as it's too slow
    logger.debug({ artistName }, 'Plex genres/moods not available (not in bulk cache)');
    return null;
  }

  /**
   * Get enriched genres for an artist with multi-source merging
   * Returns array of genre strings (lowercase)
   *
   * Strategy:
   * - Always try Plex + Last.fm and merge results
   * - Only use Spotify if both Plex and Last.fm return nothing (rate limit conservation)
   * - Merge genres/moods from all sources with deduplication
   * - Track sources as comma-separated string (e.g., "plex,lastfm")
   *
   * @param artistName - The artist name to fetch genres for
   * @param options - Optional configuration
   * @param options.onSourceUsed - Callback invoked when a source is used (for tracking)
   * @param options.cacheOnly - If true, only use cached data (no external API calls)
   */
  async getGenresForArtist(
    artistName: string,
    options?: {
      onSourceUsed?: (source: 'spotify' | 'lastfm' | 'plex' | 'manual' | 'cached') => void;
      cacheOnly?: boolean;
    }
  ): Promise<string[]> {
    if (!artistName) {
      return [];
    }

    // 1. Check cache
    const cached = await this.getCachedGenres(artistName);
    if (cached) {
      if (options?.onSourceUsed) {
        options.onSourceUsed('cached');
      }
      return cached;
    }

    // Collect genres and moods from all sources
    const allGenres: string[] = [];
    const allMoods: string[] = [];
    const sources: string[] = [];

    // 2. Try Plex metadata first (local, no API calls needed)
    const plexData = await this.getPlexData(artistName);
    if (plexData && (plexData.genres.length > 0 || plexData.moods.length > 0)) {
      allGenres.push(...plexData.genres);
      allMoods.push(...plexData.moods);
      sources.push('plex');
      logger.debug(
        { artistName, genres: plexData.genres, moods: plexData.moods },
        'genres/moods from Plex'
      );
      if (options?.onSourceUsed) {
        options.onSourceUsed('plex');
      }
    }

    // 3. Try Last.fm (always, even if Plex has data - good for additional coverage)
    // Skip if cache-only mode is enabled (used during playlist generation to avoid timeouts)
    if (!options?.cacheOnly) {
      const config = await this.getConfig();
      const lastfmClient = getLastFmClient(config.lastfmApiKey || undefined);
      if (lastfmClient.isEnabled()) {
        try {
          const lastfmGenres = await lastfmClient.getArtistGenres(artistName);
          if (lastfmGenres.length > 0) {
            allGenres.push(...lastfmGenres);
            sources.push('lastfm');
            logger.debug(
              { artistName, genres: lastfmGenres },
              'genres from Last.fm'
            );
            if (options?.onSourceUsed) {
              options.onSourceUsed('lastfm');
            }
          }
        } catch (error) {
          logger.warn({ artistName, error }, 'Last.fm genre fetch failed');
        }
      }

      // 4. Only try Spotify if both Plex and Last.fm returned nothing (rate limit conservation)
      if (allGenres.length === 0) {
        const spotifyClient = getSpotifyClient(
          config.spotifyClientId || undefined,
          config.spotifyClientSecret || undefined
        );
        if (spotifyClient.isEnabled()) {
          try {
            const spotifyGenres = await spotifyClient.getArtistGenres(artistName);
            if (spotifyGenres.length > 0) {
              allGenres.push(...spotifyGenres);
              sources.push('spotify');
              logger.debug(
                { artistName, genres: spotifyGenres },
                'genres from Spotify (fallback)'
              );
              if (options?.onSourceUsed) {
                options.onSourceUsed('spotify');
              }
            }
          } catch (error) {
            logger.warn({ artistName, error }, 'Spotify genre fetch failed');
          }
        }
      }
    }

    // 5. Merge and deduplicate
    const mergedGenres = [...new Set(allGenres)];
    const mergedMoods = [...new Set(allMoods)];
    const sourceString = sources.join(',');

    // 6. Cache merged results (if we found anything)
    if (mergedGenres.length > 0) {
      await this.cacheGenres(artistName, mergedGenres, sourceString, mergedMoods);
      logger.info(
        {
          artistName,
          genres: mergedGenres.length,
          moods: mergedMoods.length,
          sources: sourceString
        },
        'cached merged genres from multiple sources'
      );
      return mergedGenres;
    }

    // No genres found from any source
    // Don't cache empty results - let it try again next time
    logger.debug({ artistName }, 'no genres found from any source');
    return [];
  }

  /**
   * Check if an artist matches a genre filter
   */
  async artistMatchesGenre(artistName: string, genreFilter: string): Promise<boolean> {
    const genres = await this.getGenresForArtist(artistName);
    const filterLower = genreFilter.toLowerCase();

    return genres.some(genre => genre.includes(filterLower));
  }

  /**
   * Bulk fetch genres for multiple artists with parallel processing
   * Uses concurrency limit to avoid overwhelming APIs
   */
  async getGenresForArtists(
    artistNames: string[],
    options: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
      onSourceUsed?: (source: 'spotify' | 'lastfm' | 'plex' | 'manual' | 'cached') => void;
      requestSpacing?: number;
    } = {}
  ): Promise<Map<string, string[]>> {
    const { concurrency = 10, onProgress, onSourceUsed, requestSpacing = 100 } = options;
    const results = new Map<string, string[]>();
    const total = artistNames.length;
    let completed = 0;

    // Use dynamic import for p-limit
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);

    /**
     * Small delay to space out requests and avoid bursting the API
     */
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const tasks = artistNames.map((artistName, index) =>
      limit(async () => {
        // Add spacing delay between requests (stagger by index to spread load)
        if (requestSpacing > 0 && index > 0) {
          await sleep(requestSpacing);
        }

        const genres = await this.getGenresForArtist(artistName, { onSourceUsed });
        results.set(artistName, genres);
        completed++;
        if (onProgress) {
          onProgress(completed, total);
        }
        return { artistName, genres };
      })
    );

    await Promise.all(tasks);

    logger.info(
      {
        total,
        cached: artistNames.length - completed,
        fetched: completed,
        concurrency,
        requestSpacing
      },
      'bulk genre fetch complete'
    );

    return results;
  }

  /**
   * Get genres from album cache
   */
  private async getCachedAlbumGenres(
    artistName: string,
    albumName: string
  ): Promise<string[] | null> {
    const db = getDb();
    const normalizedArtist = artistName.toLowerCase();
    const normalizedAlbum = albumName.toLowerCase();

    try {
      const cached = await db
        .select()
        .from(albumGenreCache)
        .where(
          and(
            eq(albumGenreCache.artistName, normalizedArtist),
            eq(albumGenreCache.albumName, normalizedAlbum)
          )
        )
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const record = cached[0];

      // Check if expired
      if (record.expiresAt && record.expiresAt < new Date()) {
        logger.debug({ artistName, albumName }, 'album genre cache expired');
        return null;
      }

      const genres = JSON.parse(record.genres) as string[];
      logger.debug(
        { artistName, albumName, genres, source: record.source },
        'album genre cache hit'
      );

      return genres;
    } catch (error) {
      logger.warn({ artistName, albumName, error }, 'failed to read album genre cache');
      return null;
    }
  }

  /**
   * Save album genres and moods to cache
   * @param source - Can be a single source ('plex') or comma-separated ('plex,lastfm')
   */
  private async cacheAlbumGenres(
    artistName: string,
    albumName: string,
    genres: string[],
    source: string,
    moods: string[] = []
  ): Promise<void> {
    const db = getDb();
    const normalizedArtist = artistName.toLowerCase();
    const normalizedAlbum = albumName.toLowerCase();
    const expiresAt = new Date(getExpirationTimestamp(CACHE_TTL_DAYS, CACHE_REFRESH_CONFIG.TTL_JITTER_PERCENT));

    try {
      await db
        .insert(albumGenreCache)
        .values({
          artistName: normalizedArtist,
          albumName: normalizedAlbum,
          genres: JSON.stringify(genres),
          moods: JSON.stringify(moods),
          source,
          expiresAt
        })
        .onConflictDoUpdate({
          target: [albumGenreCache.artistName, albumGenreCache.albumName],
          set: {
            genres: JSON.stringify(genres),
            moods: JSON.stringify(moods),
            source,
            cachedAt: new Date(),
            expiresAt
          }
        });

      logger.debug({ artistName, albumName, genres, moods, source }, 'cached album genres and moods');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.warn(
        {
          artistName,
          albumName,
          genres,
          moods,
          source,
          errorMessage: errorMsg,
          errorStack
        },
        'failed to cache album genres and moods'
      );
    }
  }

  /**
   * Get genres and moods from Plex album metadata
   * First checks in-memory cache (populated by bulk operations)
   * Returns { genres, moods } or null if not available
   */
  private async getPlexAlbumData(artistName: string, albumName: string): Promise<{ genres: string[]; moods: string[] } | null> {
    // Check in-memory cache first (from bulk fetch)
    const key = `${artistName.toLowerCase()}|${albumName.toLowerCase()}`;
    const cachedGenres = this.plexAlbumGenreCache.get(key);
    const cachedMoods = this.plexAlbumMoodCache.get(key);

    // If both caches have data (even if empty arrays), Plex metadata was fetched
    if (cachedGenres !== undefined && cachedMoods !== undefined) {
      if (cachedGenres.length > 0 || cachedMoods.length > 0) {
        logger.debug(
          { artistName, albumName, genres: cachedGenres, moods: cachedMoods },
          'album genres/moods from Plex (cached)'
        );
        return { genres: cachedGenres, moods: cachedMoods };
      } else {
        logger.debug({ artistName, albumName }, 'no genres/moods in Plex album metadata (cached)');
        return null;
      }
    }

    // If not in cache, Plex metadata isn't available
    logger.debug({ artistName, albumName }, 'Plex album genres/moods not available (not in bulk cache)');
    return null;
  }

  /**
   * Get enriched genres for an album
   * Returns array of genre strings (lowercase)
   * Fallback priority: Album cache > Plex album > Artist genres (with multi-source enrichment)
   */
  async getGenresForAlbum(artistName: string, albumName: string): Promise<string[]> {
    if (!artistName || !albumName) {
      return [];
    }

    // 1. Check album cache
    const cached = await this.getCachedAlbumGenres(artistName, albumName);
    if (cached) {
      return cached;
    }

    // 2. Try Plex album metadata first (local, no API calls needed)
    const plexData = await this.getPlexAlbumData(artistName, albumName);
    if (plexData && plexData.genres.length > 0) {
      await this.cacheAlbumGenres(artistName, albumName, plexData.genres, 'plex', plexData.moods);
      return plexData.genres;
    }

    // NOTE: Spotify/Last.fm are NOT used for album lookups to avoid API thrashing
    // External APIs are ONLY used for artist-level genre enrichment
    // Albums fall back to artist genres (which may come from Spotify/Last.fm if cached)
    logger.debug(
      { artistName, albumName },
      'no album-specific Plex metadata, falling back to artist genres (external APIs only used for artist cache)'
    );
    return this.getGenresForArtist(artistName);
  }

  /**
   * Get enriched moods for an artist
   * Returns array of mood strings (lowercase)
   * @param artistName - The artist name to fetch moods for
   */
  async getMoodsForArtist(artistName: string): Promise<string[]> {
    if (!artistName) {
      return [];
    }

    const db = getDb();
    const normalizedName = artistName.toLowerCase();

    try {
      // Check cache first
      const cached = await db
        .select()
        .from(genreCache)
        .where(eq(genreCache.artistName, normalizedName))
        .limit(1);

      if (cached.length > 0) {
        const record = cached[0];
        // Check if expired
        if (!record.expiresAt || record.expiresAt >= new Date()) {
          const moods = JSON.parse(record.moods || '[]') as string[];
          logger.debug({ artistName, moods, source: record.source }, 'mood cache hit');
          return moods;
        }
      }

      // Try Plex metadata (from in-memory cache)
      const plexData = await this.getPlexData(artistName);
      if (plexData) {
        return plexData.moods;
      }

      // No moods found
      logger.debug({ artistName }, 'no moods found');
      return [];
    } catch (error) {
      logger.warn({ artistName, error }, 'failed to read mood data');
      return [];
    }
  }

  /**
   * Get enriched moods for an album
   * Returns array of mood strings (lowercase)
   * @param artistName - The artist name
   * @param albumName - The album name
   */
  async getMoodsForAlbum(artistName: string, albumName: string): Promise<string[]> {
    if (!artistName || !albumName) {
      return [];
    }

    const db = getDb();
    const normalizedArtist = artistName.toLowerCase();
    const normalizedAlbum = albumName.toLowerCase();

    try {
      // Check cache first
      const cached = await db
        .select()
        .from(albumGenreCache)
        .where(
          and(
            eq(albumGenreCache.artistName, normalizedArtist),
            eq(albumGenreCache.albumName, normalizedAlbum)
          )
        )
        .limit(1);

      if (cached.length > 0) {
        const record = cached[0];
        // Check if expired
        if (!record.expiresAt || record.expiresAt >= new Date()) {
          const moods = JSON.parse(record.moods || '[]') as string[];
          logger.debug({ artistName, albumName, moods, source: record.source }, 'album mood cache hit');
          return moods;
        }
      }

      // Try Plex metadata (from in-memory cache)
      const plexData = await this.getPlexAlbumData(artistName, albumName);
      if (plexData) {
        return plexData.moods;
      }

      // No moods found
      logger.debug({ artistName, albumName }, 'no album moods found');
      return [];
    } catch (error) {
      logger.warn({ artistName, albumName, error }, 'failed to read album mood data');
      return [];
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<number> {
    const db = getDb();

    try {
      const artistResult = await db
        .delete(genreCache)
        .where(eq(genreCache.expiresAt, new Date()))
        .returning();

      const albumResult = await db
        .delete(albumGenreCache)
        .where(eq(albumGenreCache.expiresAt, new Date()))
        .returning();

      const totalCleared = artistResult.length + albumResult.length;
      logger.info(
        { cleared: totalCleared, artists: artistResult.length, albums: albumResult.length },
        'cleared expired genre cache entries'
      );
      return totalCleared;
    } catch (error) {
      logger.warn({ error }, 'failed to clear expired cache');
      return 0;
    }
  }
}

// Singleton instance
let genreService: GenreEnrichmentService | null = null;

export const getGenreEnrichmentService = (): GenreEnrichmentService => {
  if (!genreService) {
    genreService = new GenreEnrichmentService();
  }
  return genreService;
};

/**
 * Convenience function for getting artist genres
 */
export const getEnrichedGenres = async (artistName: string): Promise<string[]> => {
  const service = getGenreEnrichmentService();
  return service.getGenresForArtist(artistName);
};

/**
 * Convenience function for getting album genres
 */
export const getEnrichedAlbumGenres = async (
  artistName: string,
  albumName: string
): Promise<string[]> => {
  const service = getGenreEnrichmentService();
  return service.getGenresForAlbum(artistName, albumName);
};

/**
 * Convenience function for getting artist moods
 */
export const getEnrichedMoods = async (artistName: string): Promise<string[]> => {
  const service = getGenreEnrichmentService();
  return service.getMoodsForArtist(artistName);
};

/**
 * Convenience function for getting album moods
 */
export const getEnrichedAlbumMoods = async (artistName: string, albumName: string): Promise<string[]> => {
  const service = getGenreEnrichmentService();
  return service.getMoodsForAlbum(artistName, albumName);
};
