import { format } from 'date-fns';

import { APP_ENV } from './config.js';
import { recordJobCompletion, recordJobStart, fetchExistingTrackRatingKeys, getPlaylistMetadata, savePlaylist } from './db/repository.js';
import { aggregateHistory } from './history/aggregate.js';
import { fetchHistoryForWindow } from './history/history-service.js';
import { logger } from './logger.js';
import { fetchFallbackCandidates } from './playlist/fallback.js';
import { buildCandidateTracks, type CandidateTrack } from './playlist/candidate-builder.js';
import { fetchDiscoveryTracks } from './playlist/discovery.js';
import { fetchThrowbackTracks } from './playlist/throwback.js';
import { selectPlaylistTracks } from './playlist/selector.js';
import { expandWithSonicSimilarity } from './playlist/sonic-expander.js';
import { createAudioPlaylist, deletePlaylist } from './plex/playlists.js';
import type { PlaylistWindow } from './windows.js';
import { getWindowDefinition, windowLabel as formatWindowLabel } from './windows.js';
import { formatUserError } from './utils/error-formatter.js';
import { formatDuration, calculateTotalDuration } from './utils/format-duration.js';

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
      const genreFilter = undefined; // Genre filtering handled by custom playlists

      logger.info(
        { window, targetSize, maxPerArtist, fallbackLimit, genreFilter },
        'starting playlist run'
      );

      let candidates: CandidateTrack[];
      let historyCandidates: number;

      // Discovery playlist uses a different strategy: find long-forgotten or never-played tracks
      if (window === 'discovery') {
        logger.info(
          { window, targetSize, minDaysSincePlay: APP_ENV.DISCOVERY_DAYS },
          'generating discovery playlist from library-wide scan'
        );

        candidates = await fetchDiscoveryTracks(targetSize, APP_ENV.DISCOVERY_DAYS);
        historyCandidates = 0; // Discovery doesn't use listening history

        logger.info(
          { window, discoveryCandidates: candidates.length, targetSize },
          'discovery candidates fetched and scored'
        );
      } else if (window === 'throwback') {
        // Throwback playlist: nostalgic tracks from 2-5 years ago
        logger.info(
          {
            window,
            targetSize,
            lookbackWindow: {
              start: APP_ENV.THROWBACK_LOOKBACK_START,
              end: APP_ENV.THROWBACK_LOOKBACK_END
            },
            recentExclusion: APP_ENV.THROWBACK_RECENT_EXCLUSION
          },
          'generating throwback playlist from historical listening'
        );

        candidates = await fetchThrowbackTracks(
          targetSize,
          APP_ENV.THROWBACK_LOOKBACK_START,
          APP_ENV.THROWBACK_LOOKBACK_END,
          APP_ENV.THROWBACK_RECENT_EXCLUSION
        );
        historyCandidates = 0; // Throwback uses historical window, not recent history

        logger.info(
          { window, throwbackCandidates: candidates.length, targetSize },
          'throwback candidates fetched and scored'
        );
      } else {
        // Standard time-based or genre playlists use listening history
        const historyEntries = await fetchHistoryForWindow(window);
        const aggregatedHistory = aggregateHistory(historyEntries);
        logger.info(
          { window, historyEntries: historyEntries.length, uniqueTracks: aggregatedHistory.length },
          'history retrieved and aggregated'
        );

        candidates = await buildCandidateTracks(aggregatedHistory, { genreFilter });
        historyCandidates = candidates.length;
      }

      // For genre playlists with no listening history, use a different strategy:
      // 1. Get high-quality tracks from entire library (no genre filter)
      // 2. Use sonic similarity to find similar tracks
      // 3. Filter sonic results to the target genre
      // Note: Genre filtering now handled by custom playlists, so this path is disabled
      const useGenreSonicExpansion = false;

      if (candidates.length < targetSize && !useGenreSonicExpansion) {
        logger.info({ window, current: candidates.length, target: targetSize }, 'fetching fallback candidates');
        const fallbackCandidates = await fetchFallbackCandidates(fallbackLimit, { genreFilter });
        logger.info({ window, fallbackCount: fallbackCandidates.length }, 'fallback candidates fetched');
        candidates = mergeCandidates(candidates, fallbackCandidates);
      }
      // Note: Genre-based sonic expansion (useGenreSonicExpansion) disabled - handled by custom playlists

      logger.info(
        { window, totalCandidates: candidates.length, fromHistory: historyCandidates },
        'candidate pool ready'
      );

      // Fetch cross-playlist exclusions (tracks from other playlists in last N days)
      const crossPlaylistKeys = await fetchExistingTrackRatingKeys(window);

      // Optionally fetch same-window exclusions (tracks from this playlist in last N days)
      // This prevents repetition within the same playlist type
      // const sameWindowKeys = await fetchRecentlyRecommendedForWindow(window);
      // const excludeKeys = new Set([...crossPlaylistKeys, ...sameWindowKeys]);

      // For now, just use cross-playlist exclusions
      const excludeKeys = crossPlaylistKeys;

      logger.debug(
        {
          window,
          crossPlaylistExclusions: crossPlaylistKeys.size,
          exclusionDays: APP_ENV.EXCLUSION_DAYS
        },
        'applying time-based cross-playlist deduplication'
      );

      let { selected } = selectPlaylistTracks(candidates, {
        targetCount: targetSize,
        maxPerArtist,
        excludeRatingKeys: excludeKeys,
        window
      });

      if (selected.length === 0) {
        throw new Error('no tracks selected for playlist');
      }

      const initialSelection = selected.length;
      let sonicExpansionUsed = false;

      if (selected.length < targetSize) {
        const excludeWithSelected = new Set([...excludeKeys, ...selected.map(item => item.ratingKey)]);
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
            excludeRatingKeys: excludeKeys,
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
        switch (window) {
          case 'morning': return '🌅';
          case 'afternoon': return '☀️';
          case 'evening': return '🌙';
          case 'discovery': return '🔍';
          case 'throwback': return '⏪';
          default: return '🎵';
        }
      };

      const windowLabelText = formatWindowLabel(window);
      const emoji = getEmojiPrefix(window);
      const baseTitle = windowDef.type === 'special'
        ? `${emoji} Weekly ${windowLabelText}`
        : `${emoji} Daily ${window.charAt(0).toUpperCase()}${window.slice(1)} Mix`;

      const playlistTracks = selected.map(item => item.track);
      const totalDuration = calculateTotalDuration(playlistTracks);
      const formattedDuration = formatDuration(totalDuration);
      const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm');
      const trackCount = selected.length;

      // Format: "50 tracks • 3h 24m • Morning 06:00-11:59 • Updated 2025-10-10 17:30"
      const summary = `${trackCount} tracks • ${formattedDuration} • ${windowLabelText} • Updated ${timestamp}`;

      let ratingKey: string;
      let title = baseTitle;

      try {
        const result = await createAudioPlaylist(title, summary, playlistTracks);
        ratingKey = result.ratingKey;
      } catch (error) {
        // If all retries failed, create with timestamped title (don't replace existing)
        logger.error(
          { window, baseTitle, err: error },
          'failed to create playlist after retries, creating with timestamped title'
        );

        const timestampedTitle = `${baseTitle} (${format(new Date(), 'yyyy-MM-dd HH:mm')})`;
        title = timestampedTitle;

        try {
          const result = await createAudioPlaylist(timestampedTitle, summary, playlistTracks);
          ratingKey = result.ratingKey;
          logger.warn(
            { window, timestampedTitle, ratingKey },
            'created playlist with timestamped title as fallback'
          );
        } catch (fallbackError) {
          logger.error(
            { window, timestampedTitle, err: fallbackError },
            'failed to create playlist even with timestamped title'
          );
          throw fallbackError;
        }
      }
      // Note: Summary is already set during createAudioPlaylist(), no need for redundant update

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
          crossPlaylistExclusions: excludeKeys.size,
          exclusionDays: APP_ENV.EXCLUSION_DAYS
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
