/**
 * Cache-Based Candidate Builder
 * Leverages track cache for fast, comprehensive candidate selection
 * Replaces slow history-based approach with instant cache queries
 */

import { logger } from '../logger.js';
import { queryTracks, touchTracks } from '../cache/track-cache-service.js';
import type { TrackCacheRecord } from '../db/schema.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import { calculateScore } from '../scoring/strategies.js';
import type { ScoringStrategy } from '../scoring/types.js';
import type { CandidateTrack } from './candidate-builder.js';
import type { Track } from '@ctrl/plex';

export interface CacheCandidateOptions {
  /** Genre filters (match ANY) */
  genres?: string[];
  /** Mood filters (match ANY) */
  moods?: string[];
  /** Minimum user rating (0-10) */
  minRating?: number;
  /** Include only unplayed tracks */
  unplayedOnly?: boolean;
  /** Include only unrated tracks (for discovery) */
  unratedOnly?: boolean;
  /** Include only high-rated tracks (>=8 stars) */
  highRatedOnly?: boolean;
  /** Exclude recently played tracks (days) */
  excludeRecentlyPlayed?: number;
  /** Target number of candidates to return */
  targetCount?: number;
  /** Scoring strategy to use */
  scoringStrategy?: ScoringStrategy;
}

/**
 * Build candidates from track cache
 * Ultra-fast: queries precomputed cache instead of fetching history
 *
 * Performance: <1 second for 95k track library vs 30-45 seconds for history approach
 *
 * @param options - Filtering and scoring options
 * @returns Array of candidate tracks with scores
 */
export async function buildCandidatesFromCache(
  options: CacheCandidateOptions = {}
): Promise<CandidateTrack[]> {
  const {
    genres,
    moods,
    minRating,
    unplayedOnly,
    unratedOnly,
    highRatedOnly,
    excludeRecentlyPlayed,
    targetCount = 200,
    scoringStrategy = 'quality'
  } = options;

  logger.info(
    {
      genres,
      moods,
      minRating,
      unplayedOnly,
      unratedOnly,
      highRatedOnly,
      excludeRecentlyPlayed,
      targetCount,
      scoringStrategy
    },
    'building candidates from track cache'
  );

  const startTime = Date.now();

  // Query track cache with filters
  const cachedTracks = await queryTracks({
    genres,
    moods,
    minRating,
    unplayedOnly,
    unratedOnly,
    highRatedOnly,
    excludeRecentlyPlayed,
    limit: targetCount * 3, // Get 3x for filtering headroom
    orderBy: 'qualityScore',
    orderDirection: 'desc'
  });

  const queryTime = Date.now() - startTime;
  logger.info(
    { cachedTracks: cachedTracks.length, queryTimeMs: queryTime },
    'queried track cache'
  );

  if (cachedTracks.length === 0) {
    logger.warn({ options }, 'no tracks found in cache matching filters');
    return [];
  }

  // Fetch full Track objects from Plex (only for top candidates)
  const ratingKeys = cachedTracks.slice(0, targetCount).map(t => t.ratingKey);
  const tracksByKey = await fetchTracksByRatingKeys(ratingKeys);

  const fetchTime = Date.now() - startTime - queryTime;
  logger.debug(
    { fetchedTracks: tracksByKey.size, fetchTimeMs: fetchTime },
    'fetched full tracks from Plex'
  );

  // Build candidates with strategy-specific scoring
  const candidates: CandidateTrack[] = [];
  const now = new Date();

  for (const cached of cachedTracks) {
    const track = tracksByKey.get(cached.ratingKey);
    if (!track) {
      continue;
    }

    // Use specified scoring strategy
    const scoringResult = calculateScore(scoringStrategy, {
      userRating: cached.userRating || undefined,
      playCount: cached.viewCount || 0,
      lastPlayedAt: cached.lastViewedAt,
      now
    });

    const candidate: CandidateTrack = {
      ratingKey: cached.ratingKey,
      track,
      artist: cached.artistName,
      album: cached.albumName || undefined,
      title: cached.title,
      finalScore: scoringResult.finalScore,
      recencyWeight: scoringResult.components.recencyWeight,
      fallbackScore: scoringResult.components.fallbackScore,
      playCount: cached.viewCount || 0,
      lastPlayedAt: cached.lastViewedAt
    };

    candidates.push(candidate);
  }

  // Sort by final score (descending)
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // Update cache access tracking (for usage-based refresh prioritization)
  const candidateKeys = candidates.map(c => c.ratingKey);
  await touchTracks(candidateKeys);

  const totalTime = Date.now() - startTime;
  logger.info(
    {
      candidates: candidates.length,
      avgScore: candidates.length > 0
        ? (candidates.reduce((sum, c) => sum + c.finalScore, 0) / candidates.length).toFixed(3)
        : 0,
      totalTimeMs: totalTime,
      breakdown: {
        cacheQuery: queryTime,
        plexFetch: fetchTime,
        scoring: totalTime - queryTime - fetchTime
      }
    },
    'candidates built from cache'
  );

  return candidates.slice(0, targetCount);
}

/**
 * Build discovery candidates from cache
 * Surfaces forgotten gems: high-quality, less-played, long-unheard tracks
 *
 * @param targetCount - Number of candidates to return
 * @returns Array of discovery candidates
 */
export async function buildDiscoveryCandidatesFromCache(
  targetCount: number = 100
): Promise<CandidateTrack[]> {
  return buildCandidatesFromCache({
    excludeRecentlyPlayed: 90, // 90+ days since last play
    targetCount,
    scoringStrategy: 'discovery'
  });
}

/**
 * Build high-rated unplayed candidates from cache
 * Perfect for "hidden gems" playlists
 *
 * @param targetCount - Number of candidates to return
 * @returns Array of unplayed high-rated candidates
 */
export async function buildUnplayedGemsCandidatesFromCache(
  targetCount: number = 100
): Promise<CandidateTrack[]> {
  return buildCandidatesFromCache({
    unplayedOnly: true,
    highRatedOnly: true,
    targetCount,
    scoringStrategy: 'quality'
  });
}

/**
 * Build genre/mood-specific quality candidates from cache
 * Replacement for custom playlist history-based approach
 *
 * @param genres - Genre filters
 * @param moods - Mood filters
 * @param targetCount - Number of candidates to return
 * @param scoringStrategy - Scoring strategy to use
 * @returns Array of filtered quality candidates
 */
export async function buildQualityCandidatesFromCache(
  genres: string[],
  moods: string[],
  targetCount: number = 100,
  scoringStrategy: ScoringStrategy = 'quality'
): Promise<CandidateTrack[]> {
  return buildCandidatesFromCache({
    genres: genres.length > 0 ? genres : undefined,
    moods: moods.length > 0 ? moods : undefined,
    targetCount,
    scoringStrategy
  });
}

/**
 * Convert cache record to CandidateTrack (when Track object already available)
 * Useful for batch processing
 */
export function candidateFromCacheRecord(
  cached: TrackCacheRecord,
  track: Track,
  scoringStrategy: ScoringStrategy = 'quality'
): CandidateTrack {
  const scoringResult = calculateScore(scoringStrategy, {
    userRating: cached.userRating || undefined,
    playCount: cached.viewCount || 0,
    lastPlayedAt: cached.lastViewedAt,
    now: new Date()
  });

  return {
    ratingKey: cached.ratingKey,
    track,
    artist: cached.artistName,
    album: cached.albumName || undefined,
    title: cached.title,
    finalScore: scoringResult.finalScore,
    recencyWeight: scoringResult.components.recencyWeight,
    fallbackScore: scoringResult.components.fallbackScore,
    playCount: cached.viewCount || 0,
    lastPlayedAt: cached.lastViewedAt
  };
}
