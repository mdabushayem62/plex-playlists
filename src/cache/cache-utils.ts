/**
 * Cache utilities for TTL management and refresh strategies
 */

import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/index.js';
import type { genreCache as GenreCacheTable } from '../db/schema.js';

/**
 * Calculate a jittered TTL to prevent thundering herd problem
 *
 * @param baseTTLDays Base TTL in days (e.g., 90)
 * @param jitterPercent Jitter as percentage (0.10 = ±10%)
 * @returns TTL in milliseconds with random jitter applied
 *
 * @example
 * // 90 days ± 10% = 81-99 days randomly
 * const ttl = getJitteredTTL(90, 0.10);
 */
export function getJitteredTTL(baseTTLDays: number, jitterPercent = 0.10): number {
  const jitterDays = baseTTLDays * jitterPercent;
  const actualTTLDays = baseTTLDays + (Math.random() * jitterDays * 2 - jitterDays);
  return actualTTLDays * 24 * 60 * 60 * 1000;
}

/**
 * Calculate expiration timestamp with jitter
 *
 * @param baseTTLDays Base TTL in days
 * @param jitterPercent Jitter percentage (default 10%)
 * @returns Expiration timestamp in milliseconds
 */
export function getExpirationTimestamp(baseTTLDays: number, jitterPercent = 0.10): number {
  return Date.now() + getJitteredTTL(baseTTLDays, jitterPercent);
}

/**
 * Configuration for cache refresh strategies
 */
export const CACHE_REFRESH_CONFIG = {
  // Base TTL for cache entries (days)
  BASE_TTL_DAYS: 90,

  // Jitter percentage to prevent thundering herd (±10%)
  TTL_JITTER_PERCENT: 0.10,

  // Daily batch limit for refreshes (prevents API abuse)
  DAILY_REFRESH_LIMIT: 250,

  // Hourly micro-refresh limit (distributed throughout day)
  HOURLY_REFRESH_LIMIT: 10,

  // Look ahead window for finding expiring entries (days)
  REFRESH_LOOKAHEAD_DAYS: 7,

  // Usage-based refresh tiers (Phase 3)
  USAGE_TIERS: {
    // Tier 1 (Hot): Recently used in playlists
    HOT: {
      LAST_USED_THRESHOLD_DAYS: 30,    // Used within last 30 days
      REFRESH_AGE_DAYS: 60,             // Refresh when cache is 60+ days old
      PRIORITY: 1                        // Highest priority
    },
    // Tier 2 (Warm): Used occasionally
    WARM: {
      LAST_USED_THRESHOLD_DAYS: 180,   // Used 30-180 days ago
      REFRESH_AGE_DAYS: 120,            // Refresh when cache is 120+ days old
      PRIORITY: 2                        // Medium priority
    },
    // Tier 3 (Cold): Rarely or never used
    COLD: {
      REFRESH_AGE_DAYS: 365,            // Refresh when cache is 365+ days old
      PRIORITY: 3                        // Lowest priority
    }
  }
} as const;

/**
 * Update last_used_at timestamp for cache entries (for usage tracking)
 * This is used to track which entries are actively used in playlists
 * for future usage-based refresh prioritization (Phase 3)
 *
 * @param db Database instance
 * @param artistNames Array of artist names to mark as used
 */
export async function markCacheAsUsed(
  db: DatabaseClient,
  genreCache: typeof GenreCacheTable,
  artistNames: string[]
): Promise<void> {
  if (artistNames.length === 0) return;

  const now = new Date();
  const normalizedNames = artistNames.map(n => n.toLowerCase());

  // Batch update all artists at once
  // Note: This is infrastructure for Phase 3 (usage-based prioritization)
  // Currently not called during playlist generation to avoid performance impact
  for (const name of normalizedNames) {
    try {
      await db
        .update(genreCache)
        .set({ lastUsedAt: now })
        .where(eq(genreCache.artistName, name));
    } catch (error) {
      // Silently fail - usage tracking is non-critical
      console.warn(`Failed to update last_used_at for ${name}:`, error);
    }
  }
}
