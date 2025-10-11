import { subDays } from 'date-fns';
import type { HistoryMetadatum } from '@ctrl/plex';

import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import { getPlexServer } from '../plex/client.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import type { CandidateTrack } from './candidate-builder.js';
import { getDb } from '../db/index.js';
import { genreCache } from '../db/schema.js';
import { eq } from 'drizzle-orm';

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
  targetSize: number = APP_ENV.PLAYLIST_TARGET_SIZE,
  lookbackStart: number = APP_ENV.THROWBACK_LOOKBACK_START,
  lookbackEnd: number = APP_ENV.THROWBACK_LOOKBACK_END,
  recentExclusion: number = APP_ENV.THROWBACK_RECENT_EXCLUSION
): Promise<ThrowbackTrack[]> => {
  const server = await getPlexServer();
  const now = new Date();

  // Define lookback window (e.g., 2-5 years ago)
  const windowStart = subDays(now, lookbackEnd);
  const windowEnd = subDays(now, lookbackStart);
  const recentThreshold = subDays(now, recentExclusion);

  logger.info(
    {
      targetSize,
      lookbackWindow: {
        start: windowStart.toISOString().split('T')[0],
        end: windowEnd.toISOString().split('T')[0]
      },
      recentExclusion: recentThreshold.toISOString().split('T')[0]
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
  const allHistory: HistoryMetadatum[] = [];
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
    const saturation = APP_ENV.PLAY_COUNT_SATURATION;

    for (const trackData of trackMap.values()) {
      // Check if track was played recently (exclude if so)
      if (trackData.mostRecentPlayEver > recentThreshold) {
        continue; // Skip recently played tracks
      }

      // Calculate throwback score
      // Components:
      // 1. Nostalgia weight (0-1): Older within window = higher score
      // 2. Play count in window (normalized): How much you loved it back then
      // 3. User rating weight (0-1): Quality signal

      const daysSinceLastPlay = Math.floor(
        (now.getTime() - trackData.mostRecentPlayEver.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Nostalgia weight: favor older tracks within the window
      // Linear scale from lookbackStart to lookbackEnd
      const windowRange = lookbackEnd - lookbackStart;
      const daysIntoWindow = daysSinceLastPlay - lookbackStart;
      const nostalgiaWeight = Math.min(Math.max(daysIntoWindow / windowRange, 0), 1);

      // Play count weight: normalize by saturation, favor frequently played tracks
      const playCountWeight = Math.min(trackData.playCountInWindow / saturation, 1.0);

      // Rating weight: normalize to 0-1
      const ratingWeight = trackData.rating / 5.0;

      // Combined score: nostalgia × playCount × (rating OR fallback)
      // If no rating, use play count in window as quality proxy
      const qualityScore = trackData.rating > 0
        ? ratingWeight
        : Math.min(trackData.playCountInWindow / saturation, 1.0) * 0.6; // Cap unrated at 0.6

      const throwbackScore = nostalgiaWeight * playCountWeight * qualityScore;

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
        nostalgiaWeight,
        qualityScore,
        daysSinceLastPlay
      });
    }

    // Sort by throwback score and take top candidates
    preliminaryCandidates.sort((a, b) => b.throwbackScore - a.throwbackScore);
    const topPreliminary = preliminaryCandidates.slice(0, targetSize * 2);

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
      targetSize,
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

    const errorMessage = allHistory.length === 0
      ? `No listening history found for throwback playlist. Throwback window: ${windowStartStr} to ${windowEndStr} (2-5 years ago). This playlist requires historical listening data.`
      : `No qualifying tracks found for throwback playlist. Found ${allHistory.length} history entries but all were either recently replayed or filtered out. Throwback window: ${windowStartStr} to ${windowEndStr}.`;

    logger.error(
      { lookbackWindow: { start: windowStartStr, end: windowEndStr }, totalHistoryEntries: allHistory.length, errorMessage },
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
      .update(genreCache)
      .set({ lastUsedAt: now })
      .where(eq(genreCache.artistName, name))
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
