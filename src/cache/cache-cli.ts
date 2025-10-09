import type { MusicSection, Section } from '@ctrl/plex';
import { getPlexServer } from '../plex/client.js';
import { getGenreEnrichmentService } from '../genre-enrichment.js';
import { getDb } from '../db/index.js';
import { genreCache } from '../db/schema.js';
import { logger } from '../logger.js';
import { lt } from 'drizzle-orm';

interface CacheStats {
  totalEntries: number;
  bySource: Record<string, number>;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  expiringWithin7Days: number;
  expired: number;
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
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const db = getDb();
  const entries = await db.select().from(genreCache);

  const stats: CacheStats = {
    totalEntries: entries.length,
    bySource: {},
    oldestEntry: null,
    newestEntry: null,
    expiringWithin7Days: 0,
    expired: 0
  };

  const now = new Date();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const deleted = await db
    .delete(genreCache)
    .where(lt(genreCache.expiresAt, now))
    .returning();

  logger.info({ count: deleted.length }, 'cleared expired cache entries');
  return deleted.length;
}

/**
 * Clear all cache entries
 */
export async function clearAllCache(): Promise<number> {
  const db = getDb();

  const deleted = await db
    .delete(genreCache)
    .returning();

  logger.info({ count: deleted.length }, 'cleared all cache entries');
  return deleted.length;
}

/**
 * Warm the cache by fetching genres for all artists in Plex library
 */
export async function warmCache(options: {
  concurrency?: number;
  dryRun?: boolean;
  onProgress?: (completed: number, total: number) => void;
} = {}): Promise<{ totalArtists: number; cached: number; errors: string[] }> {
  const { concurrency = 3, dryRun = false, onProgress } = options;

  logger.info({ concurrency, dryRun }, 'starting cache warm');

  // Fetch all artists from Plex
  const musicSection = await findMusicSection();

  logger.info('fetching all artists from plex library');
  const artists = await musicSection.all();

  const artistNames = artists
    .filter(artist => artist.type === 'artist' && artist.title)
    .map(artist => artist.title);

  logger.info({ totalArtists: artistNames.length }, 'artists found in plex library');

  if (dryRun) {
    logger.info('dry-run mode, skipping genre fetch');
    return { totalArtists: artistNames.length, cached: 0, errors: [] };
  }

  // Use the bulk fetch method with concurrency
  const enrichmentService = getGenreEnrichmentService();
  const errors: string[] = [];

  try {
    await enrichmentService.getGenresForArtists(artistNames, {
      concurrency,
      onProgress
    });

    logger.info({ totalArtists: artistNames.length }, 'cache warm complete');

    return {
      totalArtists: artistNames.length,
      cached: artistNames.length,
      errors
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    logger.error({ error: errorMsg }, 'cache warm failed');

    return {
      totalArtists: artistNames.length,
      cached: 0,
      errors
    };
  }
}
