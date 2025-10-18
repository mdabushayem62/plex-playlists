import { subDays } from 'date-fns';
import type { HistoryResult } from '@ctrl/plex';

import { logger } from '../logger.js';
import { getPlexServer } from '../plex/client.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import { calculateScore } from '../scoring/strategies.js';
import type { CandidateTrack } from './candidate-builder.js';
import { getDb } from '../db/index.js';
import { artistCache } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getEffectiveConfig } from '../db/settings-service.js';

export interface ThrowbackTrack extends CandidateTrack {
  lastPlayedAt: Date;
  daysSincePlay: number;
  playCountInWindow: number;
  throwbackScore: number;
  playCount: number;
}

/**
 * Fetch tracks for throwback playlist
 * Focuses on nostalgic tracks from 2-5 years ago that you loved back then
 *
 * Strategy:
 * - Filter: Played between lookbackStart and lookbackEnd days ago
 * - Exclude: Tracks played in last N days (maintain freshness)
 * - Score: nostalgia (older = better) × playCount × userRating
 * - Prioritize: Your "favorites from the past" that you haven't heard recently
 *
 * @param targetSize - Target playlist size (default: 50)
 * @param lookbackStart - Start of lookback window in days (default: 730 = 2 years)
 * @param lookbackEnd - End of lookback window in days (default: 1825 = 5 years)
 * @param recentExclusion - Exclude tracks played in last N days (default: 90)
 * @returns Array of throwback tracks sorted by throwback score
 */
export const fetchThrowbackTracks = async (
  targetSize?: number,
  lookbackStart?: number,
  lookbackEnd?: number,
  recentExclusion?: number
): Promise<ThrowbackTrack[]> => {
  const server = await getPlexServer();
  const now = new Date();

  // Load configurable settings from database (with env fallbacks)
  const config = await getEffectiveConfig();
  const finalTargetSize = targetSize ?? config.playlistTargetSize;
  let finalLookbackStart = lookbackStart ?? config.throwbackLookbackStart;
  let finalLookbackEnd = lookbackEnd ?? config.throwbackLookbackEnd;
  const finalRecentExclusion = recentExclusion ?? config.throwbackRecentExclusion;

  // If using default config, check if we need to adapt the window
  // Only adapt if caller hasn't explicitly specified custom windows
  let adaptiveWindow: string | null = null;
  if (lookbackStart === undefined && lookbackEnd === undefined) {
    const historyDepth = await getHistoryDepth();

    if (historyDepth !== null && historyDepth < finalLookbackEnd) {
      // Not enough history for configured window, use adaptive approach
      const adaptive = await determineAdaptiveLookbackWindow(historyDepth);

      if (adaptive === null) {
        throw new Error(
          `Insufficient listening history for throwback playlist. Found ${historyDepth} days of history, but need at least 90 days (3 months) for throwback concept.`
        );
      }

      finalLookbackStart = adaptive.start;
      finalLookbackEnd = adaptive.end;
      adaptiveWindow = adaptive.label;

      logger.info(
        {
          historyDepth,
          originalWindow: { start: config.throwbackLookbackStart, end: config.throwbackLookbackEnd },
          adaptedWindow: { start: finalLookbackStart, end: finalLookbackEnd, label: adaptiveWindow }
        },
        'using adaptive lookback window due to limited history'
      );
    }
  }

  // Define lookback window (e.g., 2-5 years ago)
  const windowStart = subDays(now, finalLookbackEnd);
  const windowEnd = subDays(now, finalLookbackStart);
  const recentThreshold = subDays(now, finalRecentExclusion);

  logger.info(
    {
      targetSize: finalTargetSize,
      lookbackStart: finalLookbackStart,
      lookbackEnd: finalLookbackEnd,
      recentExclusion: finalRecentExclusion,
      lookbackWindow: {
        start: windowStart.toISOString().split('T')[0],
        end: windowEnd.toISOString().split('T')[0]
      },
      recentThreshold: recentThreshold.toISOString().split('T')[0]
    },
    'fetching tracks for throwback playlist'
  );

  // Get music library section ID for filtering
  const library = await server.library();
  const sections = await library.sections();
  const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');

  if (!musicSection) {
    logger.warn('no music library section found');
    return [];
  }

  // Fetch history from the lookback window with pagination
  // Plex history() fetches from mindate to now, so we fetch and filter in memory
  const allHistory: HistoryResult[] = [];
  const pageSize = 500;
  const maxHistoryEntries = 10000; // Limit for performance
  const candidates: ThrowbackTrack[] = []; // Declare here to be accessible outside try-catch

  try {
    while (allHistory.length < maxHistoryEntries) {
      const batch = await server.history(pageSize, windowStart, undefined, undefined, musicSection.key);

      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      allHistory.push(...batch);

      // Stop if we got less than a full page
      if (batch.length < pageSize) {
        break;
      }

      logger.debug(
        { batchSize: batch.length, totalFetched: allHistory.length },
        'fetched throwback history page'
      );
    }

    logger.info(
      { totalHistoryEntries: allHistory.length },
      'fetched history from lookback window'
    );

    // Group history by ratingKey within the throwback window
    // Extract metadata directly from history (no re-fetching!)
    const trackMap = new Map<string, {
      ratingKey: string;
      title: string;
      artist: string;
      album: string;
      genre?: string;
      rating: number;
      playCountInWindow: number;
      lastPlayedInWindow: Date;
      mostRecentPlayEver: Date; // From history item metadata
    }>();

    for (const item of allHistory) {
      if (!item || typeof item !== 'object' || item.type !== 'track') {
        continue;
      }

      const ratingKey = item.ratingKey;
      if (!ratingKey) {
        continue;
      }

      // Convert viewedAt to Date
      const viewedAt = item.viewedAt > 1_000_000_000_000
        ? new Date(item.viewedAt)
        : new Date(item.viewedAt * 1000);

      // Filter to throwback window (between windowStart and windowEnd)
      if (viewedAt < windowStart || viewedAt > windowEnd) {
        continue;
      }

      // Extract most recent play from item metadata (if available)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastViewedAt = (item as any).lastViewedAt;
      const mostRecentPlayEver = lastViewedAt
        ? (typeof lastViewedAt === 'number' && lastViewedAt > 1_000_000_000_000
          ? new Date(lastViewedAt)
          : new Date((lastViewedAt as number) * 1000))
        : viewedAt;

      if (!trackMap.has(ratingKey)) {
        // Safe access to optional properties from HistoryMetadatum
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const genres = (item as any).genres;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userRating = (item as any).userRating;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parentTitle = (item as any).parentTitle;
        trackMap.set(ratingKey, {
          ratingKey,
          title: item.title || 'Unknown Title',
          artist: item.grandparentTitle || 'Unknown Artist',
          album: parentTitle || 'Unknown Album',
          genre: (genres && Array.isArray(genres) && genres.length > 0) ? genres[0].tag : undefined,
          rating: userRating ? userRating / 2.0 : 0,
          playCountInWindow: 1,
          lastPlayedInWindow: viewedAt,
          mostRecentPlayEver
        });
      } else {
        const existing = trackMap.get(ratingKey)!;
        existing.playCountInWindow++;
        if (viewedAt > existing.lastPlayedInWindow) {
          existing.lastPlayedInWindow = viewedAt;
        }
        if (mostRecentPlayEver > existing.mostRecentPlayEver) {
          existing.mostRecentPlayEver = mostRecentPlayEver;
        }
      }
    }

    logger.info(
      { uniqueTracksInWindow: trackMap.size },
      'aggregated tracks from throwback window'
    );

    // Filter and score tracks for throwback playlist (before fetching full metadata)
    const preliminaryCandidates: Array<{
      ratingKey: string;
      title: string;
      artist: string;
      album: string;
      genre?: string;
      playCountInWindow: number;
      mostRecentPlayEver: Date;
      throwbackScore: number;
      nostalgiaWeight: number;
      qualityScore: number;
      daysSinceLastPlay: number;
    }> = [];

    for (const trackData of trackMap.values()) {
      // Check if track was played recently (exclude if so)
      if (trackData.mostRecentPlayEver > recentThreshold) {
        continue; // Skip recently played tracks
      }

      const daysSinceLastPlay = Math.floor(
        (now.getTime() - trackData.mostRecentPlayEver.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Use centralized throwback scoring
      const scoringResult = await calculateScore('throwback', {
        userRating: trackData.rating * 2, // Convert 0-5 to 0-10 for scoring
        playCount: trackData.playCountInWindow,
        playCountInWindow: trackData.playCountInWindow,
        lastPlayedAt: trackData.mostRecentPlayEver,
        daysSincePlay: daysSinceLastPlay,
        lookbackStart: finalLookbackStart,
        lookbackEnd: finalLookbackEnd,
        now
      });

      const throwbackScore = scoringResult.finalScore;

      // Skip very low-scoring tracks
      if (throwbackScore < 0.05) {
        continue;
      }

      preliminaryCandidates.push({
        ratingKey: trackData.ratingKey,
        title: trackData.title,
        artist: trackData.artist,
        album: trackData.album,
        genre: trackData.genre,
        playCountInWindow: trackData.playCountInWindow,
        mostRecentPlayEver: trackData.mostRecentPlayEver,
        throwbackScore,
        nostalgiaWeight: scoringResult.components.metadata?.nostalgiaWeight ?? 0,
        qualityScore: scoringResult.components.metadata?.qualityScore ?? 0,
        daysSinceLastPlay
      });
    }

    // Sort by throwback score and take top candidates
    preliminaryCandidates.sort((a, b) => b.throwbackScore - a.throwbackScore);
    const topPreliminary = preliminaryCandidates.slice(0, finalTargetSize * 2);

    // Fetch full Track objects from Plex for top candidates
    const ratingKeys = topPreliminary.map(c => c.ratingKey);
    const tracksByKey = await fetchTracksByRatingKeys(ratingKeys);

    // Build final candidates with full Track metadata
    for (const candidate of topPreliminary) {
      const track = tracksByKey.get(candidate.ratingKey);
      if (!track) continue; // Skip if track fetch failed

      candidates.push({
        ratingKey: candidate.ratingKey,
        title: candidate.title,
        artist: candidate.artist,
        album: candidate.album,
        genre: candidate.genre,
        track,
        finalScore: candidate.throwbackScore,
        recencyWeight: candidate.nostalgiaWeight,
        fallbackScore: candidate.qualityScore,
        lastPlayedAt: candidate.mostRecentPlayEver,
        daysSincePlay: candidate.daysSinceLastPlay,
        playCountInWindow: candidate.playCountInWindow,
        throwbackScore: candidate.throwbackScore,
        playCount: candidate.playCountInWindow
      });
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to fetch throwback tracks'
    );
    return [];
  }

  // Sort by throwback score descending
  candidates.sort((a, b) => b.throwbackScore - a.throwbackScore);

  logger.info(
    {
      totalCandidates: candidates.length,
      targetSize: finalTargetSize,
      avgScore: candidates.length > 0
        ? (candidates.reduce((sum, t) => sum + t.throwbackScore, 0) / candidates.length).toFixed(3)
        : 0,
      avgDaysSincePlay: candidates.length > 0
        ? Math.floor(candidates.reduce((sum, t) => sum + t.daysSincePlay, 0) / candidates.length)
        : 0,
      avgPlayCountInWindow: candidates.length > 0
        ? (candidates.reduce((sum, t) => sum + t.playCountInWindow, 0) / candidates.length).toFixed(1)
        : 0
    },
    'throwback tracks fetched and scored'
  );

  // Fail if insufficient candidates
  if (candidates.length === 0) {
    const windowStartStr = windowStart.toISOString().split('T')[0];
    const windowEndStr = windowEnd.toISOString().split('T')[0];
    const windowLabel = adaptiveWindow || '2-5 years ago';

    const errorMessage = allHistory.length === 0
      ? `No listening history found for throwback playlist. Throwback window: ${windowStartStr} to ${windowEndStr} (${windowLabel}). This playlist requires historical listening data.`
      : `No qualifying tracks found for throwback playlist. Found ${allHistory.length} history entries but all were either recently replayed or filtered out. Throwback window: ${windowStartStr} to ${windowEndStr} (${windowLabel}).`;

    logger.error(
      {
        lookbackWindow: { start: windowStartStr, end: windowEndStr, label: windowLabel },
        totalHistoryEntries: allHistory.length,
        adaptiveWindow: adaptiveWindow !== null,
        errorMessage
      },
      'throwback playlist generation failed'
    );

    throw new Error(errorMessage);
  }

  // Track cache usage for artists in throwback playlist
  if (candidates.length > 0) {
    const uniqueArtists = [...new Set(candidates.map(t => t.artist))];
    updateCacheUsage(uniqueArtists).catch(() => { /* silently fail */ });
  }

  return candidates;
};

/**
 * Update last_used_at for cache entries (async, non-blocking)
 */
async function updateCacheUsage(artistNames: string[]): Promise<void> {
  if (artistNames.length === 0) return;

  const db = getDb();
  const now = new Date();
  const normalizedNames = artistNames.map(n => n.toLowerCase());

  const updates = normalizedNames.map(name =>
    db
      .update(artistCache)
      .set({ lastUsedAt: now })
      .where(eq(artistCache.artistName, name))
      .catch(() => { /* silently ignore errors */ })
  );

  await Promise.allSettled(updates);
}

/**
 * Get distribution statistics for throwback tracks
 */
export const getThrowbackStats = (tracks: ThrowbackTrack[]): {
  avgDaysSincePlay: number;
  avgPlayCountInWindow: number;
  ratedTracks: number;
  unratedTracks: number;
  oldestTrack: number; // days since play
  newestTrack: number; // days since play
} => {
  if (tracks.length === 0) {
    return {
      avgDaysSincePlay: 0,
      avgPlayCountInWindow: 0,
      ratedTracks: 0,
      unratedTracks: 0,
      oldestTrack: 0,
      newestTrack: 0
    };
  }

  const avgDaysSincePlay = tracks.reduce((sum, t) => sum + t.daysSincePlay, 0) / tracks.length;
  const avgPlayCountInWindow = tracks.reduce((sum, t) => sum + t.playCountInWindow, 0) / tracks.length;
  const ratedTracks = tracks.filter(t => t.track.userRating && t.track.userRating > 0).length;
  const unratedTracks = tracks.length - ratedTracks;
  const oldestTrack = Math.max(...tracks.map(t => t.daysSincePlay));
  const newestTrack = Math.min(...tracks.map(t => t.daysSincePlay));

  return {
    avgDaysSincePlay: Math.floor(avgDaysSincePlay),
    avgPlayCountInWindow,
    ratedTracks,
    unratedTracks,
    oldestTrack,
    newestTrack
  };
};

/**
 * Detect the depth of available listening history
 * Returns the number of days since the oldest play, or null if no history
 */
export const getHistoryDepth = async (): Promise<number | null> => {
  try {
    const server = await getPlexServer();
    const now = new Date();

    // Get music library section ID
    const library = await server.library();
    const sections = await library.sections();
    const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');

    if (!musicSection) {
      logger.debug('no music library section found for history depth check');
      return null;
    }

    // Fetch a sample far back in time (15 years) to find oldest plays
    const farBack = subDays(now, 5475); // 15 years
    const historySample = await server.history(100, farBack, undefined, undefined, musicSection.key);

    if (!Array.isArray(historySample) || historySample.length === 0) {
      logger.debug('no history found for depth check');
      return null;
    }

    // Find the oldest viewedAt timestamp
    let oldestTimestamp = now.getTime();
    for (const item of historySample) {
      if (!item || typeof item !== 'object') continue;

      const viewedAt = item.viewedAt > 1_000_000_000_000
        ? new Date(item.viewedAt)
        : new Date(item.viewedAt * 1000);

      if (viewedAt.getTime() < oldestTimestamp) {
        oldestTimestamp = viewedAt.getTime();
      }
    }

    const depthInDays = Math.floor((now.getTime() - oldestTimestamp) / (1000 * 60 * 60 * 24));

    logger.debug(
      { depthInDays, oldestDate: new Date(oldestTimestamp).toISOString().split('T')[0] },
      'detected history depth'
    );

    return depthInDays;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'failed to detect history depth'
    );
    return null;
  }
};

/**
 * Determine appropriate lookback window based on available history depth
 *
 * @param historyDepth - Days of available history, or null to auto-detect
 * @returns Lookback window config or null if insufficient history for throwback
 */
export const determineAdaptiveLookbackWindow = async (
  historyDepth?: number | null
): Promise<{ start: number; end: number; label: string } | null> => {
  const depth = historyDepth === undefined ? await getHistoryDepth() : historyDepth;

  if (depth === null || depth < 90) {
    // Less than 3 months - not enough for "throwback" concept
    return null;
  }

  // Ideal: 2-5 years
  if (depth >= 1825) {
    return { start: 730, end: 1825, label: '2-5 years' };
  }

  // Good: 1-3 years
  if (depth >= 1095) {
    return { start: 365, end: 1095, label: '1-3 years' };
  }

  // Acceptable: 6 months - 2 years
  if (depth >= 730) {
    return { start: 180, end: 730, label: '6 months - 2 years' };
  }

  // Minimum: 3-6 months
  if (depth >= 180) {
    return { start: 90, end: 180, label: '3-6 months' };
  }

  // Fallback: whatever we have (90+ days)
  const windowEnd = Math.max(depth - 30, 90); // Leave at least 30 days buffer
  const windowStart = Math.max(Math.floor(windowEnd / 2), 30);
  return { start: windowStart, end: windowEnd, label: `${windowStart}-${windowEnd} days` };
};

/**
 * Check if there is sufficient historical listening data for throwback playlist
 * Returns true if there are plays from at least 3 months ago
 */
export const hasThrowbackHistory = async (): Promise<boolean> => {
  const window = await determineAdaptiveLookbackWindow();
  return window !== null;
};
