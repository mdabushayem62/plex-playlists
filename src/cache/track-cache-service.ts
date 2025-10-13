/**
 * Track Cache Service
 * Manages full library track metadata cache with tiered TTL refresh
 * Enables quality-first playlists beyond recent listening history
 */

import type { Track } from '@ctrl/plex';
import { eq, sql, and, or, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { trackCache, type TrackCacheRecord } from '../db/schema.js';
import { logger } from '../logger.js';
import { scanLibrary, fetchRecentlyAdded } from '../plex/library-scanner.js';
import { normalizeStarRating, normalizePlayCount } from '../scoring/weights.js';
import type { progressTracker } from '../utils/progress-tracker.js';

// Type alias for ProgressTracker instance type
type ProgressTracker = typeof progressTracker;

// Extended Track type with moods (not in @ctrl/plex type but exists at runtime)
type TrackWithMoods = Track & {
  moods?: Array<{ tag?: string }>;
};

// TTL constants (milliseconds)
const STATIC_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const STATS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Convert Plex Track object to cache record
 * Genres: Inherited from album_cache (Last.fm album-specific) → artist_cache (Last.fm artist-level) → Plex embedded
 * Moods: Always from Plex (unique to Plex)
 */
export const trackToCacheRecord = async (track: Track): Promise<Omit<TrackCacheRecord, 'lastUsedAt'>> => {
  const now = Date.now();

  // Extract artist and album names for enrichment lookup
  const artistName = track.grandparentTitle || 'Unknown Artist';
  const albumName = track.parentTitle || null;

  // Resolve genres with album-first strategy (lazy - uses cache only, no API calls)
  let genres: string[] = [];

  if (artistName && albumName) {
    // Try album-specific enriched genres first (BEST - Last.fm album tags!)
    const { getEnrichedAlbumGenres } = await import('../genre-enrichment.js');
    const albumGenres = await getEnrichedAlbumGenres(artistName, albumName);

    if (albumGenres && albumGenres.length > 0) {
      genres = albumGenres;
    }
  }

  // Fall back to artist-level enriched genres if album had none
  if (genres.length === 0 && artistName) {
    const { getEnrichedGenres } = await import('../genre-enrichment.js');
    const artistGenres = await getEnrichedGenres(artistName);

    if (artistGenres && artistGenres.length > 0) {
      genres = artistGenres;
    }
  }

  // Last resort: use Plex embedded genres
  if (genres.length === 0 && track.genres) {
    for (const genre of track.genres) {
      if (genre.tag) {
        genres.push(genre.tag);
      }
    }
  }

  // Moods always from Plex (unique source)
  const moods: string[] = [];
  const trackWithMoods = track as TrackWithMoods;
  if (trackWithMoods.moods) {
    for (const mood of trackWithMoods.moods) {
      if (mood.tag) {
        moods.push(mood.tag);
      }
    }
  }

  // Compute quality indicators
  const userRating = track.userRating || null;
  const viewCount = track.viewCount || 0;
  const skipCount = track.skipCount || 0;
  const isHighRated = userRating !== null && userRating >= 8;
  const isUnplayed = viewCount === 0;
  const isUnrated = userRating === null;

  // Compute quality score: 0.6*rating + 0.3*playCount + 0.1*recency
  let qualityScore: number | null = null;
  if (userRating !== null || viewCount > 0) {
    const ratingScore = userRating !== null ? normalizeStarRating(userRating) : 0;
    const playCountScore = normalizePlayCount(viewCount);
    // Recency score: tracks without lastViewedAt get 0
    const recencyScore = track.lastViewedAt
      ? Math.exp(-Math.log(2) * ((Date.now() - Number(track.lastViewedAt)) / (1000 * 60 * 60 * 24)) / 7) // 7-day half-life
      : 0;

    qualityScore = 0.6 * ratingScore + 0.3 * playCountScore + 0.1 * recencyScore;
  }

  return {
    ratingKey: track.ratingKey?.toString() || '',

    // Static metadata
    title: track.title || 'Unknown Title',
    artistName: track.grandparentTitle || 'Unknown Artist',
    albumName: track.parentTitle || null,
    duration: track.duration || null,
    year: track.year || null,
    trackIndex: track.index || null,
    isrc: null, // ISRC not available from Plex API yet
    parentRatingKey: track.parentRatingKey?.toString() || null,
    grandparentRatingKey: track.grandparentRatingKey?.toString() || null,
    genres: JSON.stringify(genres),
    moods: JSON.stringify(moods),
    staticCachedAt: new Date(now),
    staticExpiresAt: new Date(now + STATIC_TTL_MS),

    // Dynamic stats
    userRating,
    viewCount,
    skipCount,
    lastViewedAt: track.lastViewedAt ? new Date(track.lastViewedAt) : null,
    statsCachedAt: new Date(now),
    statsExpiresAt: new Date(now + STATS_TTL_MS),

    // Computed indicators
    qualityScore,
    isHighRated,
    isUnplayed,
    isUnrated
  };
};

/**
 * Insert or update a single track in cache
 */
export const upsertTrack = async (track: Track): Promise<void> => {
  const db = getDb();
  const record = await trackToCacheRecord(track);

  try {
    await db
      .insert(trackCache)
      .values({...record, lastUsedAt: null})
      .onConflictDoUpdate({
        target: trackCache.ratingKey,
        set: record
      });
  } catch (error) {
    logger.error(
      { error, ratingKey: record.ratingKey, title: record.title },
      'failed to upsert track to cache'
    );
    throw error;
  }
};

/**
 * Batch insert/update tracks to cache
 * More efficient than individual upserts for large batches
 */
export const batchUpsertTracks = async (tracks: Track[]): Promise<void> => {
  if (tracks.length === 0) return;

  const db = getDb();
  const records = await Promise.all(tracks.map(track => trackToCacheRecord(track)));

  try {
    // SQLite doesn't support bulk upsert well, so we'll do batches of inserts with conflict resolution
    const BATCH_SIZE = 50;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        await db
          .insert(trackCache)
          .values({...record, lastUsedAt: null})
          .onConflictDoUpdate({
            target: trackCache.ratingKey,
            set: record
          });
      }
    }

    logger.debug({ count: records.length }, 'batch upserted tracks to cache');
  } catch (error) {
    logger.error({ error, count: tracks.length }, 'failed to batch upsert tracks');
    throw error;
  }
};

/**
 * Update only dynamic stats for a track (keeps static metadata untouched)
 * Useful for incremental refresh operations
 */
export const updateTrackStats = async (track: Track): Promise<void> => {
  const db = getDb();
  const now = Date.now();

  const userRating = track.userRating || null;
  const viewCount = track.viewCount || 0;
  const skipCount = track.skipCount || 0;
  const isHighRated = userRating !== null && userRating >= 8;
  const isUnplayed = viewCount === 0;
  const isUnrated = userRating === null;

  // Recompute quality score
  let qualityScore: number | null = null;
  if (userRating !== null || viewCount > 0) {
    const ratingScore = userRating !== null ? normalizeStarRating(userRating) : 0;
    const playCountScore = normalizePlayCount(viewCount);
    const recencyScore = track.lastViewedAt
      ? Math.exp(-Math.log(2) * ((Date.now() - Number(track.lastViewedAt)) / (1000 * 60 * 60 * 24)) / 7)
      : 0;

    qualityScore = 0.6 * ratingScore + 0.3 * playCountScore + 0.1 * recencyScore;
  }

  try {
    await db
      .update(trackCache)
      .set({
        userRating,
        viewCount,
        skipCount,
        lastViewedAt: track.lastViewedAt ? new Date(track.lastViewedAt) : null,
        statsCachedAt: new Date(now),
        statsExpiresAt: new Date(now + STATS_TTL_MS),
        qualityScore,
        isHighRated,
        isUnplayed,
        isUnrated
      })
      .where(eq(trackCache.ratingKey, track.ratingKey?.toString() || ''));

    logger.debug(
      { ratingKey: track.ratingKey, rating: userRating, viewCount },
      'updated track stats in cache'
    );
  } catch (error) {
    logger.error({ error, ratingKey: track.ratingKey }, 'failed to update track stats');
    throw error;
  }
};

/**
 * Batch update stats for multiple tracks
 */
export const batchUpdateStats = async (tracks: Track[]): Promise<void> => {
  if (tracks.length === 0) return;

  for (const track of tracks) {
    try {
      await updateTrackStats(track);
    } catch (error) {
      logger.warn({ error, ratingKey: track.ratingKey }, 'failed to update track stats, skipping');
    }
  }

  logger.debug({ count: tracks.length }, 'batch updated track stats');
};

/**
 * Get track from cache by rating key
 * Returns null if not found or if stale (expired)
 */
export const getTrackFromCache = async (
  ratingKey: string,
  allowStale = false
): Promise<TrackCacheRecord | null> => {
  const db = getDb();

  try {
    const results = await db
      .select()
      .from(trackCache)
      .where(eq(trackCache.ratingKey, ratingKey))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const cached = results[0];

    // Check if stale
    if (!allowStale) {
      const now = Date.now();
      const staticExpired = cached.staticExpiresAt.getTime() < now;
      const statsExpired = cached.statsExpiresAt.getTime() < now;

      if (staticExpired || statsExpired) {
        logger.debug(
          { ratingKey, staticExpired, statsExpired },
          'cache entry expired'
        );
        return null; // Treat as cache miss
      }
    }

    return cached;
  } catch (error) {
    logger.error({ error, ratingKey }, 'failed to get track from cache');
    return null;
  }
};

/**
 * Get multiple tracks from cache by rating keys
 * Returns Map<ratingKey, TrackCacheRecord> (excludes missing/stale entries)
 */
export const getTracksFromCache = async (
  ratingKeys: string[],
  allowStale = false
): Promise<Map<string, TrackCacheRecord>> => {
  if (ratingKeys.length === 0) {
    return new Map();
  }

  const db = getDb();
  const results = new Map<string, TrackCacheRecord>();

  try {
    const cached = await db
      .select()
      .from(trackCache)
      .where(sql`${trackCache.ratingKey} IN (${sql.join(ratingKeys.map(k => sql`${k}`), sql`, `)})`)
      .all();

    const now = Date.now();

    for (const entry of cached) {
      // Check if stale
      if (!allowStale) {
        const staticExpired = entry.staticExpiresAt.getTime() < now;
        const statsExpired = entry.statsExpiresAt.getTime() < now;

        if (staticExpired || statsExpired) {
          continue; // Skip stale entries
        }
      }

      results.set(entry.ratingKey, entry);
    }

    logger.debug(
      { requested: ratingKeys.length, found: results.size },
      'fetched tracks from cache'
    );

    return results;
  } catch (error) {
    logger.error({ error, count: ratingKeys.length }, 'failed to get tracks from cache');
    return new Map();
  }
};

/**
 * Find tracks with expired stats (need refresh)
 * Used by incremental refresh job
 */
export const findTracksWithExpiredStats = async (limit: number = 5000): Promise<string[]> => {
  const db = getDb();
  const now = new Date();

  try {
    const results = await db
      .select({ ratingKey: trackCache.ratingKey })
      .from(trackCache)
      .where(lt(trackCache.statsExpiresAt, now))
      .orderBy(trackCache.lastUsedAt) // Prioritize recently used tracks
      .limit(limit);

    logger.debug(
      { count: results.length, limit },
      'found tracks with expired stats'
    );

    return results.map(r => r.ratingKey);
  } catch (error) {
    logger.error({ error }, 'failed to find expired tracks');
    return [];
  }
};

/**
 * Find tracks with expired static metadata
 * Used by weekly full refresh
 */
export const findTracksWithExpiredStatic = async (limit: number = 10000): Promise<string[]> => {
  const db = getDb();
  const now = new Date();

  try {
    const results = await db
      .select({ ratingKey: trackCache.ratingKey })
      .from(trackCache)
      .where(lt(trackCache.staticExpiresAt, now))
      .limit(limit);

    logger.debug(
      { count: results.length, limit },
      'found tracks with expired static metadata'
    );

    return results.map(r => r.ratingKey);
  } catch (error) {
    logger.error({ error }, 'failed to find expired static metadata');
    return [];
  }
};

/**
 * Get cache health statistics
 */
export interface CacheHealth {
  totalTracks: number;
  staleStatic: number;
  staleStats: number;
  coverage: number; // percentage of library cached
  avgAge: number; // average age in days
  byQuality: {
    highRated: number; // rating >= 8
    unrated: number;
    unplayed: number;
  };
}

export const getCacheHealth = async (): Promise<CacheHealth> => {
  const db = getDb();
  const now = new Date();
  const nowMs = now.getTime();

  try {
    // Total tracks
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackCache);
    const totalTracks = totalResult[0]?.count || 0;

    // Stale static
    const staleStaticResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackCache)
      .where(lt(trackCache.staticExpiresAt, now));
    const staleStatic = staleStaticResult[0]?.count || 0;

    // Stale stats
    const staleStatsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackCache)
      .where(lt(trackCache.statsExpiresAt, now));
    const staleStats = staleStatsResult[0]?.count || 0;

    // Average age
    const avgAgeResult = await db
      .select({ avgAge: sql<number>`AVG((${nowMs} - ${trackCache.statsCachedAt}) / (1000 * 60 * 60 * 24))` })
      .from(trackCache);
    const avgAge = avgAgeResult[0]?.avgAge || 0;

    // Quality breakdown
    const highRatedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackCache)
      .where(eq(trackCache.isHighRated, true));
    const highRated = highRatedResult[0]?.count || 0;

    const unratedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackCache)
      .where(eq(trackCache.isUnrated, true));
    const unrated = unratedResult[0]?.count || 0;

    const unplayedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackCache)
      .where(eq(trackCache.isUnplayed, true));
    const unplayed = unplayedResult[0]?.count || 0;

    return {
      totalTracks,
      staleStatic,
      staleStats,
      coverage: 100, // Assume 100% if we have cache (no direct Plex count API)
      avgAge,
      byQuality: {
        highRated,
        unrated,
        unplayed
      }
    };
  } catch (error) {
    logger.error({ error }, 'failed to get cache health');
    return {
      totalTracks: 0,
      staleStatic: 0,
      staleStats: 0,
      coverage: 0,
      avgAge: 0,
      byQuality: { highRated: 0, unrated: 0, unplayed: 0 }
    };
  }
};

/**
 * Clear entire cache (nuclear option)
 */
export const clearCache = async (): Promise<void> => {
  const db = getDb();

  try {
    await db.delete(trackCache);
    logger.info('cleared entire track cache');
  } catch (error) {
    logger.error({ error }, 'failed to clear cache');
    throw error;
  }
};

/**
 * Update last_used_at timestamp for tracks (for usage-based prioritization)
 */
export const touchTracks = async (ratingKeys: string[]): Promise<void> => {
  if (ratingKeys.length === 0) return;

  const db = getDb();
  const now = Date.now();

  try {
    await db
      .update(trackCache)
      .set({ lastUsedAt: new Date(now) })
      .where(sql`${trackCache.ratingKey} IN (${sql.join(ratingKeys.map(k => sql`${k}`), sql`, `)})`);

    logger.debug({ count: ratingKeys.length }, 'touched tracks (updated lastUsedAt)');
  } catch (error) {
    logger.warn({ error }, 'failed to touch tracks');
  }
};

// ==================== REFRESH STRATEGIES ====================

export interface SyncLibraryOptions {
  batchSize?: number;
  maxTracks?: number;
  onProgress?: (current: number, total: number) => void | Promise<void>;
  signal?: AbortSignal;
  jobId?: number; // For progress tracking
  progressTracker?: ProgressTracker;
}

/**
 * Full library sync - initial cache population
 * Fetches all tracks from Plex and populates cache
 *
 * Performance: ~30-45 minutes for 95k tracks (50 per batch, 1s per batch)
 */
export const syncLibrary = async (options: SyncLibraryOptions = {}): Promise<void> => {
  const { batchSize = 50, maxTracks, signal, jobId, progressTracker } = options;

  logger.info({ batchSize, maxTracks }, 'starting full library sync');

  try {
    const { tracks, totalFetched, cancelled } = await scanLibrary({
      batchSize,
      maxTracks,
      signal,
      onProgress: async (current, total, batch) => {
        // Upsert batch to cache
        await batchUpsertTracks(batch);

        // Update progress tracker if provided
        if (progressTracker && jobId) {
          await progressTracker.update(jobId, {
            current,
            total,
            message: `Scanned ${current}/${total} tracks`
          });
        }

        // Call user callback
        if (options.onProgress) {
          await options.onProgress(current, total);
        }
      }
    });

    if (cancelled) {
      logger.warn({ totalFetched }, 'library sync cancelled');
      return;
    }

    logger.info(
      { totalFetched, tracksCached: tracks.length },
      'full library sync completed'
    );
  } catch (error) {
    logger.error({ error }, 'library sync failed');
    throw error;
  }
};

/**
 * Incremental refresh - update expired stats
 * Fetches and updates tracks with expired stats (24h TTL)
 *
 * Performance: ~2-3 minutes for 5k tracks
 */
export const refreshExpiredStats = async (options: {
  limit?: number;
  signal?: AbortSignal;
  jobId?: number;
  progressTracker?: ProgressTracker;
} = {}): Promise<void> => {
  const { limit = 5000, signal, jobId, progressTracker } = options;

  logger.info({ limit }, 'starting incremental stats refresh');

  try {
    const expiredKeys = await findTracksWithExpiredStats(limit);

    if (expiredKeys.length === 0) {
      logger.info('no expired stats found, nothing to refresh');
      return;
    }

    // Fetch fresh Track objects from Plex
    const BATCH_SIZE = 50;
    let refreshed = 0;

    for (let i = 0; i < expiredKeys.length; i += BATCH_SIZE) {
      if (signal?.aborted) {
        logger.info({ refreshed }, 'stats refresh cancelled');
        return;
      }

      const batch = expiredKeys.slice(i, i + BATCH_SIZE);

      // Fetch tracks from Plex (using existing fetchTracksByRatingKeys)
      const { fetchTracksByRatingKeys } = await import('../plex/tracks.js');
      const tracksMap = await fetchTracksByRatingKeys(batch);

      // Update stats for fetched tracks
      const tracks = Array.from(tracksMap.values());
      await batchUpdateStats(tracks);

      refreshed += tracks.length;

      // Update progress
      if (progressTracker && jobId) {
        await progressTracker.update(jobId, {
          current: refreshed,
          total: expiredKeys.length,
          message: `Refreshed ${refreshed}/${expiredKeys.length} track stats`
        });
      }

      logger.debug(
        { batchSize: tracks.length, totalRefreshed: refreshed, total: expiredKeys.length },
        'refreshed stats batch'
      );
    }

    logger.info(
      { refreshed, requested: expiredKeys.length },
      'incremental stats refresh completed'
    );
  } catch (error) {
    logger.error({ error }, 'stats refresh failed');
    throw error;
  }
};

/**
 * Detect and sync new tracks added to library
 * Fetches tracks added in last N days and adds to cache
 *
 * Performance: <1 second for typical 0-10 new tracks/day
 */
export const syncRecentlyAdded = async (days: number = 1): Promise<void> => {
  logger.info({ days }, 'syncing recently added tracks');

  try {
    const newTracks = await fetchRecentlyAdded(days);

    if (newTracks.length === 0) {
      logger.debug({ days }, 'no new tracks found');
      return;
    }

    await batchUpsertTracks(newTracks);

    logger.info(
      { count: newTracks.length, days },
      'synced recently added tracks'
    );
  } catch (error) {
    logger.error({ error, days }, 'failed to sync recently added tracks');
    throw error;
  }
};

/**
 * Full refresh - update both static and stats for all tracks
 * Useful for weekly maintenance to catch all changes
 *
 * Performance: ~30-45 minutes for 95k tracks (same as initial sync)
 */
export const fullRefresh = async (options: SyncLibraryOptions = {}): Promise<void> => {
  logger.info('starting full refresh (re-sync entire library)');

  // Full refresh is same as initial sync (upserts all tracks)
  await syncLibrary(options);

  logger.info('full refresh completed');
};

/**
 * Query tracks from cache with filters
 * Used by quality-first playlist generators
 */
export interface TrackQueryOptions {
  minRating?: number;
  maxViewCount?: number;
  minViewCount?: number;
  genres?: string[]; // Match ANY genre
  moods?: string[]; // Match ANY mood
  unplayedOnly?: boolean;
  unratedOnly?: boolean;
  highRatedOnly?: boolean;
  excludeRecentlyPlayed?: number; // Days
  limit?: number;
  orderBy?: 'qualityScore' | 'userRating' | 'viewCount' | 'lastViewedAt';
  orderDirection?: 'asc' | 'desc';
}

export const queryTracks = async (options: TrackQueryOptions = {}): Promise<TrackCacheRecord[]> => {
  const {
    minRating,
    maxViewCount,
    minViewCount,
    genres,
    moods,
    unplayedOnly,
    unratedOnly,
    highRatedOnly,
    excludeRecentlyPlayed,
    limit = 100,
    orderBy = 'qualityScore',
    orderDirection = 'desc'
  } = options;

  const db = getDb();
  const now = Date.now();

  try {
    let query = db.select().from(trackCache);

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (minRating !== undefined) {
      conditions.push(sql`${trackCache.userRating} >= ${minRating}`);
    }

    if (maxViewCount !== undefined) {
      conditions.push(sql`${trackCache.viewCount} <= ${maxViewCount}`);
    }

    if (minViewCount !== undefined) {
      conditions.push(sql`${trackCache.viewCount} >= ${minViewCount}`);
    }

    if (unplayedOnly) {
      conditions.push(eq(trackCache.isUnplayed, true));
    }

    if (unratedOnly) {
      conditions.push(eq(trackCache.isUnrated, true));
    }

    if (highRatedOnly) {
      conditions.push(eq(trackCache.isHighRated, true));
    }

    if (excludeRecentlyPlayed !== undefined) {
      const cutoff = now - (excludeRecentlyPlayed * 24 * 60 * 60 * 1000);
      conditions.push(
        or(
          sql`${trackCache.lastViewedAt} IS NULL`,
          sql`${trackCache.lastViewedAt} < ${cutoff}`
        )!
      );
    }

    // Genre filtering (match ANY)
    if (genres && genres.length > 0) {
      const genreConditions = genres.map(genre =>
        sql`${trackCache.genres} LIKE ${'%' + genre + '%'}`
      );
      conditions.push(or(...genreConditions)!);
    }

    // Mood filtering (match ANY)
    if (moods && moods.length > 0) {
      const moodConditions = moods.map(mood =>
        sql`${trackCache.moods} LIKE ${'%' + mood + '%'}`
      );
      conditions.push(or(...moodConditions)!);
    }

    // Apply WHERE conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Order by
    const orderColumn = {
      qualityScore: trackCache.qualityScore,
      userRating: trackCache.userRating,
      viewCount: trackCache.viewCount,
      lastViewedAt: trackCache.lastViewedAt
    }[orderBy];

    if (orderDirection === 'desc') {
      query = query.orderBy(sql`${orderColumn} DESC`) as typeof query;
    } else {
      query = query.orderBy(sql`${orderColumn} ASC`) as typeof query;
    }

    // Limit
    query = query.limit(limit) as typeof query;

    const results = await query.all();

    logger.debug(
      { count: results.length, options },
      'queried tracks from cache'
    );

    return results;
  } catch (error) {
    logger.error({ error, options }, 'failed to query tracks from cache');
    return [];
  }
};
