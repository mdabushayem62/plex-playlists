/**
 * Custom Playlist Runner
 * Generates playlists based on user-defined genre/mood combinations
 */

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
import { savePlaylist } from '../db/repository.js';

export interface CustomPlaylistGenerationOptions {
  playlistId: number;
  targetSize?: number;
  historyDays?: number;
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

  logger.info(
    {
      playlistId,
      name: config.name,
      genres,
      moods,
      targetSize
    },
    'generating custom playlist'
  );

  // Use a pseudo-window name for the custom playlist (e.g., "custom-energetic-metal")
  const windowName = `custom-${config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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
    const description = config.description ||
      `${genres.length > 0 ? genres.join(', ') : 'All genres'} • ${moods.length > 0 ? moods.join(', ') : 'All moods'}`;

    const { ratingKey: plexRatingKey } = await createAudioPlaylist(
      playlistTitle,
      description,
      selected.map(c => c.track)
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

    logger.info(
      {
        playlistId,
        name: config.name,
        trackCount: selected.length,
        plexRatingKey
      },
      'custom playlist generated successfully'
    );
  } catch (error) {
    logger.error(
      {
        playlistId,
        name: config.name,
        error: error instanceof Error ? error.message : String(error)
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
