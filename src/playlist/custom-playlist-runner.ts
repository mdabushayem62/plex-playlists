/**
 * Custom Playlist Runner
 * Generates playlists based on user-defined genre/mood combinations
 */

import { format } from 'date-fns';

import { logger } from '../logger.js';
import { getDb } from '../db/index.js';
import { customPlaylists } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchHistoryForWindow } from '../history/history-service.js';
import { aggregateHistory } from '../history/aggregate.js';
import { buildCandidateTracks } from './candidate-builder.js';
import { selectPlaylistTracks } from './selector.js';
import { expandWithSonicSimilarity } from './sonic-expander.js';
import { createAudioPlaylist, updatePlaylistSummary, deletePlaylist } from '../plex/playlists.js';
import { savePlaylist, recordJobStart, recordJobCompletion, getPlaylistMetadata } from '../db/repository.js';
import { formatUserError } from '../utils/error-formatter.js';
import { formatDuration, calculateTotalDuration } from '../utils/format-duration.js';
import { isValidStrategy, parseStrategy } from '../scoring/config.js';
import type { ScoringStrategy } from '../scoring/types.js';
import type { CandidateTrack } from './candidate-builder.js';
import { buildQualityCandidatesFromCache } from './cache-candidate-builder.js';

export interface CustomPlaylistGenerationOptions {
  playlistId: number;
  targetSize?: number;
  historyDays?: number;
  jobId?: number | null;
}

export interface CustomPlaylistConfig {
  name: string;
  genres: string[];
  moods: string[];
  targetSize?: number;
  description?: string;
  scoringStrategy?: ScoringStrategy;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate custom playlist configuration
 * Checks name, genres, moods, and target size constraints
 *
 * @param config - Playlist configuration to validate
 * @returns Validation result with error message if invalid
 */
export function validateCustomPlaylistConfig(config: CustomPlaylistConfig): ValidationResult {
  // Validate name
  if (!config.name || typeof config.name !== 'string' || config.name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }

  // Validate arrays
  if (!Array.isArray(config.genres) || !Array.isArray(config.moods)) {
    return { valid: false, error: 'Genres and moods must be arrays' };
  }

  // Validate genre count
  if (config.genres.length > 2) {
    return { valid: false, error: 'Maximum 2 genres allowed' };
  }

  // Validate mood count
  if (config.moods.length > 2) {
    return { valid: false, error: 'Maximum 2 moods allowed' };
  }

  // Validate at least one genre or mood
  if (config.genres.length === 0 && config.moods.length === 0) {
    return { valid: false, error: 'At least one genre or mood is required' };
  }

  // Validate target size
  if (config.targetSize !== undefined && (config.targetSize < 10 || config.targetSize > 200)) {
    return { valid: false, error: 'Target size must be between 10 and 200' };
  }

  // Validate scoring strategy
  if (config.scoringStrategy && !isValidStrategy(config.scoringStrategy)) {
    return { valid: false, error: `Invalid scoring strategy: ${config.scoringStrategy}. Must be one of: balanced, quality, discovery, throwback` };
  }

  return { valid: true };
}

/**
 * Check if a playlist name already exists in the database
 *
 * @param name - Playlist name to check
 * @param excludeId - Optional playlist ID to exclude from check (for updates)
 * @returns True if name already exists
 */
export async function customPlaylistNameExists(name: string, excludeId?: number): Promise<boolean> {
  const db = getDb();
  const existing = await db
    .select()
    .from(customPlaylists)
    .where(eq(customPlaylists.name, name.trim()))
    .limit(1);

  if (existing.length === 0) {
    return false;
  }

  // If excludeId is provided, check if it's the same playlist (for updates)
  if (excludeId !== undefined && existing[0].id === excludeId) {
    return false;
  }

  return true;
}

/**
 * Fetch library-wide candidates for custom playlists with genre/mood filtering
 * Uses cache-based candidate builder for ultra-fast performance (<1s vs 30-45s)
 * Uses the specified scoring strategy for candidate ranking
 */
async function fetchLibraryCandidates(
  genres: string[],
  moods: string[],
  targetSize: number,
  strategy: ScoringStrategy = 'quality'
): Promise<CandidateTrack[]> {
  logger.info(
    { genres, moods, targetSize, strategy },
    'fetching library-wide candidates from track cache'
  );

  // Use cache-based candidate builder for instant results
  const candidates = await buildQualityCandidatesFromCache(
    genres,
    moods,
    targetSize,
    strategy
  );

  logger.info(
    {
      totalCandidates: candidates.length,
      avgScore: candidates.length > 0
        ? (candidates.reduce((sum, c) => sum + c.finalScore, 0) / candidates.length).toFixed(3)
        : 0
    },
    'library candidates fetched from cache'
  );

  return candidates;
}

/**
 * Generate a single custom playlist
 */
export async function generateCustomPlaylist(
  options: CustomPlaylistGenerationOptions
): Promise<void> {
  const { playlistId, historyDays = 30 } = options;
  const db = getDb();

  // Get playlist config
  const playlistConfigs = await db
    .select()
    .from(customPlaylists)
    .where(eq(customPlaylists.id, playlistId))
    .limit(1);

  if (playlistConfigs.length === 0) {
    throw new Error(`Custom playlist ${playlistId} not found`);
  }

  const config = playlistConfigs[0];

  // Parse JSON fields
  const genres = JSON.parse(config.genres) as string[];
  const moods = JSON.parse(config.moods) as string[];
  const targetSize = options.targetSize || config.targetSize || 50;
  const strategy = parseStrategy(config.scoringStrategy, 'quality');

  // Use a pseudo-window name for the custom playlist (e.g., "custom-energetic-metal")
  const windowName = `custom-${config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Use existing job ID (from web UI) or create a new one
  const jobId = options.jobId ?? await recordJobStart(windowName);

  logger.info(
    {
      playlistId,
      name: config.name,
      genres,
      moods,
      targetSize,
      window: windowName,
      jobId
    },
    'generating custom playlist'
  );

  try {
    // Step 1: Try recent history first (with quality-first scoring)
    const history = await fetchHistoryForWindow('all', historyDays);
    logger.debug({ historyEntries: history.length }, 'fetched listening history');

    const aggregated = aggregateHistory(history);
    logger.debug({ uniqueTracks: aggregated.length }, 'aggregated history');

    // Build candidates from recent history with configured scoring strategy
    // Map strategy to legacy scoring mode for buildCandidateTracks compatibility
    const scoringMode = strategy === 'balanced' ? 'standard' : 'quality-first';
    let candidates = await buildCandidateTracks(aggregated, {
      genreFilters: genres.length > 0 ? genres : undefined,
      moodFilters: moods.length > 0 ? moods : undefined,
      scoringMode
    });

    logger.info(
      {
        candidatesFromHistory: candidates.length,
        genres,
        moods
      },
      'built candidates from recent history'
    );

    // Step 2: If insufficient candidates, fall back to library-wide search
    if (candidates.length < targetSize) {
      logger.info(
        { historyCandidates: candidates.length, targetSize },
        'insufficient candidates from history, falling back to library search'
      );

      const libraryCandidates = await fetchLibraryCandidates(genres, moods, targetSize * 2, strategy);

      // Merge with history candidates (dedup by ratingKey)
      const existingKeys = new Set(candidates.map(c => c.ratingKey));
      const newCandidates = libraryCandidates.filter(c => !existingKeys.has(c.ratingKey));

      candidates = [...candidates, ...newCandidates];

      logger.info(
        {
          totalCandidates: candidates.length,
          fromHistory: candidates.length - newCandidates.length,
          fromLibrary: newCandidates.length
        },
        'merged history and library candidates'
      );
    }

    if (candidates.length === 0) {
      logger.warn(
        { genres, moods },
        'no candidates found matching genre/mood filters'
      );
      throw new Error('No tracks found matching the specified genres and moods');
    }

    // Step 4: Select tracks (with constraints)
    const selectionResult = await selectPlaylistTracks(candidates, {
      targetCount: targetSize,
      maxPerArtist: 2,
      window: windowName
    });
    let selected = selectionResult.selected;
    logger.debug({ initialSelection: selected.length }, 'initial selection');

    // Step 5: Sonic expansion if needed
    if (selected.length < targetSize && selected.length > 0) {
      const seedTracks = selected.slice(0, Math.min(5, selected.length));
      const expanded = await expandWithSonicSimilarity({
        seeds: seedTracks,
        exclude: new Set(selected.map(t => t.ratingKey)),
        needed: targetSize - selected.length
      });

      if (expanded.length > 0) {
        selected = [...selected, ...expanded];
        logger.info(
          { addedTracks: expanded.length, totalTracks: selected.length },
          'applied sonic expansion'
        );
      }
    }

    // Step 6: Create/update Plex playlist
    const playlistTitle = `🎵 ${config.name}`;
    const playlistTracks = selected.map(c => c.track);
    const totalDuration = calculateTotalDuration(playlistTracks);
    const formattedDuration = formatDuration(totalDuration);
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm');
    const trackCount = selected.length;

    // Build context string (genres and moods)
    const contextParts: string[] = [];
    if (genres.length > 0) {
      contextParts.push(`Genres: ${genres.join(', ')}`);
    }
    if (moods.length > 0) {
      contextParts.push(`Moods: ${moods.join(', ')}`);
    }
    const context = contextParts.length > 0
      ? contextParts.join(' • ')
      : config.description || 'Custom playlist';

    // Format: "50 tracks • 2h 47m • Genres: electronic, ambient • Updated 2025-10-10 17:30"
    const description = `${trackCount} tracks • ${formattedDuration} • ${context} • Updated ${timestamp}`;

    // Delete existing playlist if it exists (similar to daily playlists)
    const playlistMetadata = await getPlaylistMetadata(windowName);
    if (playlistMetadata?.plexRatingKey) {
      try {
        await deletePlaylist(playlistMetadata.plexRatingKey);
      } catch (error) {
        logger.warn({ window: windowName, err: error }, 'failed to delete existing playlist, continuing with recreation');
      }
    }

    const { ratingKey: plexRatingKey } = await createAudioPlaylist(
      playlistTitle,
      description,
      playlistTracks
    );

    // Update playlist summary/description
    await updatePlaylistSummary(plexRatingKey, {
      title: playlistTitle,
      summary: description
    });

    // Step 7: Save to database
    await savePlaylist({
      window: windowName,
      plexRatingKey,
      title: playlistTitle,
      description,
      generatedAt: new Date(),
      tracks: selected.map((track, index) => ({ ...track, position: index }))
    });

    if (jobId) {
      await recordJobCompletion(jobId, 'success');
    }

    logger.info(
      {
        playlistId,
        name: config.name,
        trackCount: selected.length,
        plexRatingKey,
        jobId
      },
      'custom playlist generated successfully'
    );
  } catch (error) {
    const userFriendlyError = formatUserError(error, `generating custom playlist: ${config.name}`);

    if (jobId) {
      await recordJobCompletion(jobId, 'failed', userFriendlyError);
    }

    logger.error(
      {
        playlistId,
        name: config.name,
        error: error instanceof Error ? error.message : String(error),
        jobId
      },
      'failed to generate custom playlist'
    );
    throw error;
  }
}

/**
 * Generate all enabled custom playlists
 */
export async function generateAllCustomPlaylists(
  historyDays = 30
): Promise<{ successful: number; failed: number }> {
  const db = getDb();

  // Get all enabled custom playlists
  const playlists = await db
    .select()
    .from(customPlaylists)
    .where(eq(customPlaylists.enabled, true));

  logger.info(
    { totalPlaylists: playlists.length },
    'generating all custom playlists'
  );

  let successful = 0;
  let failed = 0;

  for (const playlist of playlists) {
    try {
      await generateCustomPlaylist({
        playlistId: playlist.id,
        historyDays
      });
      successful++;
    } catch (error) {
      logger.error(
        {
          playlistId: playlist.id,
          name: playlist.name,
          error: error instanceof Error ? error.message : String(error)
        },
        'custom playlist generation failed'
      );
      failed++;
    }
  }

  logger.info(
    { successful, failed, total: playlists.length },
    'custom playlist generation batch complete'
  );

  return { successful, failed };
}
