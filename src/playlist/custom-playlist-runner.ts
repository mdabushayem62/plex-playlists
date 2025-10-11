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
import { createAudioPlaylist, updatePlaylistSummary } from '../plex/playlists.js';
import { savePlaylist, recordJobStart, recordJobCompletion } from '../db/repository.js';
import { formatUserError } from '../utils/error-formatter.js';
import { formatDuration, calculateTotalDuration } from '../utils/format-duration.js';

export interface CustomPlaylistGenerationOptions {
  playlistId: number;
  targetSize?: number;
  historyDays?: number;
  jobId?: number | null;
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
    // Step 1: Get listening history (all time windows combined for custom playlists)
    const history = await fetchHistoryForWindow('all', historyDays);
    logger.debug({ historyEntries: history.length }, 'fetched listening history');

    // Step 2: Aggregate history
    const aggregated = aggregateHistory(history);
    logger.debug({ uniqueTracks: aggregated.length }, 'aggregated history');

    // Step 3: Build candidates with genre/mood filtering
    const candidates = await buildCandidateTracks(aggregated, {
      genreFilters: genres.length > 0 ? genres : undefined,
      moodFilters: moods.length > 0 ? moods : undefined
    });

    logger.info(
      {
        totalCandidates: candidates.length,
        genres,
        moods
      },
      'built filtered candidates'
    );

    if (candidates.length === 0) {
      logger.warn(
        { genres, moods },
        'no candidates found matching genre/mood filters'
      );
      throw new Error('No tracks found matching the specified genres and moods');
    }

    // Step 4: Select tracks (with constraints)
    const selectionResult = selectPlaylistTracks(candidates, {
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
    const playlistTitle = config.name;
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
