import type { MusicSection, Section } from '@ctrl/plex';
import { getPlexServer } from '../plex/client.js';
import { getGenreEnrichmentService } from '../genre-enrichment.js';
import { getDb } from '../db/index.js';
import { artistCache, albumCache } from '../db/schema.js';
import { logger } from '../logger.js';
import { lt, and, or, sql } from 'drizzle-orm';
import { recordJobStart, recordJobCompletion } from '../db/repository.js';
import { formatUserError } from '../utils/error-formatter.js';
import { progressTracker } from '../utils/progress-tracker.js';
import { CACHE_REFRESH_CONFIG } from './cache-utils.js';

// Type for Plex metadata tag (Genre, Style, Mood)
interface PlexTag {
  tag: string;
}

interface CacheStats {
  artists: {
    totalEntries: number;
    bySource: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    expiringWithin7Days: number;
    expired: number;
  };
  albums: {
    totalEntries: number;
    bySource: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    expiringWithin7Days: number;
    expired: number;
  };
}

const isMusicSection = (section: Section): section is MusicSection =>
  (section as MusicSection).searchTracks !== undefined && section.CONTENT_TYPE === 'audio';

const findMusicSection = async () => {
  const server = await getPlexServer();
  const library = await server.library();
  const sections = await library.sections();
  const musicSection = sections.find(isMusicSection);
  if (!musicSection) {
    throw new Error('No music library section found');
  }
  return musicSection;
};

/**
 * Get cache statistics for both artist and album caches
 */
export async function getCacheStats(): Promise<CacheStats> {
  const db = getDb();
  const artistEntries = await db.select().from(artistCache);
  const albumEntries = await db.select().from(albumCache);

  const now = new Date();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const buildStats = (entries: Array<{ source: string; cachedAt: Date; expiresAt: Date | null }>) => {
    const stats = {
      totalEntries: entries.length,
      bySource: {} as Record<string, number>,
      oldestEntry: null as Date | null,
      newestEntry: null as Date | null,
      expiringWithin7Days: 0,
      expired: 0
    };

    for (const entry of entries) {
      // Count by source
      stats.bySource[entry.source] = (stats.bySource[entry.source] || 0) + 1;

      // Track oldest/newest
      if (!stats.oldestEntry || entry.cachedAt < stats.oldestEntry) {
        stats.oldestEntry = entry.cachedAt;
      }
      if (!stats.newestEntry || entry.cachedAt > stats.newestEntry) {
        stats.newestEntry = entry.cachedAt;
      }

      // Check expiration
      if (entry.expiresAt) {
        if (entry.expiresAt < now) {
          stats.expired++;
        } else if (entry.expiresAt < sevenDaysFromNow) {
          stats.expiringWithin7Days++;
        }
      }
    }

    return stats;
  };

  return {
    artists: buildStats(artistEntries),
    albums: buildStats(albumEntries)
  };
}

/**
 * Clear expired cache entries (both artists and albums)
 */
export async function clearExpiredCache(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const deletedArtists = await db
    .delete(artistCache)
    .where(lt(artistCache.expiresAt, now))
    .returning();

  const deletedAlbums = await db
    .delete(albumCache)
    .where(lt(albumCache.expiresAt, now))
    .returning();

  const total = deletedArtists.length + deletedAlbums.length;
  logger.info(
    { count: total, artists: deletedArtists.length, albums: deletedAlbums.length },
    'cleared expired cache entries'
  );
  return total;
}

/**
 * Clear all cache entries (both artists and albums)
 */
export async function clearAllCache(): Promise<number> {
  const db = getDb();

  const deletedArtists = await db
    .delete(artistCache)
    .returning();

  const deletedAlbums = await db
    .delete(albumCache)
    .returning();

  const total = deletedArtists.length + deletedAlbums.length;
  logger.info(
    { count: total, artists: deletedArtists.length, albums: deletedAlbums.length },
    'cleared all cache entries'
  );
  return total;
}

/**
 * Refresh cache entries using usage-based prioritization (Phase 3)
 *
 * Strategy:
 * - Hot tier (used in last 30 days): Refresh if cache age > 60 days
 * - Warm tier (used 30-180 days ago): Refresh if cache age > 120 days
 * - Cold tier (unused >180 days or never): Refresh if cache age > 365 days
 *
 * @param batchLimit Maximum number of entries to refresh (default: HOURLY_REFRESH_LIMIT)
 */
export async function refreshExpiringCache(options: {
  daysAhead?: number;  // Deprecated, kept for backward compatibility
  concurrency?: number;
  batchLimit?: number;
  onProgress?: (completed: number, total: number) => void;
} = {}): Promise<{ total: number; refreshed: number; errors: string[]; tierBreakdown?: Record<string, number> }> {
  const { concurrency = 10, batchLimit, onProgress } = options;
  const jobId = await recordJobStart('cache-refresh');

  try {
    const db = getDb();
    const now = Date.now();

    const { HOT, WARM, COLD } = CACHE_REFRESH_CONFIG.USAGE_TIERS;

    // Calculate threshold timestamps
    const hotUsedThreshold = now - (HOT.LAST_USED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const warmUsedThreshold = now - (WARM.LAST_USED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const hotAgeThreshold = now - (HOT.REFRESH_AGE_DAYS * 24 * 60 * 60 * 1000);
    const warmAgeThreshold = now - (WARM.REFRESH_AGE_DAYS * 24 * 60 * 60 * 1000);
    const coldAgeThreshold = now - (COLD.REFRESH_AGE_DAYS * 24 * 60 * 60 * 1000);

    logger.info({ concurrency, batchLimit }, 'refreshing cache with usage-based prioritization');

    // Query with usage-based prioritization
    // Priority tiers (lower number = higher priority):
    // 1 = Hot: recently used, needs refresh
    // 2 = Warm: occasionally used, needs refresh
    // 3 = Cold: rarely/never used, very old
    const candidates = await db
      .select({
        artistName: artistCache.artistName,
        cachedAt: artistCache.cachedAt,
        lastUsedAt: artistCache.lastUsedAt,
        priority: sql<number>`
          CASE
            WHEN ${artistCache.lastUsedAt} >= ${hotUsedThreshold} AND ${artistCache.cachedAt} < ${hotAgeThreshold}
              THEN 1
            WHEN ${artistCache.lastUsedAt} >= ${warmUsedThreshold} AND ${artistCache.cachedAt} < ${warmAgeThreshold}
              THEN 2
            WHEN (${artistCache.lastUsedAt} IS NULL OR ${artistCache.lastUsedAt} < ${warmUsedThreshold}) AND ${artistCache.cachedAt} < ${coldAgeThreshold}
              THEN 3
            ELSE 999
          END
        `.as('priority')
      })
      .from(artistCache)
      .where(
        or(
          // Hot tier: used recently, cache is old
          and(
            sql`${artistCache.lastUsedAt} >= ${hotUsedThreshold}`,
            sql`${artistCache.cachedAt} < ${hotAgeThreshold}`
          ),
          // Warm tier: used occasionally, cache is old
          and(
            sql`${artistCache.lastUsedAt} >= ${warmUsedThreshold}`,
            sql`${artistCache.lastUsedAt} < ${hotUsedThreshold}`,
            sql`${artistCache.cachedAt} < ${warmAgeThreshold}`
          ),
          // Cold tier: rarely/never used, cache is very old
          and(
            or(
              sql`${artistCache.lastUsedAt} IS NULL`,
              sql`${artistCache.lastUsedAt} < ${warmUsedThreshold}`
            ),
            sql`${artistCache.cachedAt} < ${coldAgeThreshold}`
          )
        )
      )
      .orderBy(sql`priority ASC, ${artistCache.cachedAt} ASC`); // Priority first, then oldest within tier

    // Track tier breakdown for observability
    const tierBreakdown: Record<string, number> = {
      hot: 0,
      warm: 0,
      cold: 0
    };

    for (const candidate of candidates) {
      if (candidate.priority === 1) tierBreakdown.hot++;
      else if (candidate.priority === 2) tierBreakdown.warm++;
      else if (candidate.priority === 3) tierBreakdown.cold++;
    }

    let artistNames = candidates.map(row => row.artistName);

    logger.info(
      {
        totalFound: artistNames.length,
        tierBreakdown,
        batchLimit: batchLimit || CACHE_REFRESH_CONFIG.HOURLY_REFRESH_LIMIT
      },
      'found cache entries needing refresh'
    );

    // Apply batch limit if specified (for distributed refreshes)
    const effectiveBatchLimit = batchLimit || CACHE_REFRESH_CONFIG.HOURLY_REFRESH_LIMIT;
    if (artistNames.length > effectiveBatchLimit) {
      logger.info(
        { found: artistNames.length, limit: effectiveBatchLimit },
        'applying batch limit - prioritizing hot and warm tiers'
      );
      artistNames = artistNames.slice(0, effectiveBatchLimit);
    }

    if (artistNames.length === 0) {
      if (jobId) await recordJobCompletion(jobId, 'success');
      return { total: 0, refreshed: 0, errors: [], tierBreakdown };
    }

    // Refresh these artists (this will update their expiresAt date)
    const enrichmentService = getGenreEnrichmentService();
    const errors: string[] = [];

    // Start progress tracking
    if (jobId) {
      progressTracker.startTracking(jobId, artistNames.length, 'Refreshing expiring cache');
    }

    try {
      await enrichmentService.getGenresForArtists(artistNames, {
        concurrency,
        onProgress: async (completed: number, total: number) => {
          // Update progress tracker
          if (jobId) {
            await progressTracker.updateProgress(
              jobId,
              completed,
              `Refreshed ${completed}/${total} artists`
            );
          }
          // Call user-provided callback if exists
          if (onProgress) {
            onProgress(completed, total);
          }
        }
      });

      logger.info({ total: artistNames.length }, 'cache refresh complete');

      if (jobId) {
        await progressTracker.stopTracking(jobId);
        await recordJobCompletion(jobId, 'success');
      }

      return {
        total: artistNames.length,
        refreshed: artistNames.length,
        errors,
        tierBreakdown
      };
    } catch (error) {
      const errorMsg = formatUserError(error, 'refreshing metadata cache');
      errors.push(errorMsg);
      logger.error({ error: errorMsg }, 'cache refresh failed');

      if (jobId) {
        await progressTracker.stopTracking(jobId);
        await recordJobCompletion(jobId, 'failed', errorMsg);
      }

      return {
        total: artistNames.length,
        refreshed: 0,
        errors,
        tierBreakdown
      };
    }
  } catch (error) {
    const errorMsg = formatUserError(error, 'refreshing metadata cache');
    if (jobId) await recordJobCompletion(jobId, 'failed', errorMsg);
    throw error;
  }
}

/**
 * Filter out artists that already have valid cache entries
 */
async function filterUncachedArtists(artistNames: string[]): Promise<string[]> {
  if (artistNames.length === 0) {
    return [];
  }

  const db = getDb();
  const now = new Date();

  // Build a map of normalized names to original names
  const nameMap = new Map<string, string>();
  artistNames.forEach(name => {
    nameMap.set(name.toLowerCase(), name);
  });

  // Find all cached artists that haven't expired
  // Query all cache entries since we can't efficiently do IN with large arrays in SQLite
  const allCached = await db
    .select({ artistName: artistCache.artistName, expiresAt: artistCache.expiresAt })
    .from(artistCache);

  // Filter in memory for artists we care about that haven't expired
  const cachedSet = new Set<string>();
  for (const row of allCached) {
    if (nameMap.has(row.artistName)) {
      if (!row.expiresAt || row.expiresAt > now) {
        cachedSet.add(row.artistName);
      }
    }
  }

  // Return only artists not in cache
  const uncached = artistNames.filter(name => !cachedSet.has(name.toLowerCase()));

  logger.info(
    {
      total: artistNames.length,
      cached: cachedSet.size,
      uncached: uncached.length
    },
    'filtered cached artists'
  );

  return uncached;
}

/**
 * Warm the artist cache by fetching genres for all artists in Plex library
 */
export async function warmCache(options: {
  concurrency?: number;
  dryRun?: boolean;
  onProgress?: (completed: number, total: number) => void;
  skipCached?: boolean;
  jobId?: number; // Optional job ID to use for tracking (if not provided, creates new one)
  signal?: AbortSignal; // Optional abort signal for cancellation
} = {}): Promise<{ totalArtists: number; cached: number; errors: string[] }> {
  const { concurrency = 10, dryRun = false, onProgress, skipCached = true, jobId: providedJobId, signal } = options;
  const jobId = providedJobId ?? await recordJobStart('cache-warm');

  try {
    logger.info({ concurrency, dryRun, skipCached }, 'starting artist cache warm');

    // Check for cancellation before starting
    if (signal?.aborted) {
      throw new Error('Cache warming cancelled');
    }

    // Fetch all artists from Plex
    const musicSection = await findMusicSection();

    logger.info('fetching all artists from plex library');
    const artists = await musicSection.all();

    let artistNames = artists
      .filter(artist => artist.type === 'artist' && artist.title)
      .map(artist => artist.title!);

    const totalArtists = artistNames.length;
    logger.info({ totalArtists }, 'artists found in plex library');

    // Skip already-cached artists if requested
    if (skipCached) {
      artistNames = await filterUncachedArtists(artistNames);
      if (artistNames.length === 0) {
        logger.info('all artists already cached, nothing to do');
        if (jobId) await recordJobCompletion(jobId, 'success');
        return { totalArtists, cached: totalArtists, errors: [] };
      }
    }

    if (dryRun) {
      logger.info('dry-run mode, skipping genre fetch');
      if (jobId) await recordJobCompletion(jobId, 'success');
      return { totalArtists: artistNames.length, cached: 0, errors: [] };
    }

    // Fetch full metadata for each artist to get Genre + Style + Mood
    // Use high concurrency since local Plex is fast (~4 seconds for 1138 artists)
    const plexGenreMap = new Map<string, string[]>();
    const plexMoodMap = new Map<string, string[]>();
    const server = await getPlexServer();

    logger.info({ totalArtists: artists.length }, 'fetching full metadata for all artists (Genre + Style + Mood)');

    // Use dynamic import for p-limit
    const pLimit = (await import('p-limit')).default;
    const metadataConcurrency = 100; // Performance tests showed 100 is optimal (~4 seconds for all artists)
    const limit = pLimit(metadataConcurrency);

    let metadataCompleted = 0;
    const metadataStart = Date.now();

    const metadataTasks = artists
      .filter(artist => artist.type === 'artist' && artist.title && artist.ratingKey)
      .map(artist =>
        limit(async () => {
          try {
            // Fetch full metadata including Style and Mood
            const fullMetadata = await server.query(`/library/metadata/${artist.ratingKey}`);
            const metadata = fullMetadata?.MediaContainer?.Metadata?.[0];

            if (metadata) {
              // Separate Genre + Style from Mood for semantic clarity
              const genres: string[] = [
                ...(metadata.Genre?.map((g: PlexTag) => g.tag.toLowerCase()) || []),
                ...(metadata.Style?.map((s: PlexTag) => s.tag.toLowerCase()) || [])
              ].filter(Boolean);

              const moods: string[] =
                (metadata.Mood?.map((m: PlexTag) => m.tag.toLowerCase()) || []).filter(Boolean);

              const normalizedName = artist.title!.toLowerCase();
              plexGenreMap.set(normalizedName, genres);
              plexMoodMap.set(normalizedName, moods);
            }

            metadataCompleted++;

            // Log progress every 100 artists
            if (metadataCompleted % 100 === 0) {
              const elapsed = (Date.now() - metadataStart) / 1000;
              const rate = metadataCompleted / elapsed;
              const remaining = artists.length - metadataCompleted;
              const eta = remaining / rate;
              logger.info(
                {
                  completed: metadataCompleted,
                  total: artists.length,
                  rate: `${rate.toFixed(1)}/s`,
                  eta: `${eta.toFixed(0)}s`
                },
                'fetching artist metadata'
              );
            }
          } catch (error) {
            logger.warn({ artistName: artist.title, error }, 'failed to fetch full metadata for artist');
          }
        })
      );

    await Promise.all(metadataTasks);

    const metadataElapsed = (Date.now() - metadataStart) / 1000;

    const avgGenresPerArtist = (
      Array.from(plexGenreMap.values()).reduce((sum, genres) => sum + genres.length, 0) /
      plexGenreMap.size
    ).toFixed(1);
    const avgMoodsPerArtist = (
      Array.from(plexMoodMap.values()).reduce((sum, moods) => sum + moods.length, 0) /
      plexMoodMap.size
    ).toFixed(1);

    logger.info(
      {
        totalArtists: plexGenreMap.size,
        withGenres: Array.from(plexGenreMap.values()).filter((g) => g.length > 0).length,
        withMoods: Array.from(plexMoodMap.values()).filter((m) => m.length > 0).length,
        avgGenresPerArtist,
        avgMoodsPerArtist,
        elapsed: `${metadataElapsed.toFixed(1)}s`
      },
      'fetched full Plex metadata (separated Genre+Style and Mood)'
    );

    // Use the bulk fetch method with concurrency
    const enrichmentService = getGenreEnrichmentService();

    // Populate Plex genres and moods in enrichment service
    enrichmentService.setPlexGenres(plexGenreMap);
    enrichmentService.setPlexMoods(plexMoodMap);

    const errors: string[] = [];

    // Check for cancellation before enrichment
    if (signal?.aborted) {
      throw new Error('Cache warming cancelled');
    }

    // Start progress tracking with source tracking enabled
    if (jobId) {
      progressTracker.startTracking(jobId, artistNames.length, 'Warming artist cache', true);
    }

    try {
      await enrichmentService.getGenresForArtists(artistNames, {
        concurrency,
        onProgress: async (completed: number, total: number) => {
          // Update progress tracker
          if (jobId) {
            await progressTracker.updateProgress(
              jobId,
              completed,
              `Cached ${completed}/${total} artists`
            );
          }
          // Call user-provided callback if exists
          if (onProgress) {
            onProgress(completed, total);
          }
        },
        onSourceUsed: (source) => {
          // Track which source was used for real-time breakdown
          if (jobId) {
            progressTracker.incrementSource(jobId, source);
          }
        }
      });

      logger.info({ totalArtists: artistNames.length }, 'artist cache warm complete');

      if (jobId) {
        await progressTracker.stopTracking(jobId);
        await recordJobCompletion(jobId, 'success');
      }

      // Clear Plex genre and mood cache to free memory
      enrichmentService.clearPlexGenres();
      enrichmentService.clearPlexMoods();

      return {
        totalArtists: artistNames.length,
        cached: artistNames.length,
        errors
      };
    } catch (error) {
      const errorMsg = formatUserError(error, 'warming artist cache');
      errors.push(errorMsg);
      logger.error({ error: errorMsg }, 'artist cache warm failed');

      if (jobId) {
        await progressTracker.stopTracking(jobId);
        await recordJobCompletion(jobId, 'failed', errorMsg);
      }

      // Clear Plex genre and mood cache even on error
      enrichmentService.clearPlexGenres();
      enrichmentService.clearPlexMoods();

      return {
        totalArtists: artistNames.length,
        cached: 0,
        errors
      };
    }
  } catch (error) {
    const errorMsg = formatUserError(error, 'warming artist cache');
    if (jobId) await recordJobCompletion(jobId, 'failed', errorMsg);
    throw error;
  }
}

/**
 * Filter out albums that already have valid cache entries
 */
async function filterUncachedAlbums(
  albums: Array<{ artist: string; album: string; ratingKey: string }>
): Promise<Array<{ artist: string; album: string; ratingKey: string }>> {
  if (albums.length === 0) {
    return [];
  }

  const db = getDb();
  const now = new Date();

  // Build a map of normalized names to originals
  const albumMap = new Map<string, { artist: string; album: string; ratingKey: string }>();
  albums.forEach(item => {
    const key = `${item.artist.toLowerCase()}|${item.album.toLowerCase()}`;
    albumMap.set(key, item);
  });

  // Find all cached albums that haven't expired
  const allCached = await db
    .select({
      artistName: albumCache.artistName,
      albumName: albumCache.albumName,
      expiresAt: albumCache.expiresAt
    })
    .from(albumCache);

  // Filter in memory for albums we care about that haven't expired
  const cachedSet = new Set<string>();
  for (const row of allCached) {
    const key = `${row.artistName}|${row.albumName}`;
    if (albumMap.has(key)) {
      if (!row.expiresAt || row.expiresAt > now) {
        cachedSet.add(key);
      }
    }
  }

  // Return only albums not in cache
  const uncached = albums.filter(item => {
    const key = `${item.artist.toLowerCase()}|${item.album.toLowerCase()}`;
    return !cachedSet.has(key);
  });

  logger.info(
    {
      total: albums.length,
      cached: cachedSet.size,
      uncached: uncached.length
    },
    'filtered cached albums'
  );

  return uncached;
}

/**
 * Warm the album cache by fetching genres for all albums in Plex library
 * This is more data-intensive than artist warming, so use cautiously
 *
 * Note: This fetches albums by iterating through artists, as Plex's library.all()
 * only returns artists at the top level
 */
export async function warmAlbumCache(options: {
  concurrency?: number;
  dryRun?: boolean;
  onProgress?: (completed: number, total: number) => void;
  skipCached?: boolean;
  jobId?: number; // Optional job ID to use for tracking (if not provided, creates new one)
  signal?: AbortSignal; // Optional abort signal for cancellation
} = {}): Promise<{ totalAlbums: number; cached: number; errors: string[] }> {
  const { concurrency = 10, dryRun = false, onProgress, skipCached = true, jobId: providedJobId, signal } = options;
  const jobId = providedJobId ?? await recordJobStart('album-cache-warm');

  try {
    logger.info({ concurrency, dryRun, skipCached }, 'starting album cache warm');

    // Check for cancellation before starting
    if (signal?.aborted) {
      throw new Error('Album cache warming cancelled');
    }

    // Fetch all artists from Plex (musicSection.all() returns artists, not albums)
    const musicSection = await findMusicSection();

    logger.info('fetching all tracks to extract unique albums');

    // Fetch all tracks and extract unique albums with their rating keys
    // This is more reliable than trying to get albums directly
    const allTracks = await musicSection.searchTracks({ limit: 999999 });

    logger.info({ totalTracks: allTracks.length }, 'tracks fetched, extracting unique albums');

    // Use a Map to deduplicate albums and capture their ratingKeys
    const albumMap = new Map<string, { artist: string; album: string; ratingKey: string }>();

    for (const track of allTracks) {
      const artistName = track.grandparentTitle; // Artist
      const albumName = track.parentTitle; // Album
      const albumRatingKey = track.parentRatingKey; // Album's rating key

      if (artistName && albumName && albumRatingKey) {
        const key = `${artistName.toLowerCase()}|${albumName.toLowerCase()}`;

        if (!albumMap.has(key)) {
          albumMap.set(key, {
            artist: artistName,
            album: albumName,
            ratingKey: String(albumRatingKey)
          });
        }
      }
    }

    let albumPairs = Array.from(albumMap.values());
    const totalAlbums = albumPairs.length;
    logger.info({ totalAlbums }, 'unique albums extracted from tracks');

    // Skip already-cached albums if requested
    if (skipCached) {
      albumPairs = await filterUncachedAlbums(albumPairs);
      if (albumPairs.length === 0) {
        logger.info('all albums already cached, nothing to do');
        if (jobId) await recordJobCompletion(jobId, 'success');
        return { totalAlbums, cached: totalAlbums, errors: [] };
      }
    }

    if (dryRun) {
      logger.info('dry-run mode, skipping genre fetch');
      if (jobId) await recordJobCompletion(jobId, 'success');
      return { totalAlbums: albumPairs.length, cached: 0, errors: [] };
    }

    // Start progress tracking early (before metadata fetch)
    // Total work: metadata fetch + caching
    // We'll track total progress as 2x the albums (metadata + caching)
    const totalSteps = albumPairs.length * 2;
    if (jobId) {
      progressTracker.startTracking(jobId, totalSteps, 'Warming album cache');
    }

    // Fetch full metadata for each album to get Genre + Style + Mood from Plex
    const server = await getPlexServer();
    const plexAlbumGenreMap = new Map<string, string[]>();
    const plexAlbumMoodMap = new Map<string, string[]>();

    logger.info({ totalAlbums: albumPairs.length }, 'fetching full metadata for all albums (Genre + Style + Mood)');

    // Use dynamic import for p-limit
    const pLimit = (await import('p-limit')).default;
    const metadataConcurrency = 100; // Same high concurrency as artist cache
    const limit = pLimit(metadataConcurrency);

    let metadataCompleted = 0;
    const metadataStart = Date.now();
    const errors: string[] = [];

    const metadataTasks = albumPairs.map(({ artist, album, ratingKey }) =>
      limit(async () => {
        try {
          // Fetch full metadata including Style and Mood
          const fullMetadata = await server.query(`/library/metadata/${ratingKey}`);
          const metadata = fullMetadata?.MediaContainer?.Metadata?.[0];

          if (metadata) {
            // Separate Genre + Style from Mood for semantic clarity
            const genres: string[] = [
              ...(metadata.Genre?.map((g: PlexTag) => g.tag.toLowerCase()) || []),
              ...(metadata.Style?.map((s: PlexTag) => s.tag.toLowerCase()) || [])
            ].filter(Boolean);

            const moods: string[] =
              (metadata.Mood?.map((m: PlexTag) => m.tag.toLowerCase()) || []).filter(Boolean);

            const key = `${artist.toLowerCase()}|${album.toLowerCase()}`;
            plexAlbumGenreMap.set(key, genres);
            plexAlbumMoodMap.set(key, moods);
          }

          metadataCompleted++;

          // Update progress tracker
          if (jobId) {
            progressTracker.updateProgress(
              jobId,
              metadataCompleted,
              `Fetched metadata for ${metadataCompleted}/${albumPairs.length} albums`
            );
          }

          // Log progress every 100 albums
          if (metadataCompleted % 100 === 0) {
            const elapsed = (Date.now() - metadataStart) / 1000;
            const rate = metadataCompleted / elapsed;
            const remaining = albumPairs.length - metadataCompleted;
            const eta = remaining / rate;
            logger.info(
              {
                completed: metadataCompleted,
                total: albumPairs.length,
                rate: `${rate.toFixed(1)}/s`,
                eta: `${eta.toFixed(0)}s`
              },
              'fetching album metadata'
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${artist} - ${album}: ${errorMsg}`);
          logger.warn({ artist, album, error: errorMsg }, 'failed to fetch full album metadata');
        }
      })
    );

    await Promise.all(metadataTasks);

    const metadataElapsed = (Date.now() - metadataStart) / 1000;

    const avgGenresPerAlbum = plexAlbumGenreMap.size > 0
      ? (Array.from(plexAlbumGenreMap.values()).reduce((sum, genres) => sum + genres.length, 0) / plexAlbumGenreMap.size).toFixed(1)
      : '0.0';
    const avgMoodsPerAlbum = plexAlbumMoodMap.size > 0
      ? (Array.from(plexAlbumMoodMap.values()).reduce((sum, moods) => sum + moods.length, 0) / plexAlbumMoodMap.size).toFixed(1)
      : '0.0';

    logger.info(
      {
        totalAlbums: plexAlbumGenreMap.size,
        withGenres: Array.from(plexAlbumGenreMap.values()).filter((g) => g.length > 0).length,
        withMoods: Array.from(plexAlbumMoodMap.values()).filter((m) => m.length > 0).length,
        avgGenresPerAlbum,
        avgMoodsPerAlbum,
        elapsed: `${metadataElapsed.toFixed(1)}s`
      },
      'fetched full Plex metadata (separated Genre+Style and Mood) for albums'
    );

    // Now store the albums in cache using enrichment service
    const enrichmentService = getGenreEnrichmentService();

    // Populate Plex album genres and moods in enrichment service
    enrichmentService.setPlexAlbumGenres(plexAlbumGenreMap);
    enrichmentService.setPlexAlbumMoods(plexAlbumMoodMap);

    // Check for cancellation before caching
    if (signal?.aborted) {
      throw new Error('Album cache warming cancelled');
    }

    logger.info({ totalAlbums: albumPairs.length }, 'metadata fetch complete, starting cache write');

    // Cache all albums
    // Progress continues from albumPairs.length (metadata phase) to totalSteps (complete)
    let cacheCompleted = 0;
    const cacheTasks = albumPairs.map(({ artist, album }) =>
      limit(async () => {
        try {
          await enrichmentService.getGenresForAlbum(artist, album);
          cacheCompleted++;

          // Update progress tracker (add albumPairs.length offset from metadata phase)
          if (jobId) {
            await progressTracker.updateProgress(
              jobId,
              albumPairs.length + cacheCompleted,
              `Cached ${cacheCompleted}/${albumPairs.length} albums`
            );
          }

          // Call user-provided callback if exists
          if (onProgress) {
            onProgress(cacheCompleted, albumPairs.length);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${artist} - ${album}: ${errorMsg}`);
          logger.warn({ artist, album, error: errorMsg }, 'failed to cache album');
        }
      })
    );

    await Promise.all(cacheTasks);

    // Clear Plex album genre and mood cache to free memory
    enrichmentService.clearPlexAlbumGenres();
    enrichmentService.clearPlexAlbumMoods();

    logger.info(
      { totalAlbums: albumPairs.length, errors: errors.length },
      'album cache warm complete'
    );

    if (jobId) {
      await progressTracker.stopTracking(jobId);
      if (errors.length > 0) {
        await recordJobCompletion(jobId, 'failed', `Failed to cache ${errors.length} albums`);
      } else {
        await recordJobCompletion(jobId, 'success');
      }
    }

    return {
      totalAlbums: albumPairs.length,
      cached: albumPairs.length - errors.length,
      errors
    };
  } catch (error) {
    const errorMsg = formatUserError(error, 'warming album cache');
    if (jobId) {
      await progressTracker.stopTracking(jobId);
      await recordJobCompletion(jobId, 'failed', errorMsg);
    }
    throw error;
  }
}
