/**
 * Listening History Cache Service
 *
 * Incremental caching of Plex listening history to avoid repeated expensive API calls.
 *
 * Strategy:
 * - First load: Backfill last 90 days from Plex (~10K items, 10-15s one-time cost)
 * - Subsequent loads: Only fetch NEW items since last cache update (<1s)
 * - Analytics queries read from local DB instead of Plex (instant)
 *
 * Benefits:
 * - 99% reduction in Plex API calls after initial backfill
 * - Sub-second analytics page loads
 * - Preserves history beyond Plex's 90-day window
 * - Enables historical trend analysis
 */

import { getDb } from '../db/index.js';
import { listeningHistoryCache } from '../db/schema.js';
import { desc, sql, gte } from 'drizzle-orm';
import { getPlexServer } from '../plex/client.js';
import { logger } from '../logger.js';

export interface HistoryItem {
  ratingKey: string;
  viewedAt: number; // Unix timestamp (ms)
  title: string;
  artistName: string;
  albumName?: string;
  metadata: unknown; // Full Plex history item
}

export interface FetchHistoryOptions {
  /** Only return items since this date */
  since?: Date;
  /** Max number of items to return */
  limit?: number;
}

/**
 * Get the most recent viewedAt timestamp from our cache
 * Used to determine where to start incremental updates
 */
async function getLastCachedTimestamp(): Promise<Date | null> {
  const db = getDb();

  const result = await db
    .select({ viewedAt: listeningHistoryCache.viewedAt })
    .from(listeningHistoryCache)
    .orderBy(desc(listeningHistoryCache.viewedAt))
    .limit(1);

  return result.length > 0 ? result[0].viewedAt : null;
}

/**
 * Get count of cached history items
 */
async function getCachedCount(): Promise<number> {
  const db = getDb();

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(listeningHistoryCache);

  return result[0]?.count || 0;
}

/**
 * Store history items in the cache
 * Handles deduplication via unique constraint (ratingKey, viewedAt)
 */
async function storeHistoryItems(items: HistoryItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const db = getDb();
  let stored = 0;

  // Insert in batches to avoid SQL query size limits
  const batchSize = 500;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    try {
      await db.insert(listeningHistoryCache).values(
        batch.map(item => ({
          ratingKey: item.ratingKey,
          viewedAt: new Date(item.viewedAt), // Convert timestamp to Date for Drizzle
          accountId: null, // Single-user deployment
          title: item.title,
          artistName: item.artistName,
          albumName: item.albumName || null,
          metadata: JSON.stringify(item.metadata)
        }))
      ).onConflictDoNothing(); // Skip duplicates

      stored += batch.length;
    } catch (error) {
      logger.error(
        { error, batchStart: i, batchEnd: i + batch.length },
        'Failed to insert history batch'
      );
      // Continue with next batch
    }
  }

  return stored;
}

/**
 * Parse Plex history items into our normalized format
 */
function parseHistoryItems(plexHistory: unknown[]): HistoryItem[] {
  return plexHistory.map((item: unknown) => {
    const i = item as Record<string, unknown>;
    const track = i.track as Record<string, unknown> | undefined;
    return {
      ratingKey: String(i.ratingKey || ''),
      viewedAt: i.viewedAt ? (i.viewedAt as number) * 1000 : Date.now(), // Plex uses seconds, we use ms
      title: String(i.title || track?.title || 'Unknown'),
      artistName: String(i.grandparentTitle || track?.grandparentTitle || 'Unknown Artist'),
      albumName: (i.parentTitle as string | undefined) || (track?.parentTitle as string | undefined) || undefined,
      metadata: item // Store full item for future analytics
    };
  });
}

/**
 * Backfill cache with initial history from Plex
 * Called on first analytics page load or when cache is empty
 */
async function backfillCache(daysBack: number = 90): Promise<number> {
  const server = await getPlexServer();
  const mindate = new Date();
  mindate.setDate(mindate.getDate() - daysBack);

  logger.info(`Backfilling listening history cache (last ${daysBack} days)...`);

  const startTime = Date.now();
  const plexHistory = await server.history(10000, mindate);
  const items = parseHistoryItems(plexHistory);
  const stored = await storeHistoryItems(items);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`Backfill complete: ${stored} items stored in ${duration}s`);

  return stored;
}

/**
 * Fetch only NEW history items since last cache update
 * Much faster than full backfill (typically <1s)
 */
async function incrementalUpdate(): Promise<number> {
  const lastTimestamp = await getLastCachedTimestamp();

  if (!lastTimestamp) {
    // Cache is empty, do full backfill
    return backfillCache();
  }

  const server = await getPlexServer();
  const mindate = lastTimestamp; // Already a Date object

  logger.debug(`Fetching new history items since ${mindate.toISOString()}...`);

  const startTime = Date.now();
  const plexHistory = await server.history(500, mindate); // Small limit for new items
  const items = parseHistoryItems(plexHistory);

  // Filter out items we already have (shouldn't happen due to mindate, but be safe)
  const lastTimestampMs = lastTimestamp.getTime();
  const newItems = items.filter(item => item.viewedAt > lastTimestampMs);

  if (newItems.length === 0) {
    logger.debug('No new history items to cache');
    return 0;
  }

  const stored = await storeHistoryItems(newItems);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`Incremental update: ${stored} new items stored in ${duration}s`);

  return stored;
}

/**
 * Get listening history from cache
 * Replaces expensive Plex API calls with fast local DB query
 */
export async function getHistoryFromCache(options: FetchHistoryOptions = {}): Promise<unknown[]> {
  const db = getDb();
  const { since, limit = 10000 } = options;

  // Build query with all clauses at once to avoid type issues
  const baseQuery = db
    .select({
      metadata: listeningHistoryCache.metadata
    })
    .from(listeningHistoryCache);

  const results = since
    ? await baseQuery
        .where(gte(listeningHistoryCache.viewedAt, since))
        .orderBy(desc(listeningHistoryCache.viewedAt))
        .limit(limit)
    : await baseQuery
        .orderBy(desc(listeningHistoryCache.viewedAt))
        .limit(limit);

  // Parse JSON metadata back into objects
  return results.map(row => JSON.parse(row.metadata));
}

/**
 * Update cache with latest history from Plex
 * Automatically determines if backfill or incremental update is needed
 *
 * Returns number of items added
 */
export async function updateHistoryCache(): Promise<number> {
  const cachedCount = await getCachedCount();

  if (cachedCount === 0) {
    logger.info('History cache is empty, performing initial backfill...');
    return backfillCache();
  }

  return incrementalUpdate();
}

/**
 * Get cache statistics for monitoring
 */
export async function getHistoryCacheStats() {
  const db = getDb();

  const [count, oldest, newest] = await Promise.all([
    getCachedCount(),
    db.select({ viewedAt: listeningHistoryCache.viewedAt })
      .from(listeningHistoryCache)
      .orderBy(listeningHistoryCache.viewedAt)
      .limit(1),
    db.select({ viewedAt: listeningHistoryCache.viewedAt })
      .from(listeningHistoryCache)
      .orderBy(desc(listeningHistoryCache.viewedAt))
      .limit(1)
  ]);

  return {
    totalEntries: count,
    oldestEntry: oldest.length > 0 ? new Date(oldest[0].viewedAt) : null,
    newestEntry: newest.length > 0 ? new Date(newest[0].viewedAt) : null,
    estimatedSizeMB: (count * 0.001).toFixed(2) // Rough estimate: ~1KB per entry
  };
}
