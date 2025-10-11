import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import type { PlaylistWindow } from '../windows.js';
import type { CandidateTrack } from './candidate-builder.js';

export interface SelectionContext {
  targetCount: number;
  maxPerArtist: number;
  excludeRatingKeys?: Set<string>;
  window: PlaylistWindow;
  explorationRate?: number; // Override default exploration rate (0.0-1.0)
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

/**
 * Shuffle array in-place using Fisher-Yates algorithm
 */
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Select exploration tracks randomly from remaining candidates
 * Prioritizes diversity (different genres/artists) over score
 */
const selectExplorationTracks = (
  candidates: CandidateTrack[],
  excludeKeys: Set<string>,
  selectedTracks: CandidateTrack[],
  count: number
): CandidateTrack[] => {
  const exploration: CandidateTrack[] = [];
  const selectedArtists = new Set(selectedTracks.map(t => t.artist));
  const selectedGenres = new Set(selectedTracks.map(t => t.genre).filter(Boolean));

  // Filter out already selected and excluded tracks
  const available = candidates.filter(
    c => !excludeKeys.has(c.ratingKey) && !selectedTracks.some(s => s.ratingKey === c.ratingKey)
  );

  if (available.length === 0) {
    return [];
  }

  // Shuffle for randomness
  const shuffled = shuffleArray(available);

  // Prioritize tracks from new artists/genres for diversity
  for (const candidate of shuffled) {
    if (exploration.length >= count) {
      break;
    }

    const isNewArtist = !selectedArtists.has(candidate.artist);
    const isNewGenre = candidate.genre && !selectedGenres.has(candidate.genre);

    // Prefer diverse tracks, but accept any if needed
    if (isNewArtist || isNewGenre || exploration.length < count) {
      exploration.push(candidate);
      selectedArtists.add(candidate.artist);
      if (candidate.genre) {
        selectedGenres.add(candidate.genre);
      }
    }
  }

  return exploration;
};

export const selectPlaylistTracks = (
  candidates: CandidateTrack[],
  context: SelectionContext
): SelectionResult => {
  const explorationRate = context.explorationRate ?? APP_ENV.EXPLORATION_RATE;
  const numExplore = Math.floor(context.targetCount * explorationRate);
  const numExploit = context.targetCount - numExplore;

  logger.debug(
    {
      window: context.window,
      targetCount: context.targetCount,
      explorationRate,
      numExploit,
      numExplore
    },
    'epsilon-greedy selection split'
  );

  const passes: Array<{ enforceGenreLimit: boolean; enforceArtistLimit: boolean }> = [
    { enforceGenreLimit: true, enforceArtistLimit: true },
    { enforceGenreLimit: false, enforceArtistLimit: true },
    { enforceGenreLimit: false, enforceArtistLimit: false }
  ];

  // Phase 1: Exploitation - select top-scored tracks with constraints
  const exploited: CandidateTrack[] = [];
  const excludeKeys = new Set(context.excludeRatingKeys ?? []);

  // Temporarily adjust target to exploitation count
  const exploitContext = { ...context, targetCount: numExploit };

  for (const pass of passes) {
    const passSelection = selectWithConstraints(candidates, exploitContext, pass);
    for (const item of passSelection) {
      if (exploited.length >= numExploit) {
        break;
      }
      if (!exploited.some(sel => sel.ratingKey === item.ratingKey)) {
        exploited.push(item);
        excludeKeys.add(item.ratingKey);
      }
    }
    if (exploited.length >= numExploit) {
      break;
    }
  }

  logger.debug(
    { window: context.window, exploited: exploited.length, target: numExploit },
    'exploitation phase complete'
  );

  // Phase 2: Exploration - random diverse tracks
  const explored = selectExplorationTracks(candidates, excludeKeys, exploited, numExplore);

  logger.debug(
    { window: context.window, explored: explored.length, target: numExplore },
    'exploration phase complete'
  );

  // Combine exploitation + exploration
  const selected = [...exploited, ...explored];

  // Log final stats
  logger.info(
    {
      window: context.window,
      finalSize: selected.length,
      targetSize: context.targetCount,
      exploited: exploited.length,
      explored: explored.length,
      explorationRate: `${(explorationRate * 100).toFixed(0)}%`
    },
    'epsilon-greedy selection complete'
  );

  // Log genre distribution
  logGenreDistribution(selected, context.window, context.targetCount);

  const remaining = candidates.filter(item => !selected.some(sel => sel.ratingKey === item.ratingKey));
  return { selected, remaining };
};
