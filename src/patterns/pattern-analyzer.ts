/**
 * Pattern Analyzer
 * Extracts user preference patterns from deep playback history
 */

import { subDays } from 'date-fns';

import { logger } from '../logger.js';
import { getPlexServer } from '../plex/client.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import type {
  UserPatterns,
  PatternAnalysisOptions,
  GenreHourAggregation,
  HourlyGenrePreference,
} from './types.js';

interface HistoryMetadatum {
  ratingKey?: string;
  type?: string;
  viewedAt?: number;
}

interface HistoryMediaContainer {
  size: number;
  Metadata?: HistoryMetadatum[];
}

/**
 * Default analysis options
 */
const DEFAULT_OPTIONS: Required<PatternAnalysisOptions> = {
  lookbackDays: 90,
  minPlaysThreshold: 2,
  maxGenresPerHour: 10,
};

/**
 * Fetch playback history from Plex for pattern analysis
 * Uses raw /status/sessions/history/all endpoint for deep history access
 *
 * @param lookbackDays - How many days of history to fetch
 * @returns Array of { ratingKey, viewedAt } entries
 */
async function fetchPlaybackHistory(
  lookbackDays: number
): Promise<Array<{ ratingKey: string; viewedAt: Date }>> {
  const server = await getPlexServer();
  const mindate = subDays(new Date(), lookbackDays);
  const mindateTimestamp = Math.floor(mindate.getTime() / 1000);

  logger.debug(
    {
      lookbackDays,
      mindate: mindate.toISOString(),
      mindateTimestamp,
    },
    'fetching playback history for pattern analysis'
  );

  // Get music library section ID for filtering
  const library = await server.library();
  const sections = await library.sections();
  const musicSection = sections.find((s) => s.CONTENT_TYPE === 'audio');
  const musicSectionId = musicSection?.key;

  if (!musicSectionId) {
    logger.warn('no music library section found, skipping pattern analysis');
    return [];
  }

  // Fetch history with music library filter
  const historyPath = `/status/sessions/history/all?mindate=${mindateTimestamp}&librarySectionID=${musicSectionId}&sort=viewedAt:desc`;

  const rawResponse = await server.query<{ MediaContainer?: HistoryMediaContainer }>(
    historyPath,
    'get'
  );

  const container = rawResponse?.MediaContainer;
  if (!container || !container.Metadata) {
    logger.warn(
      { historyPath, containerSize: container?.size },
      'no history metadata returned'
    );
    return [];
  }

  logger.debug(
    {
      totalSessions: container.size,
      metadataCount: container.Metadata.length,
    },
    'received raw history from plex'
  );

  // Filter to tracks only and extract ratingKey + viewedAt
  const history: Array<{ ratingKey: string; viewedAt: Date }> = [];

  for (const item of container.Metadata) {
    if (!item || item.type !== 'track') {
      continue;
    }

    const ratingKey = item.ratingKey;
    const viewedAt = item.viewedAt;

    if (!ratingKey || !viewedAt) {
      continue;
    }

    // Convert timestamp (seconds) to Date
    const viewedDate =
      viewedAt > 1_000_000_000_000
        ? new Date(viewedAt)
        : new Date(viewedAt * 1000);

    history.push({ ratingKey, viewedAt: viewedDate });
  }

  logger.info(
    {
      totalSessions: container.size,
      trackSessions: history.length,
      dateRange: {
        from: mindate.toISOString(),
        to: new Date().toISOString(),
      },
    },
    'extracted track history for pattern analysis'
  );

  return history;
}

/**
 * Aggregate playback history by hour and genre
 *
 * @param history - Array of { ratingKey, viewedAt }
 * @param trackGenreMap - Map of ratingKey -> genres[]
 * @returns Array of { genre, hour, playCount }
 */
function aggregateByHourAndGenre(
  history: Array<{ ratingKey: string; viewedAt: Date }>,
  trackGenreMap: Map<string, string[]>
): GenreHourAggregation[] {
  // Map: "hour:genre" -> playCount
  const aggregationMap = new Map<string, number>();

  for (const entry of history) {
    const genres = trackGenreMap.get(entry.ratingKey);
    if (!genres || genres.length === 0) {
      continue;
    }

    const hour = entry.viewedAt.getHours();

    // Count each genre for this play
    for (const genre of genres) {
      const normalizedGenre = genre.trim().toLowerCase();
      if (!normalizedGenre) {
        continue;
      }

      const key = `${hour}:${normalizedGenre}`;
      const currentCount = aggregationMap.get(key) || 0;
      aggregationMap.set(key, currentCount + 1);
    }
  }

  // Convert map to array
  const aggregations: GenreHourAggregation[] = [];
  for (const [key, playCount] of aggregationMap.entries()) {
    const [hourStr, genre] = key.split(':', 2);
    aggregations.push({
      hour: parseInt(hourStr, 10),
      genre,
      playCount,
    });
  }

  return aggregations;
}

/**
 * Calculate preference weights for genre+hour combinations
 * Weight = (playCount for this genre at this hour) / (total plays at this hour)
 *
 * @param aggregations - Raw aggregations
 * @param minPlaysThreshold - Minimum plays to include
 * @param maxGenresPerHour - Max genres to keep per hour (top N by playCount)
 * @returns Array of HourlyGenrePreference with calculated weights
 */
function calculateWeights(
  aggregations: GenreHourAggregation[],
  minPlaysThreshold: number,
  maxGenresPerHour: number
): HourlyGenrePreference[] {
  // Calculate total plays per hour
  const totalPlaysByHour = new Map<number, number>();
  for (const agg of aggregations) {
    const current = totalPlaysByHour.get(agg.hour) || 0;
    totalPlaysByHour.set(agg.hour, current + agg.playCount);
  }

  // Calculate weights
  const preferences: HourlyGenrePreference[] = [];
  for (const agg of aggregations) {
    // Filter: minimum plays threshold
    if (agg.playCount < minPlaysThreshold) {
      continue;
    }

    const totalPlaysThisHour = totalPlaysByHour.get(agg.hour) || 1;
    const weight = agg.playCount / totalPlaysThisHour;

    preferences.push({
      hour: agg.hour,
      genre: agg.genre,
      weight,
      playCount: agg.playCount,
    });
  }

  // Sort by hour, then by playCount descending
  preferences.sort((a, b) => {
    if (a.hour !== b.hour) {
      return a.hour - b.hour;
    }
    return b.playCount - a.playCount;
  });

  // Limit to top N genres per hour
  const limitedPreferences: HourlyGenrePreference[] = [];
  const genresPerHour = new Map<number, number>();

  for (const pref of preferences) {
    const count = genresPerHour.get(pref.hour) || 0;
    if (count < maxGenresPerHour) {
      limitedPreferences.push(pref);
      genresPerHour.set(pref.hour, count + 1);
    }
  }

  return limitedPreferences;
}

/**
 * Calculate peak listening hours from history
 *
 * @param history - Playback history
 * @returns Array of hours (0-23) sorted by play count descending
 */
function calculatePeakHours(
  history: Array<{ ratingKey: string; viewedAt: Date }>
): number[] {
  const playsByHour = new Map<number, number>();

  for (const entry of history) {
    const hour = entry.viewedAt.getHours();
    const current = playsByHour.get(hour) || 0;
    playsByHour.set(hour, current + 1);
  }

  // Sort hours by play count descending, take top 5
  const sortedHours = Array.from(playsByHour.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour]) => hour);

  return sortedHours;
}

/**
 * Analyze user patterns from deep playback history
 *
 * Main entry point for pattern extraction:
 * 1. Fetch playback history (default: 90 days)
 * 2. Fetch track metadata in batches to get genres
 * 3. Aggregate by hour (0-23) and genre
 * 4. Calculate preference weights
 * 5. Identify peak listening hours
 *
 * Performance: ~100ms for 14k sessions (700KB data)
 *
 * @param options - Analysis configuration
 * @returns UserPatterns with hourly genre preferences
 */
export async function analyzeUserPatterns(
  options: PatternAnalysisOptions = {}
): Promise<UserPatterns> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const startTime = Date.now();
  const analyzedFrom = subDays(new Date(), opts.lookbackDays);
  const analyzedTo = new Date();

  logger.info(
    {
      lookbackDays: opts.lookbackDays,
      minPlaysThreshold: opts.minPlaysThreshold,
      maxGenresPerHour: opts.maxGenresPerHour,
    },
    'starting pattern analysis'
  );

  // Step 1: Fetch playback history
  const history = await fetchPlaybackHistory(opts.lookbackDays);

  if (history.length === 0) {
    logger.warn('no playback history found, returning empty patterns');
    return {
      hourlyGenrePreferences: [],
      peakHours: [],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 0,
      analyzedFrom,
      analyzedTo,
    };
  }

  // Step 2: Fetch track metadata in batches to get genres
  const uniqueRatingKeys = Array.from(new Set(history.map((h) => h.ratingKey)));
  logger.debug(
    { totalSessions: history.length, uniqueTracks: uniqueRatingKeys.length },
    'fetching track metadata for genre extraction'
  );

  const tracksMap = await fetchTracksByRatingKeys(uniqueRatingKeys);

  // Build ratingKey -> genres[] map
  const trackGenreMap = new Map<string, string[]>();
  for (const [ratingKey, track] of tracksMap.entries()) {
    const genres: string[] = [];

    // Extract genres from Track object (may be in various formats)
    if (track.genres && Array.isArray(track.genres)) {
      // If genres is already an array
      genres.push(
        ...track.genres
          .map((g: unknown) => {
            if (typeof g === 'string') {
              return g;
            }
            if (g && typeof g === 'object' && 'tag' in g) {
              return (g as { tag?: string }).tag;
            }
            return null;
          })
          .filter((g): g is string => g != null)
      );
    }

    trackGenreMap.set(ratingKey, genres);
  }

  const tracksWithGenres = Array.from(trackGenreMap.values()).filter(
    (g) => g.length > 0
  ).length;

  logger.debug(
    { totalTracks: tracksMap.size, tracksWithGenres },
    'extracted genres from track metadata'
  );

  // Step 3: Aggregate by hour and genre
  const aggregations = aggregateByHourAndGenre(history, trackGenreMap);

  logger.debug(
    { aggregationCount: aggregations.length },
    'aggregated playback by hour and genre'
  );

  // Step 4: Calculate preference weights
  const hourlyGenrePreferences = calculateWeights(
    aggregations,
    opts.minPlaysThreshold,
    opts.maxGenresPerHour
  );

  // Step 5: Calculate peak hours
  const peakHours = calculatePeakHours(history);

  const duration = Date.now() - startTime;

  logger.info(
    {
      sessionsAnalyzed: history.length,
      uniqueTracks: uniqueRatingKeys.length,
      tracksWithGenres,
      hourlyPreferences: hourlyGenrePreferences.length,
      peakHours,
      durationMs: duration,
    },
    'pattern analysis complete'
  );

  return {
    hourlyGenrePreferences,
    peakHours,
    lastAnalyzed: new Date(),
    sessionsAnalyzed: history.length,
    analyzedFrom,
    analyzedTo,
  };
}
