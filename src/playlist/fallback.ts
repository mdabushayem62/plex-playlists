import type { MusicSection, Section, Track } from '@ctrl/plex';

import { getPlexServer } from '../plex/client.js';
import { candidateFromTrack, type CandidateTrack } from './candidate-builder.js';
import { logger } from '../logger.js';

const FALLBACK_FETCH_MULTIPLIER = 5;
const GENRE_FALLBACK_FETCH_MULTIPLIER = 50; // Much larger when filtering by genre

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

export const fetchFallbackCandidates = async (
  limit: number,
  options: FallbackOptions = {}
): Promise<CandidateTrack[]> => {
  const musicSection = await findMusicSection();

  // Use much larger multiplier when filtering by genre to ensure enough matches
  const multiplier = options.genreFilter ? GENRE_FALLBACK_FETCH_MULTIPLIER : FALLBACK_FETCH_MULTIPLIER;
  const searchLimit = limit * multiplier;

  // When filtering by genre, sort by viewCount to get popular tracks of that genre
  // Otherwise, sort by userRating to get highly-rated tracks
  const sortField = options.genreFilter ? 'viewCount:desc' : 'userRating:desc';

  const tracks = await musicSection.searchTracks({
    sort: sortField,
    libtype: 'track',
    maxresults: searchLimit
  });

  const candidates: CandidateTrack[] = [];
  let matchedCount = 0;
  let totalProcessed = 0;

  for (const track of tracks as Track[]) {
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
    if (options.genreFilter && candidates.length >= limit) {
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
      'genre filtering stats'
    );
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);
  return candidates.slice(0, limit);
};
