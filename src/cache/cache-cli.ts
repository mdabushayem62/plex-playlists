import type { MusicSection, Section } from '@ctrl/plex';
import { getPlexServer } from '../plex/client.js';
import { getGenreEnrichmentService } from '../genre-enrichment.js';
import { getDb } from '../db/index.js';
import { genreCache, albumGenreCache } from '../db/schema.js';
import { logger } from '../logger.js';
import { lt, sql } from 'drizzle-orm';
import { recordJobStart, recordJobCompletion } from '../db/repository.js';
import { formatUserError } from '../utils/error-formatter.js';
import { progressTracker } from '../utils/progress-tracker.js';

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
  const artistEntries = await db.select().from(genreCache);
  const albumEntries = await db.select().from(albumGenreCache);

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
    .delete(genreCache)
    .where(lt(genreCache.expiresAt, now))
    .returning();

  const deletedAlbums = await db
    .delete(albumGenreCache)
    .where(lt(albumGenreCache.expiresAt, now))
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
    .delete(genreCache)
    .returning();

  const deletedAlbums = await db
    .delete(albumGenreCache)
    .returning();

  const total = deletedArtists.length + deletedAlbums.length;
  logger.info(
    { count: total, artists: deletedArtists.length, albums: deletedAlbums.length },
    'cleared all cache entries'
  );
  return total;
}

/**
 * Refresh cache entries that are expiring soon
 * @param daysAhead Number of days to look ahead for expiring entries (default: 7)
 */
export async function refreshExpiringCache(options: {
  daysAhead?: number;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
} = {}): Promise<{ total: number; refreshed: number; errors: string[] }> {
  const { daysAhead = 7, concurrency = 10, onProgress } = options;
  const jobId = await recordJobStart('cache-refresh');

  try {
    const db = getDb();
    const now = new Date();
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    logger.info({ daysAhead, concurrency }, 'refreshing expiring cache entries');

    // Find entries expiring within the specified timeframe
    const expiring = await db
      .select({ artistName: genreCache.artistName })
      .from(genreCache)
      .where(
        sql`${genreCache.expiresAt} IS NOT NULL AND ${genreCache.expiresAt} > ${now} AND ${genreCache.expiresAt} <= ${futureDate}`
      );

    const artistNames = expiring.map(row => row.artistName);

    logger.info({ total: artistNames.length }, 'found expiring cache entries');

    if (artistNames.length === 0) {
      if (jobId) await recordJobCompletion(jobId, 'success');
      return { total: 0, refreshed: 0, errors: [] };
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
        errors
      };
    } catch (error) {
      const errorMsg = formatUserError(error, 'refreshing genre cache');
      errors.push(errorMsg);
      logger.error({ error: errorMsg }, 'cache refresh failed');

      if (jobId) {
        await progressTracker.stopTracking(jobId);
        await recordJobCompletion(jobId, 'failed', errorMsg);
      }

      return {
        total: artistNames.length,
        refreshed: 0,
        errors
      };
    }
  } catch (error) {
    const errorMsg = formatUserError(error, 'refreshing genre cache');
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
    .select({ artistName: genreCache.artistName, expiresAt: genreCache.expiresAt })
    .from(genreCache);

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
} = {}): Promise<{ totalArtists: number; cached: number; errors: string[] }> {
  const { concurrency = 10, dryRun = false, onProgress, skipCached = true } = options;
  const jobId = await recordJobStart('cache-warm');

  try {
    logger.info({ concurrency, dryRun, skipCached }, 'starting artist cache warm');

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

    // Use the bulk fetch method with concurrency
    const enrichmentService = getGenreEnrichmentService();
    const errors: string[] = [];

    // Start progress tracking
    if (jobId) {
      progressTracker.startTracking(jobId, artistNames.length, 'Warming artist cache');
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
        }
      });

      logger.info({ totalArtists: artistNames.length }, 'artist cache warm complete');

      if (jobId) {
        await progressTracker.stopTracking(jobId);
        await recordJobCompletion(jobId, 'success');
      }

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
  albums: Array<{ artist: string; album: string }>
): Promise<Array<{ artist: string; album: string }>> {
  if (albums.length === 0) {
    return [];
  }

  const db = getDb();
  const now = new Date();

  // Build a map of normalized names to originals
  const albumMap = new Map<string, { artist: string; album: string }>();
  albums.forEach(item => {
    const key = `${item.artist.toLowerCase()}|${item.album.toLowerCase()}`;
    albumMap.set(key, item);
  });

  // Find all cached albums that haven't expired
  const allCached = await db
    .select({
      artistName: albumGenreCache.artistName,
      albumName: albumGenreCache.albumName,
      expiresAt: albumGenreCache.expiresAt
    })
    .from(albumGenreCache);

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
} = {}): Promise<{ totalAlbums: number; cached: number; errors: string[] }> {
  const { concurrency = 10, dryRun = false, onProgress, skipCached = true } = options;
  const jobId = await recordJobStart('album-cache-warm');

  try {
    logger.info({ concurrency, dryRun, skipCached }, 'starting album cache warm');

    // Fetch all artists from Plex (musicSection.all() returns artists, not albums)
    const musicSection = await findMusicSection();

    logger.info('fetching all tracks to extract unique albums');

    // Fetch all tracks and extract unique album/artist pairs
    // This is more reliable than trying to get albums directly
    const allTracks = await musicSection.searchTracks({ limit: 999999 });

    logger.info({ totalTracks: allTracks.length }, 'tracks fetched, extracting unique albums');

    // Use a Set to deduplicate albums by "artist|album" key
    const albumSet = new Set<string>();
    let albumPairs: Array<{ artist: string; album: string }> = [];

    for (const track of allTracks) {
      const artistName = track.grandparentTitle; // Artist
      const albumName = track.parentTitle; // Album

      if (artistName && albumName) {
        const key = `${artistName.toLowerCase()}|${albumName.toLowerCase()}`;

        if (!albumSet.has(key)) {
          albumSet.add(key);
          albumPairs.push({
            artist: artistName,
            album: albumName
          });
        }
      }
    }

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

    // Fetch genres for each album with concurrency control
    const enrichmentService = getGenreEnrichmentService();
    const errors: string[] = [];

    // Start progress tracking
    if (jobId) {
      progressTracker.startTracking(jobId, albumPairs.length, 'Warming album cache');
    }

    // Use dynamic import for p-limit
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);

    let completed = 0;
    const tasks = albumPairs.map(({ artist, album }) =>
      limit(async () => {
        try {
          await enrichmentService.getGenresForAlbum(artist, album);
          completed++;

          // Update progress tracker
          if (jobId) {
            await progressTracker.updateProgress(
              jobId,
              completed,
              `Cached ${completed}/${albumPairs.length} albums`
            );
          }

          // Call user-provided callback if exists
          if (onProgress) {
            onProgress(completed, albumPairs.length);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${artist} - ${album}: ${errorMsg}`);
          logger.warn({ artist, album, error: errorMsg }, 'failed to fetch album genres');
        }
      })
    );

    await Promise.all(tasks);

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
