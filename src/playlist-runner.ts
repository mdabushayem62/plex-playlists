import { format } from 'date-fns';

import { APP_ENV } from './config.js';
import { recordJobCompletion, recordJobStart, fetchExistingTrackRatingKeys, getPlaylistMetadata, savePlaylist } from './db/repository.js';
import { aggregateHistory } from './history/aggregate.js';
import { fetchHistoryForWindow } from './history/history-service.js';
import { logger } from './logger.js';
import { fetchFallbackCandidates } from './playlist/fallback.js';
import { buildCandidateTracks, type CandidateTrack } from './playlist/candidate-builder.js';
import { selectPlaylistTracks } from './playlist/selector.js';
import { expandWithSonicSimilarity } from './playlist/sonic-expander.js';
import { createAudioPlaylist, deletePlaylist, updatePlaylistSummary } from './plex/playlists.js';
import type { PlaylistWindow } from './windows.js';
import { getWindowDefinition, windowLabel as formatWindowLabel } from './windows.js';
import { formatUserError } from './utils/error-formatter.js';

const mergeCandidates = (primary: CandidateTrack[], fallback: CandidateTrack[]): CandidateTrack[] => {
  const map = new Map<string, CandidateTrack>();
  for (const item of primary) {
    map.set(item.ratingKey, item);
  }
  for (const item of fallback) {
    if (!map.has(item.ratingKey)) {
      map.set(item.ratingKey, item);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.finalScore - a.finalScore);
};

export interface PlaylistRunner {
  run(window: PlaylistWindow, jobId?: number | null): Promise<void>;
  runAllDaily(): Promise<void>;
}

export class DailyPlaylistRunner implements PlaylistRunner {
  async run(window: PlaylistWindow, existingJobId?: number | null): Promise<void> {
    // Use existing job ID (from web UI) or create a new one (from CLI/scheduler)
    const jobId = existingJobId ?? await recordJobStart(window);
    const targetSize = APP_ENV.PLAYLIST_TARGET_SIZE;
    const maxPerArtist = APP_ENV.MAX_PER_ARTIST;
    const fallbackLimit = APP_ENV.FALLBACK_LIMIT;

    try {
      const windowDef = await getWindowDefinition(window);
      if (!windowDef) {
        throw new Error(`Unknown window: ${window}`);
      }
      const genreFilter = windowDef.type === 'genre' ? windowDef.genre : undefined;

      logger.info(
        { window, targetSize, maxPerArtist, fallbackLimit, genreFilter },
        'starting playlist run'
      );

      const historyEntries = await fetchHistoryForWindow(window);
      const aggregatedHistory = aggregateHistory(historyEntries);
      logger.info(
        { window, historyEntries: historyEntries.length, uniqueTracks: aggregatedHistory.length },
        'history retrieved and aggregated'
      );

      let candidates = await buildCandidateTracks(aggregatedHistory, { genreFilter });
      const historyCandidates = candidates.length;

      // For genre playlists with no listening history, use a different strategy:
      // 1. Get high-quality tracks from entire library (no genre filter)
      // 2. Use sonic similarity to find similar tracks
      // 3. Filter sonic results to the target genre
      const useGenreSonicExpansion = genreFilter && historyCandidates === 0;

      if (candidates.length < targetSize && !useGenreSonicExpansion) {
        logger.info({ window, current: candidates.length, target: targetSize }, 'fetching fallback candidates');
        const fallbackCandidates = await fetchFallbackCandidates(fallbackLimit, { genreFilter });
        logger.info({ window, fallbackCount: fallbackCandidates.length }, 'fallback candidates fetched');
        candidates = mergeCandidates(candidates, fallbackCandidates);
      } else if (useGenreSonicExpansion) {
        // Genre playlist with no history - use sonic expansion from high-quality tracks of ANY genre
        logger.info(
          { window, genreFilter, targetSize },
          'no genre history found - using sonic expansion from high-quality tracks across all genres'
        );

        // Get high-quality seed tracks from entire library (no genre filter)
        const seedCandidates = await fetchFallbackCandidates(50, {}); // No genre filter for seeds
        logger.info(
          { window, seedCount: seedCandidates.length },
          'fetched high-quality seed tracks from entire library'
        );

        if (seedCandidates.length > 0) {
          // Use sonic similarity to find tracks similar to high-quality seeds
          const sonicCandidates = await expandWithSonicSimilarity({
            seeds: seedCandidates,
            exclude: new Set(), // No exclusions for initial expansion
            needed: targetSize * 3, // Get extra to ensure enough after genre filtering
            maxSeeds: 20, // Use more seeds for better coverage
            perSeed: 25 // Get more results per seed
          });

          logger.info(
            { window, sonicCount: sonicCandidates.length },
            'fetched sonic similarity candidates'
          );

          // NOW filter to the target genre
          const genreFilteredCandidates = [];
          for (const candidate of sonicCandidates) {
            const candidateGenre = candidate.genre?.toLowerCase() || '';
            const filterGenre = genreFilter.toLowerCase();
            if (candidateGenre.includes(filterGenre)) {
              genreFilteredCandidates.push(candidate);
            }
          }

          logger.info(
            { window, beforeFilter: sonicCandidates.length, afterFilter: genreFilteredCandidates.length },
            'filtered sonic candidates by genre'
          );

          candidates = mergeCandidates(candidates, genreFilteredCandidates);
        }
      }

      logger.info(
        { window, totalCandidates: candidates.length, fromHistory: historyCandidates },
        'candidate pool ready'
      );

      const existingKeys = await fetchExistingTrackRatingKeys(window);
      logger.debug({ window, crossPlaylistExclusions: existingKeys.size }, 'applying cross-playlist deduplication');

      let { selected } = selectPlaylistTracks(candidates, {
        targetCount: targetSize,
        maxPerArtist,
        excludeRatingKeys: existingKeys,
        window
      });

      if (selected.length === 0) {
        throw new Error('no tracks selected for playlist');
      }

      const initialSelection = selected.length;
      let sonicExpansionUsed = false;

      if (selected.length < targetSize) {
        const excludeWithSelected = new Set([...existingKeys, ...selected.map(item => item.ratingKey)]);
        const seeds = selected.length > 0 ? selected : candidates.slice(0, targetSize);
        const needed = targetSize - selected.length;
        logger.info({ window, current: selected.length, needed, seeds: seeds.length }, 'expanding with sonic similarity');

        const sonicCandidates = await expandWithSonicSimilarity({
          seeds,
          exclude: excludeWithSelected,
          needed
        });

        if (sonicCandidates.length > 0) {
          sonicExpansionUsed = true;
          logger.info({ window, sonicCandidates: sonicCandidates.length }, 'sonic candidates fetched');
          candidates = mergeCandidates(candidates, sonicCandidates);
          ({ selected } = selectPlaylistTracks(candidates, {
            targetCount: targetSize,
            maxPerArtist,
            excludeRatingKeys: existingKeys,
            window
          }));
        }
      }

      if (selected.length < targetSize) {
        logger.warn(
          { window, selected: selected.length, target: targetSize },
          'playlist under target size after selection constraints'
        );
      }

      const playlistMetadata = await getPlaylistMetadata(window);
      if (playlistMetadata?.plexRatingKey) {
        try {
          await deletePlaylist(playlistMetadata.plexRatingKey);
        } catch (error) {
          logger.warn({ window, err: error }, 'failed to delete existing playlist, continuing with recreation');
        }
      }

      // Add emoji prefixes for sorting
      const getEmojiPrefix = (window: PlaylistWindow): string => {
        if (windowDef.type === 'genre') {
          return '🎵';
        }
        switch (window) {
          case 'morning': return '🌅';
          case 'afternoon': return '☀️';
          case 'evening': return '🌙';
          default: return '🎵';
        }
      };

      const windowLabelText = formatWindowLabel(window);
      const emoji = getEmojiPrefix(window);
      const title = windowDef.type === 'genre'
        ? `${emoji} Weekly ${windowLabelText}`
        : `${emoji} Daily ${window.charAt(0).toUpperCase()}${window.slice(1)} Mix`;
      const summary = `${windowLabelText} • Generated ${format(new Date(), 'yyyy-MM-dd HH:mm')}`;

      const playlistTracks = selected.map(item => item.track);
      const { ratingKey } = await createAudioPlaylist(title, summary, playlistTracks);
      await updatePlaylistSummary(ratingKey, { title, summary });

      await savePlaylist({
        window,
        title,
        description: summary,
        plexRatingKey: ratingKey,
        generatedAt: new Date(),
        tracks: selected.map((item, index) => ({ ...item, position: index }))
      });

      if (jobId) {
        await recordJobCompletion(jobId, 'success');
      }

      logger.info(
        {
          window,
          playlistRatingKey: ratingKey,
          finalSize: selected.length,
          targetSize,
          historyCandidates,
          totalCandidates: candidates.length,
          initialSelection,
          sonicExpansionUsed,
          crossPlaylistExclusions: existingKeys.size
        },
        'playlist run complete'
      );
    } catch (error) {
      const userFriendlyError = formatUserError(error, `generating ${window} playlist`);

      if (jobId) {
        await recordJobCompletion(jobId, 'failed', userFriendlyError);
      }
      logger.error({ window, err: error }, 'playlist run failed');
      throw error;
    }
  }

  /**
   * Run all three daily time-based playlists sequentially
   * Continues on error to ensure all windows are attempted
   */
  async runAllDaily(): Promise<void> {
    const windows: PlaylistWindow[] = ['morning', 'afternoon', 'evening'];
    const results: Array<{ window: PlaylistWindow; success: boolean; error?: string }> = [];

    logger.info('starting batch generation of all daily playlists');

    for (const window of windows) {
      try {
        await this.run(window);
        results.push({ window, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ window, err: error }, `failed to generate ${window} playlist, continuing to next`);
        results.push({ window, success: false, error: errorMessage });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(
      {
        total: windows.length,
        successful,
        failed,
        results
      },
      'batch generation complete'
    );

    // If any failed, throw to indicate partial failure
    if (failed > 0) {
      const failedWindows = results.filter(r => !r.success).map(r => r.window);
      throw new Error(`Failed to generate ${failed}/${windows.length} playlists: ${failedWindows.join(', ')}`);
    }
  }
}

export const createPlaylistRunner = (): PlaylistRunner => new DailyPlaylistRunner();
