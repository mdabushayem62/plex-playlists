import type { MusicSection, Section } from '@ctrl/plex';
import { Track } from '@ctrl/plex';

import { getPlexServer } from '../plex/client.js';
import { candidateFromTrack, type CandidateTrack } from './candidate-builder.js';
import { logger } from '../logger.js';
import { createMediaQuery } from '../plex/media-query-builder.js';

const FALLBACK_FETCH_MULTIPLIER = 5;
const GENRE_FALLBACK_FETCH_MULTIPLIER = 10; // Reduced from 50 to avoid timeouts on large libraries

const isMusicSection = (section: Section): section is MusicSection =>
  (section as MusicSection).searchTracks !== undefined && section.CONTENT_TYPE === 'audio';

const findMusicSection = async () => {
  const server = await getPlexServer();
  const library = await server.library();
  const sections = await library.sections();
  const musicSection = sections.find(isMusicSection);
  if (!musicSection) {
    throw new Error('no music library section found for fallback selection');
  }
  return musicSection;
};

export interface FallbackOptions {
  genreFilter?: string; // Filter candidates by genre (case-insensitive substring match)
}

/**
 * Fetch fallback candidates using Media Query DSL for optimized server-side filtering
 * @param limit - Number of candidates to return
 * @param options - Filtering options
 * @param useDSL - Use optimized DSL queries (default: true)
 * @returns Sorted candidate tracks
 */
export const fetchFallbackCandidates = async (
  limit: number,
  options: FallbackOptions = {},
  useDSL: boolean = true
): Promise<CandidateTrack[]> => {
  if (useDSL) {
    return fetchFallbackCandidatesWithDSL(limit, options);
  }
  return fetchFallbackCandidatesLegacy(limit, options);
};

/**
 * DSL-optimized fallback candidate fetching
 * Pre-filters server-side before scoring
 */
const fetchFallbackCandidatesWithDSL = async (
  limit: number,
  options: FallbackOptions = {}
): Promise<CandidateTrack[]> => {
  const server = await getPlexServer();
  const musicSection = await findMusicSection();
  const sectionId = musicSection.key;

  // Use larger multiplier for genre filtering
  const multiplier = options.genreFilter ? GENRE_FALLBACK_FETCH_MULTIPLIER : FALLBACK_FETCH_MULTIPLIER;
  const searchLimit = limit * multiplier;

  logger.debug(
    { limit, searchLimit, genreFilter: options.genreFilter, method: 'DSL' },
    'fetching fallback candidates with Media Query DSL'
  );

  // Build DSL query combining rating and play count criteria
  const query = createMediaQuery(sectionId)
    .type('track')
    .rating(4)            // Pre-filter to rated tracks (4+ stars = 8+ out of 10)
    .sort('userRating', 'desc')
    .limit(searchLimit)
    .build();

  interface TrackMediaContainer {
    MediaContainer?: {
      Metadata?: Array<Record<string, unknown>>;
    };
  }

  const result = await server.query<TrackMediaContainer>(query);
  const metadata = result?.MediaContainer?.Metadata || [];

  logger.debug(
    { fetched: metadata.length, searchLimit },
    'DSL query returned tracks'
  );

  // Convert metadata to Track objects and build candidates
  const candidates: CandidateTrack[] = [];
  let matchedCount = 0;

  for (const item of metadata) {
    const track = new Track(server, item, query, undefined);
    const lastViewed = track.lastViewedAt ?? null;

    const candidate = await candidateFromTrack(track, {
      playCount: track.viewCount ?? 0,
      lastPlayedAt: lastViewed
    });

    // Apply genre filter if specified
    if (options.genreFilter) {
      const trackGenre = candidate.genre?.toLowerCase() || '';
      const filterGenre = options.genreFilter.toLowerCase();
      if (!trackGenre.includes(filterGenre)) {
        continue;
      }
      matchedCount++;
    }

    candidates.push(candidate);

    // Stop early if we have enough candidates (when filtering by genre)
    if (options.genreFilter && candidates.length >= limit * 2) {
      break;
    }
  }

  if (options.genreFilter) {
    logger.debug(
      {
        genreFilter: options.genreFilter,
        totalFetched: metadata.length,
        matchedCount,
        candidatesReturned: candidates.length
      },
      'DSL genre filtering stats'
    );
  }

  // Sort by finalScore which combines rating (60%) and play count (40%)
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  logger.info(
    {
      method: 'DSL',
      fetched: metadata.length,
      candidates: candidates.length,
      returned: Math.min(limit, candidates.length)
    },
    'fallback candidates fetched with DSL optimization'
  );

  return candidates.slice(0, limit);
};

/**
 * Legacy fallback implementation (for comparison/fallback)
 * Kept for backward compatibility and A/B testing
 */
const fetchFallbackCandidatesLegacy = async (
  limit: number,
  options: FallbackOptions = {}
): Promise<CandidateTrack[]> => {
  const musicSection = await findMusicSection();

  // Use much larger multiplier when filtering by genre to ensure enough matches
  const multiplier = options.genreFilter ? GENRE_FALLBACK_FETCH_MULTIPLIER : FALLBACK_FETCH_MULTIPLIER;
  const searchLimit = limit * multiplier;

  logger.debug(
    { limit, searchLimit, genreFilter: options.genreFilter, method: 'legacy' },
    'fetching fallback candidates with legacy method'
  );

  // Fetch tracks using BOTH sort orders to capture:
  // 1. High-rated tracks (star ratings) - important for unplayed tracks
  // 2. Frequently-played tracks (play count) - important for played tracks
  const [ratedTracks, playedTracks] = await Promise.all([
    musicSection.searchTracks({
      sort: 'userRating:desc',
      libtype: 'track',
      maxresults: searchLimit
    }),
    musicSection.searchTracks({
      sort: 'viewCount:desc',
      libtype: 'track',
      maxresults: searchLimit
    })
  ]);

  // Merge and deduplicate by ratingKey
  const allTracks = new Map<string, Track>();
  for (const track of [...ratedTracks, ...playedTracks] as Track[]) {
    const key = track.ratingKey?.toString();
    if (key && !allTracks.has(key)) {
      allTracks.set(key, track);
    }
  }

  const candidates: CandidateTrack[] = [];
  let matchedCount = 0;
  let totalProcessed = 0;

  for (const track of allTracks.values()) {
    totalProcessed++;

    const lastViewed = track.lastViewedAt ?? null;
    const candidate = await candidateFromTrack(track, {
      playCount: track.viewCount ?? 0,
      lastPlayedAt: lastViewed
    });

    // Apply genre filter if specified
    if (options.genreFilter) {
      const trackGenre = candidate.genre?.toLowerCase() || '';
      const filterGenre = options.genreFilter.toLowerCase();
      if (!trackGenre.includes(filterGenre)) {
        continue;
      }
      matchedCount++;
    }

    candidates.push(candidate);

    // Stop early if we have enough candidates (when filtering by genre)
    if (options.genreFilter && candidates.length >= limit * 2) {
      break;
    }
  }

  if (options.genreFilter) {
    logger.debug(
      {
        genreFilter: options.genreFilter,
        totalProcessed,
        matchedCount,
        candidatesReturned: candidates.length
      },
      'legacy genre filtering stats'
    );
  }

  // Sort by finalScore which combines rating (60%) and play count (40%)
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  logger.info(
    {
      method: 'legacy',
      fetched: allTracks.size,
      candidates: candidates.length,
      returned: Math.min(limit, candidates.length)
    },
    'fallback candidates fetched with legacy method'
  );

  return candidates.slice(0, limit);
};
