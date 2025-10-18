/**
 * Pattern Repository
 * Database operations for user pattern caching
 */

import { eq } from 'drizzle-orm';
import { addDays } from 'date-fns';

import { getDb } from '../db/index.js';
import { userPatterns } from '../db/schema.js';
import type { UserPatternsRecord } from '../db/schema.js';
import type { UserPatterns, HourlyGenrePreference } from './types.js';
import { logger } from '../logger.js';

/**
 * Default cache TTL (7 days)
 */
const CACHE_TTL_DAYS = 7;

/**
 * Type for inserting user patterns (accepts Date or number for timestamps)
 */
type UserPatternsInsert = typeof userPatterns.$inferInsert;

/**
 * Convert UserPatterns to database record format
 */
function toDbRecord(patterns: UserPatterns): Omit<UserPatternsInsert, 'id'> {
  const now = new Date();
  const expiresAt = addDays(now, CACHE_TTL_DAYS);

  return {
    hourlyGenrePreferences: JSON.stringify(patterns.hourlyGenrePreferences),
    peakHours: JSON.stringify(patterns.peakHours),
    sessionsAnalyzed: patterns.sessionsAnalyzed,
    analyzedFrom: patterns.analyzedFrom, // Keep as Date, Drizzle handles conversion
    analyzedTo: patterns.analyzedTo,
    lastAnalyzed: patterns.lastAnalyzed,
    expiresAt,
  };
}

/**
 * Convert database record to UserPatterns format
 */
function fromDbRecord(record: UserPatternsRecord): UserPatterns {
  return {
    hourlyGenrePreferences: JSON.parse(
      record.hourlyGenrePreferences
    ) as HourlyGenrePreference[],
    peakHours: JSON.parse(record.peakHours) as number[],
    sessionsAnalyzed: record.sessionsAnalyzed,
    analyzedFrom: new Date(record.analyzedFrom),
    analyzedTo: new Date(record.analyzedTo),
    lastAnalyzed: new Date(record.lastAnalyzed),
  };
}

/**
 * Check if cached patterns exist and are fresh
 * @returns true if cache exists and is not expired
 */
export async function isCacheFresh(): Promise<boolean> {
  const db = getDb();
  const now = Date.now();

  try {
    const records = await db.select().from(userPatterns).limit(1);

    if (records.length === 0) {
      logger.debug('no cached patterns found');
      return false;
    }

    const record = records[0];
    const isFresh = record.expiresAt.getTime() > now;

    logger.debug(
      {
        expiresAt: record.expiresAt.toISOString(),
        now: new Date(now).toISOString(),
        isFresh,
      },
      'checked pattern cache freshness'
    );

    return isFresh;
  } catch (error) {
    logger.error({ error }, 'failed to check cache freshness');
    return false;
  }
}

/**
 * Get cached user patterns
 * @returns UserPatterns if cache exists, null otherwise
 */
export async function getCachedPatterns(): Promise<UserPatterns | null> {
  const db = getDb();

  try {
    const records = await db.select().from(userPatterns).limit(1);

    if (records.length === 0) {
      return null;
    }

    const record = records[0];
    const patterns = fromDbRecord(record);

    logger.debug(
      {
        sessionsAnalyzed: patterns.sessionsAnalyzed,
        lastAnalyzed: patterns.lastAnalyzed.toISOString(),
        hourlyPreferences: patterns.hourlyGenrePreferences.length,
      },
      'retrieved cached patterns'
    );

    return patterns;
  } catch (error) {
    logger.error({ error }, 'failed to get cached patterns');
    return null;
  }
}

/**
 * Save or update user patterns in cache
 * Replaces existing cache (single-user deployment = one row)
 *
 * @param patterns - UserPatterns to cache
 */
export async function savePatternsToCache(
  patterns: UserPatterns
): Promise<void> {
  const db = getDb();

  try {
    const dbRecord = toDbRecord(patterns);

    // Check if record exists
    const existing = await db.select().from(userPatterns).limit(1);

    if (existing.length === 0) {
      // Insert new record
      await db.insert(userPatterns).values(dbRecord);
      logger.info('saved new pattern cache');
    } else {
      // Update existing record
      const existingId = existing[0].id;
      await db.update(userPatterns).set(dbRecord).where(eq(userPatterns.id, existingId));
      logger.info({ id: existingId }, 'updated pattern cache');
    }

    logger.debug(
      {
        sessionsAnalyzed: patterns.sessionsAnalyzed,
        hourlyPreferences: patterns.hourlyGenrePreferences.length,
        peakHours: patterns.peakHours,
        expiresAt: dbRecord.expiresAt.toISOString(),
      },
      'pattern cache saved successfully'
    );
  } catch (error) {
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'failed to save patterns to cache'
    );
    throw error;
  }
}

/**
 * Get user patterns with automatic cache refresh
 * - Returns cached patterns if fresh (<7 days old)
 * - Re-analyzes and caches if stale or missing
 *
 * @param forceRefresh - Force re-analysis even if cache is fresh
 * @param analyzePatterns - Function to analyze patterns (injected for testability)
 * @returns UserPatterns (from cache or freshly analyzed)
 */
export async function getPatternsWithCache(
  forceRefresh: boolean = false,
  analyzePatterns?: () => Promise<UserPatterns>
): Promise<UserPatterns | null> {
  // Check cache freshness
  if (!forceRefresh && (await isCacheFresh())) {
    logger.debug('using cached patterns (fresh)');
    return await getCachedPatterns();
  }

  // Cache is stale or force refresh requested
  if (!analyzePatterns) {
    logger.warn('cache is stale but no analyzePatterns function provided');
    return await getCachedPatterns(); // Return stale cache as fallback
  }

  logger.info(
    { forceRefresh },
    'pattern cache is stale or force refresh requested, re-analyzing'
  );

  try {
    const patterns = await analyzePatterns();
    await savePatternsToCache(patterns);
    return patterns;
  } catch (error) {
    logger.error({ error }, 'failed to analyze and cache patterns');

    // Fallback to stale cache if available
    const stalePatterns = await getCachedPatterns();
    if (stalePatterns) {
      logger.warn('returning stale cached patterns after analysis failure');
      return stalePatterns;
    }

    return null;
  }
}

/**
 * Clear all cached patterns
 * Useful for testing or manual cache invalidation
 */
export async function clearPatternsCache(): Promise<void> {
  const db = getDb();

  try {
    await db.delete(userPatterns);
    logger.info('cleared pattern cache');
  } catch (error) {
    logger.error({ error }, 'failed to clear pattern cache');
    throw error;
  }
}
