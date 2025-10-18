import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import type { PlaylistWindow } from '../windows.js';
import type { CandidateTrack } from './candidate-builder.js';
import { getGenreSimilarityService } from '../metadata/genre-similarity.js';
import { getTotalTrackCount, hasEnabledDiscoveryPlaylist } from '../db/repository.js';
import { getRecentSkipRate } from '../adaptive/adaptive-repository.js';

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

const selectWithConstraints = async (
  candidates: CandidateTrack[],
  context: SelectionContext,
  { enforceGenreLimit, enforceArtistLimit }: { enforceGenreLimit: boolean; enforceArtistLimit: boolean },
  genreFamilyMap: Map<string, string>
): Promise<CandidateTrack[]> => {
  const selected: CandidateTrack[] = [];
  const artistCounts = new Map<string, number>();
  const genreFamilyCounts = new Map<string, number>(); // Count by genre family, not individual genre
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
      // Map genre to its family representative
      const genreFamily = genreFamilyMap.get(candidate.genre.toLowerCase()) || candidate.genre.toLowerCase();
      const familyCount = genreFamilyCounts.get(genreFamily) ?? 0;
      if (familyCount >= maxGenreCount) {
        continue;
      }
    }

    selected.push(candidate);
    artistCounts.set(candidate.artist, (artistCounts.get(candidate.artist) ?? 0) + 1);
    if (candidate.genre) {
      const genreFamily = genreFamilyMap.get(candidate.genre.toLowerCase()) || candidate.genre.toLowerCase();
      genreFamilyCounts.set(genreFamily, (genreFamilyCounts.get(genreFamily) ?? 0) + 1);
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

/**
 * Calculate dynamic exploration rate based on library context
 * Returns a value between 0.10 (10%) and 0.20 (20%)
 *
 * Formula:
 * - Baseline: 15%
 * - +3% if library >10k tracks (more to explore)
 * - +3% if skip rate >30% (user wants variety)
 * - -3% if has enabled discovery playlist (dedicated discovery exists)
 * - Clamped to [10%, 20%]
 *
 * @returns Exploration rate as decimal (0.10-0.20)
 */
export const calculateExplorationRate = async (): Promise<number> => {
  let rate = 0.15; // Baseline 15%

  try {
    // Get library size
    const librarySize = await getTotalTrackCount();

    // Get recent skip rate (0-1 decimal)
    const skipRate = await getRecentSkipRate();

    // Check if has discovery playlist
    const hasDiscovery = await hasEnabledDiscoveryPlaylist();

    // Adjust rate based on context
    if (librarySize > 10000) {
      rate += 0.03; // +3% for large libraries
    }

    if (skipRate > 0.30) {
      rate += 0.03; // +3% for high skip rate
    }

    if (hasDiscovery) {
      rate -= 0.03; // -3% if has dedicated discovery playlist
    }

    // Clamp to [10%, 20%]
    rate = Math.max(0.10, Math.min(rate, 0.20));

    logger.debug(
      {
        librarySize,
        skipRate: skipRate.toFixed(2),
        hasDiscovery,
        calculatedRate: rate.toFixed(2)
      },
      'calculated dynamic exploration rate'
    );
  } catch (error) {
    // If any error, fall back to baseline
    logger.warn({ error }, 'failed to calculate dynamic exploration rate, using baseline');
    rate = 0.15;
  }

  return rate;
};

export const selectPlaylistTracks = async (
  candidates: CandidateTrack[],
  context: SelectionContext
): Promise<SelectionResult> => {
  // Use provided override, otherwise calculate dynamic rate based on context
  const explorationRate = context.explorationRate ?? await calculateExplorationRate();
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

  // Build genre family map using Last.fm similarity
  const genreSimilarityService = getGenreSimilarityService();
  const allGenres = candidates
    .map(c => c.genre)
    .filter((g): g is string => g !== undefined);
  const uniqueGenres = [...new Set(allGenres)];

  logger.debug(
    { uniqueGenres: uniqueGenres.length, window: context.window },
    'building genre family map for similarity-based selection'
  );

  const genreFamilyMap = await genreSimilarityService.groupGenresIntoFamilies(uniqueGenres);

  logger.debug(
    { families: new Set(genreFamilyMap.values()).size, window: context.window },
    'genre family map built'
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
    const passSelection = await selectWithConstraints(candidates, exploitContext, pass, genreFamilyMap);
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
