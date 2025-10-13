import { differenceInDays, subDays } from 'date-fns';
import type { HistoryResult } from '@ctrl/plex';

import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import { getPlexServer } from '../plex/client.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import { calculateScore } from '../scoring/strategies.js';
import type { CandidateTrack } from './candidate-builder.js';
import { getDb } from '../db/index.js';
import { artistCache } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface DiscoveryTrack extends CandidateTrack {
  lastPlayedAt: Date | null;
  daysSincePlay: number | null;
  discoveryScore: number;
  playCount: number;
}

/**
 * Fetch tracks for weekly discovery playlist
 * Focuses on rediscovering forgotten gems from listening history
 *
 * Strategy:
 * - Uses history API to find all tracks you've played before
 * - Filters to tracks last played > minDaysSincePlay ago
 * - Score: starRating × (1 - playCount/saturation) × recencyPenalty
 * - Prioritize: High-rated, low-played, long-forgotten tracks
 *
 * Performance: Uses history API with pagination (no full library scan)
 *
 * @param targetSize - Target playlist size (default: 50)
 * @param minDaysSincePlay - Minimum days since last play (default: 90)
 * @param maxHistoryEntries - Maximum history entries to fetch (default: 20000)
 * @returns Array of discovery tracks sorted by discovery score
 */
export const fetchDiscoveryTracks = async (
  targetSize: number = APP_ENV.PLAYLIST_TARGET_SIZE,
  minDaysSincePlay: number = APP_ENV.DISCOVERY_DAYS,
  maxHistoryEntries: number = 20000
): Promise<DiscoveryTrack[]> => {
  const server = await getPlexServer();
  const now = new Date();

  logger.info(
    { targetSize, minDaysSincePlay, maxHistoryEntries },
    'fetching tracks for weekly discovery playlist'
  );

  // Fetch extensive history to find all tracks we've played
  // Use a very old date (10 years) to get comprehensive history
  const minDate = subDays(now, 3650); // 10 years ago

  try {
    // Fetch history with pagination
    const allHistory: HistoryResult[] = [];
    const pageSize = 500;

    while (allHistory.length < maxHistoryEntries) {
      const batch = await server.history(pageSize, minDate);

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
        'fetched discovery history page'
      );
    }

    logger.info(
      { totalHistoryEntries: allHistory.length },
      'fetched comprehensive listening history'
    );

    // Build map of tracks with play stats from history
    const trackMap = new Map<string, {
      ratingKey: string;
      title: string;
      artist: string;
      album: string;
      genre?: string;
      rating: number;
      playCount: number;
      lastPlayedAt: Date;
      metadata: HistoryResult; // Preserve first occurrence for metadata
    }>();

    for (const item of allHistory) {
      if (!item || item.type !== 'track') continue;

      const ratingKey = item.ratingKey;
      if (!ratingKey) continue;

      const viewedAt = item.viewedAt > 1_000_000_000_000
        ? new Date(item.viewedAt)
        : new Date(item.viewedAt * 1000);

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
          playCount: 1,
          lastPlayedAt: viewedAt,
          metadata: item
        });
      } else {
        const existing = trackMap.get(ratingKey)!;
        existing.playCount++;
        if (viewedAt > existing.lastPlayedAt) {
          existing.lastPlayedAt = viewedAt;
        }
      }
    }

    logger.debug(
      { uniqueTracks: trackMap.size },
      'aggregated track play history'
    );

    // Filter and score tracks for discovery (before fetching full metadata)
    const preliminaryCandidates: Array<{
      ratingKey: string;
      title: string;
      artist: string;
      album: string;
      genre?: string;
      playCount: number;
      lastPlayedAt: Date;
      daysSincePlay: number;
      discoveryScore: number;
      recencyWeight: number;
      fallbackScore: number;
    }> = [];

    for (const trackData of trackMap.values()) {
      const daysSincePlay = differenceInDays(now, trackData.lastPlayedAt);

      // Filter: Must not have been played in last N days
      if (daysSincePlay < minDaysSincePlay) {
        continue;
      }

      // Skip tracks with no rating and very few plays (unknown quality)
      if (trackData.rating === 0 && trackData.playCount < 3) {
        continue;
      }

      // Use centralized discovery scoring
      const scoringResult = calculateScore('discovery', {
        userRating: trackData.rating * 2, // Convert 0-5 to 0-10 for scoring
        playCount: trackData.playCount,
        lastPlayedAt: trackData.lastPlayedAt,
        daysSincePlay,
        now
      });

      const discoveryScore = scoringResult.finalScore;

      // Skip very low-scoring tracks
      if (discoveryScore < 0.1) {
        continue;
      }

      preliminaryCandidates.push({
        ratingKey: trackData.ratingKey,
        title: trackData.title,
        artist: trackData.artist,
        album: trackData.album,
        genre: trackData.genre,
        playCount: trackData.playCount,
        lastPlayedAt: trackData.lastPlayedAt,
        daysSincePlay,
        discoveryScore,
        recencyWeight: scoringResult.components.metadata?.recencyPenalty ?? 0,
        fallbackScore: scoringResult.components.metadata?.qualityScore ?? 0
      });
    }

    // Sort by discovery score and take top candidates
    preliminaryCandidates.sort((a, b) => b.discoveryScore - a.discoveryScore);
    const topPreliminary = preliminaryCandidates.slice(0, targetSize * 2);

    // Fetch full Track objects from Plex for top candidates
    const ratingKeys = topPreliminary.map(c => c.ratingKey);
    const tracksByKey = await fetchTracksByRatingKeys(ratingKeys);

    // Build final candidates with full Track metadata
    const candidates: DiscoveryTrack[] = [];
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
        finalScore: candidate.discoveryScore,
        recencyWeight: candidate.recencyWeight,
        fallbackScore: candidate.fallbackScore,
        lastPlayedAt: candidate.lastPlayedAt,
        daysSincePlay: candidate.daysSincePlay,
        discoveryScore: candidate.discoveryScore,
        playCount: candidate.playCount
      });
    }

    // Sort by discovery score descending
    candidates.sort((a, b) => b.discoveryScore - a.discoveryScore);

    // Log detailed info about filtering
    const recentlyPlayed = Array.from(trackMap.values())
      .filter(t => differenceInDays(now, t.lastPlayedAt) < minDaysSincePlay).length;

    logger.info(
      {
        totalHistoryEntries: allHistory.length,
        uniqueTracks: trackMap.size,
        recentlyPlayed,
        candidatesAfterFilter: preliminaryCandidates.length,
        finalCandidates: candidates.length,
        targetSize,
        avgScore: candidates.length > 0
          ? (candidates.reduce((sum, t) => sum + t.discoveryScore, 0) / candidates.length).toFixed(3)
          : 0,
        avgDaysSincePlay: candidates.length > 0
          ? Math.floor(candidates.reduce((sum, t) => sum + (t.daysSincePlay || 0), 0) / candidates.length)
          : 0,
        forgotten: candidates.filter(t => t.daysSincePlay && t.daysSincePlay > minDaysSincePlay).length
      },
      'discovery tracks fetched and scored'
    );

    // Fail if insufficient candidates
    if (candidates.length === 0) {
      const errorMessage = recentlyPlayed > 0
        ? `Insufficient tracks for discovery playlist: ${recentlyPlayed}/${trackMap.size} tracks played in last ${minDaysSincePlay} days. Discovery needs tracks not played recently. Try reducing DISCOVERY_DAYS env var to ${Math.floor(minDaysSincePlay / 2)} days.`
        : `No listening history found for discovery playlist. Listen to more music to enable discovery (found ${trackMap.size} unique tracks).`;

      logger.error(
        { uniqueTracks: trackMap.size, recentlyPlayed, minDaysSincePlay, errorMessage },
        'discovery playlist generation failed'
      );

      throw new Error(errorMessage);
    }

    // Track cache usage for artists in discovery playlist
    if (candidates.length > 0) {
      const uniqueArtists = [...new Set(candidates.map(t => t.artist))];
      updateCacheUsage(uniqueArtists).catch(() => { /* silently fail */ });
    }

    return candidates;
  } catch (error) {
    // Re-throw if it's our intentional failure (insufficient tracks)
    if (error instanceof Error && error.message.includes('Insufficient tracks for discovery')) {
      throw error;
    }

    // Log and re-throw unexpected errors
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to fetch discovery tracks'
    );
    throw error;
  }
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
 * Get distribution statistics for discovery tracks
 */
export const getDiscoveryStats = (tracks: DiscoveryTrack[]): {
  neverPlayed: number;
  forgotten: number;
  avgDaysSincePlay: number | null;
  ratedTracks: number;
  unratedTracks: number;
} => {
  const neverPlayed = tracks.filter(t => t.lastPlayedAt === null).length;
  const forgotten = tracks.filter(t => t.daysSincePlay && t.daysSincePlay > 90).length;
  const tracksWithPlays = tracks.filter(t => t.daysSincePlay !== null);
  const avgDaysSincePlay = tracksWithPlays.length > 0
    ? tracksWithPlays.reduce((sum, t) => sum + (t.daysSincePlay || 0), 0) / tracksWithPlays.length
    : null;
  const ratedTracks = tracks.filter(t => t.track.userRating && t.track.userRating > 0).length;
  const unratedTracks = tracks.length - ratedTracks;

  return {
    neverPlayed,
    forgotten,
    avgDaysSincePlay,
    ratedTracks,
    unratedTracks
  };
};
