import { eq, and } from 'drizzle-orm';
import { getDb } from './db/index.js';
import { genreCache, albumGenreCache } from './db/schema.js';
import { getLastFmClient } from './metadata/providers/lastfm.js';
import { getSpotifyClient } from './metadata/providers/spotify.js';
import { getGenresForArtist as getManualGenres } from './genre-mapping.js';
import { logger } from './logger.js';
import { APP_ENV } from './config.js';

const CACHE_TTL_DAYS = 90;

/**
 * Enriched genre service with caching
 * Priority: Cache > Navidrome > Manual Mapping
 */
export class GenreEnrichmentService {
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
   * Save genres to cache
   */
  private async cacheGenres(
    artistName: string,
    genres: string[],
    source: 'lastfm' | 'spotify' | 'embedded' | 'manual'
  ): Promise<void> {
    const db = getDb();
    const normalizedName = artistName.toLowerCase();
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

    try {
      await db
        .insert(genreCache)
        .values({
          artistName: normalizedName,
          genres: JSON.stringify(genres),
          source,
          expiresAt
        })
        .onConflictDoUpdate({
          target: genreCache.artistName,
          set: {
            genres: JSON.stringify(genres),
            source,
            cachedAt: new Date(),
            expiresAt
          }
        });

      logger.debug({ artistName, genres, source }, 'cached genres');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.warn(
        {
          artistName,
          genres,
          source,
          errorMessage: errorMsg,
          errorStack
        },
        'failed to cache genres'
      );
    }
  }

  /**
   * Get enriched genres for an artist
   * Returns array of genre strings (lowercase)
   */
  async getGenresForArtist(artistName: string): Promise<string[]> {
    if (!artistName) {
      return [];
    }

    // 1. Check cache
    const cached = await this.getCachedGenres(artistName);
    if (cached) {
      return cached;
    }

    // 2. Try Spotify (best for mainstream artists, has popularity scores)
    const spotifyClient = getSpotifyClient(
      APP_ENV.SPOTIFY_CLIENT_ID || undefined,
      APP_ENV.SPOTIFY_CLIENT_SECRET || undefined
    );
    if (spotifyClient.isEnabled()) {
      try {
        const spotifyGenres = await spotifyClient.getArtistGenres(artistName);
        if (spotifyGenres.length > 0) {
          logger.debug(
            { artistName, genres: spotifyGenres },
            'genres from spotify'
          );
          await this.cacheGenres(artistName, spotifyGenres, 'spotify');
          return spotifyGenres;
        }
      } catch (error) {
        logger.warn({ artistName, error }, 'spotify genre fetch failed');
      }
    }

    // 3. Try Last.fm (great for indie/electronic, community-tagged)
    const lastfmClient = getLastFmClient(APP_ENV.LASTFM_API_KEY || undefined);
    if (lastfmClient.isEnabled()) {
      try {
        const lastfmGenres = await lastfmClient.getArtistGenres(artistName);
        if (lastfmGenres.length > 0) {
          logger.debug(
            { artistName, genres: lastfmGenres },
            'genres from lastfm'
          );
          await this.cacheGenres(artistName, lastfmGenres, 'lastfm');
          return lastfmGenres;
        }
      } catch (error) {
        logger.warn({ artistName, error }, 'lastfm genre fetch failed');
      }
    }

    // 4. Fallback to manual mapping
    const manualGenres = getManualGenres(artistName).map(g => g.toLowerCase());
    if (manualGenres.length > 0) {
      logger.debug({ artistName, genres: manualGenres }, 'genres from manual mapping');
      await this.cacheGenres(artistName, manualGenres, 'manual');
      return manualGenres;
    }

    logger.debug({ artistName }, 'no genres found');
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
      requestSpacing?: number;
    } = {}
  ): Promise<Map<string, string[]>> {
    const { concurrency = 10, onProgress, requestSpacing = 100 } = options;
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

        const genres = await this.getGenresForArtist(artistName);
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
   * Save album genres to cache
   */
  private async cacheAlbumGenres(
    artistName: string,
    albumName: string,
    genres: string[],
    source: 'lastfm' | 'spotify' | 'embedded' | 'manual'
  ): Promise<void> {
    const db = getDb();
    const normalizedArtist = artistName.toLowerCase();
    const normalizedAlbum = albumName.toLowerCase();
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

    try {
      await db
        .insert(albumGenreCache)
        .values({
          artistName: normalizedArtist,
          albumName: normalizedAlbum,
          genres: JSON.stringify(genres),
          source,
          expiresAt
        })
        .onConflictDoUpdate({
          target: [albumGenreCache.artistName, albumGenreCache.albumName],
          set: {
            genres: JSON.stringify(genres),
            source,
            cachedAt: new Date(),
            expiresAt
          }
        });

      logger.debug({ artistName, albumName, genres, source }, 'cached album genres');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.warn(
        {
          artistName,
          albumName,
          genres,
          source,
          errorMessage: errorMsg,
          errorStack
        },
        'failed to cache album genres'
      );
    }
  }

  /**
   * Get enriched genres for an album
   * Returns array of genre strings (lowercase)
   * Fallback priority: Album cache > Spotify album > Last.fm album > Artist genres
   * @param cacheOnly If true, only check cache and skip API calls (avoids rate limits)
   */
  async getGenresForAlbum(artistName: string, albumName: string, cacheOnly = false): Promise<string[]> {
    if (!artistName || !albumName) {
      return [];
    }

    // 1. Check album cache
    const cached = await this.getCachedAlbumGenres(artistName, albumName);
    if (cached) {
      return cached;
    }

    // If cache-only mode, skip API calls and fallback to artist cache
    if (cacheOnly) {
      const artistCached = await this.getCachedGenres(artistName);
      if (artistCached) {
        return artistCached;
      }
      return [];
    }

    // 2. Try Spotify album lookup
    const spotifyClient = getSpotifyClient(
      APP_ENV.SPOTIFY_CLIENT_ID || undefined,
      APP_ENV.SPOTIFY_CLIENT_SECRET || undefined
    );
    if (spotifyClient.isEnabled()) {
      try {
        const spotifyGenres = await spotifyClient.getAlbumGenres(artistName, albumName);
        if (spotifyGenres.length > 0) {
          logger.debug(
            { artistName, albumName, genres: spotifyGenres },
            'album genres from spotify'
          );
          await this.cacheAlbumGenres(artistName, albumName, spotifyGenres, 'spotify');
          return spotifyGenres;
        }
      } catch (error) {
        logger.warn({ artistName, albumName, error }, 'spotify album genre fetch failed');
      }
    }

    // 3. Try Last.fm album lookup
    const lastfmClient = getLastFmClient(APP_ENV.LASTFM_API_KEY || undefined);
    if (lastfmClient.isEnabled()) {
      try {
        const lastfmGenres = await lastfmClient.getAlbumGenres(artistName, albumName);
        if (lastfmGenres.length > 0) {
          logger.debug(
            { artistName, albumName, genres: lastfmGenres },
            'album genres from lastfm'
          );
          await this.cacheAlbumGenres(artistName, albumName, lastfmGenres, 'lastfm');
          return lastfmGenres;
        }
      } catch (error) {
        logger.warn({ artistName, albumName, error }, 'lastfm album genre fetch failed');
      }
    }

    // 4. Fallback to artist-level genres
    logger.debug(
      { artistName, albumName },
      'no album-specific genres found, falling back to artist genres'
    );
    return this.getGenresForArtist(artistName);
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
 * @param cacheOnly If true, only check cache and skip API calls (avoids rate limits)
 */
export const getEnrichedAlbumGenres = async (
  artistName: string,
  albumName: string,
  cacheOnly = false
): Promise<string[]> => {
  const service = getGenreEnrichmentService();
  return service.getGenresForAlbum(artistName, albumName, cacheOnly);
};
