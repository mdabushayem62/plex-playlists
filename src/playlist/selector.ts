import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import type { PlaylistWindow } from '../windows.js';
import type { CandidateTrack } from './candidate-builder.js';

export interface SelectionContext {
  targetCount: number;
  maxPerArtist: number;
  excludeRatingKeys?: Set<string>;
  window: PlaylistWindow;
}

export interface SelectionResult {
  selected: CandidateTrack[];
  remaining: CandidateTrack[];
}

const selectWithConstraints = (
  candidates: CandidateTrack[],
  context: SelectionContext,
  { enforceGenreLimit, enforceArtistLimit }: { enforceGenreLimit: boolean; enforceArtistLimit: boolean }
): CandidateTrack[] => {
  const selected: CandidateTrack[] = [];
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const exclude = context.excludeRatingKeys ?? new Set<string>();

  const maxGenreCount = Math.floor(context.targetCount * APP_ENV.MAX_GENRE_SHARE);

  for (const candidate of candidates) {
    if (selected.length >= context.targetCount) {
      break;
    }

    if (exclude.has(candidate.ratingKey)) {
      continue;
    }

    if (selected.some(item => item.ratingKey === candidate.ratingKey)) {
      continue;
    }

    if (enforceArtistLimit) {
      const artistCount = artistCounts.get(candidate.artist) ?? 0;
      if (artistCount >= context.maxPerArtist) {
        continue;
      }
    }

    if (enforceGenreLimit && candidate.genre) {
      const genreCount = genreCounts.get(candidate.genre) ?? 0;
      if (genreCount >= maxGenreCount) {
        continue;
      }
    }

    selected.push(candidate);
    artistCounts.set(candidate.artist, (artistCounts.get(candidate.artist) ?? 0) + 1);
    if (candidate.genre) {
      genreCounts.set(candidate.genre, (genreCounts.get(candidate.genre) ?? 0) + 1);
    }
  }

  return selected;
};

/**
 * Calculate and log genre distribution in selected tracks
 */
const logGenreDistribution = (
  selected: CandidateTrack[],
  window: PlaylistWindow,
  targetCount: number
): void => {
  if (selected.length === 0) {
    return;
  }

  // Count genres
  const genreCounts = new Map<string, number>();
  let tracksWithGenres = 0;

  for (const track of selected) {
    if (track.genre) {
      genreCounts.set(track.genre, (genreCounts.get(track.genre) ?? 0) + 1);
      tracksWithGenres++;
    }
  }

  // Sort by count descending
  const sortedGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10 genres

  // Calculate percentages and check threshold
  const maxGenreShare = APP_ENV.MAX_GENRE_SHARE;
  const maxAllowedCount = Math.floor(targetCount * maxGenreShare);
  const genresOverThreshold: Array<{ genre: string; count: number; percentage: number }> = [];

  const genreDistribution = sortedGenres.map(([genre, count]) => {
    const percentage = (count / selected.length) * 100;
    if (count > maxAllowedCount) {
      genresOverThreshold.push({ genre, count, percentage });
    }
    return {
      genre,
      count,
      percentage: percentage.toFixed(1)
    };
  });

  logger.info(
    {
      window,
      totalTracks: selected.length,
      tracksWithGenres,
      tracksWithoutGenres: selected.length - tracksWithGenres,
      uniqueGenres: genreCounts.size,
      topGenres: genreDistribution,
      maxGenreShareSetting: `${(maxGenreShare * 100).toFixed(0)}%`,
      maxAllowedPerGenre: maxAllowedCount
    },
    'genre distribution in selected playlist'
  );

  // Warn if any genre exceeds threshold
  if (genresOverThreshold.length > 0) {
    logger.warn(
      {
        window,
        genresOverThreshold,
        threshold: `${(maxGenreShare * 100).toFixed(0)}%`
      },
      'genres exceeded MAX_GENRE_SHARE threshold'
    );
  }
};

export const selectPlaylistTracks = (
  candidates: CandidateTrack[],
  context: SelectionContext
): SelectionResult => {
  const passes: Array<{ enforceGenreLimit: boolean; enforceArtistLimit: boolean }> = [
    { enforceGenreLimit: true, enforceArtistLimit: true },
    { enforceGenreLimit: false, enforceArtistLimit: true },
    { enforceGenreLimit: false, enforceArtistLimit: false }
  ];

  const selected: CandidateTrack[] = [];
  const excludeKeys = new Set(context.excludeRatingKeys ?? []);

  for (const pass of passes) {
    const passSelection = selectWithConstraints(candidates, context, pass);
    for (const item of passSelection) {
      if (selected.length >= context.targetCount) {
        break;
      }
      if (!selected.some(sel => sel.ratingKey === item.ratingKey)) {
        selected.push(item);
        excludeKeys.add(item.ratingKey);
      }
    }
    if (selected.length >= context.targetCount) {
      break;
    }
  }

  // Log genre distribution
  logGenreDistribution(selected, context.window, context.targetCount);

  const remaining = candidates.filter(item => !selected.some(sel => sel.ratingKey === item.ratingKey));
  return { selected, remaining };
};
