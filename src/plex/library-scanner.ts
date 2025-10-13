/**
 * Library Scanner
 * Batch fetches all tracks from Plex music library with pagination support
 * Used for initial track cache population and full library scans
 */

import { Track } from '@ctrl/plex';
import { logger } from '../logger.js';
import { getPlexServer } from './client.js';

// Cache for music library section ID (fetched once per session)
let musicLibrarySectionId: string | null = null;

export const getMusicLibrarySectionId = async (): Promise<string | null> => {
  if (musicLibrarySectionId) {
    return musicLibrarySectionId;
  }

  try {
    const server = await getPlexServer();
    const library = await server.library();
    const sections = await library.sections();
    const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');

    if (musicSection) {
      musicLibrarySectionId = musicSection.key;
      logger.debug(
        { sectionId: musicLibrarySectionId, title: musicSection.title },
        'found music library section'
      );
      return musicLibrarySectionId;
    }

    logger.warn('no music library section found');
    return null;
  } catch (error) {
    logger.error({ error }, 'failed to get music library section');
    return null;
  }
};

export interface LibraryScanOptions {
  batchSize?: number; // Tracks per batch (default: 50)
  maxTracks?: number; // Maximum tracks to fetch (default: unlimited)
  onProgress?: (current: number, total: number, batch: Track[]) => void | Promise<void>;
  signal?: AbortSignal; // Support cancellation
}

export interface LibraryScanResult {
  tracks: Track[];
  totalFetched: number;
  cancelled: boolean;
}

interface MediaContainer {
  MediaContainer?: {
    size?: number;
    totalSize?: number;
    Metadata?: Array<Record<string, unknown>>;
  };
}

/**
 * Scan entire music library and return all tracks
 * Uses pagination to handle large libraries efficiently
 *
 * @param options - Scan configuration
 * @returns Promise<LibraryScanResult> with all fetched tracks
 *
 * @example
 * ```typescript
 * // Basic scan
 * const { tracks } = await scanLibrary();
 *
 * // With progress tracking
 * const { tracks } = await scanLibrary({
 *   onProgress: (current, total, batch) => {
 *     console.log(`Progress: ${current}/${total} tracks`);
 *   }
 * });
 *
 * // With cancellation support
 * const abortController = new AbortController();
 * const { tracks, cancelled } = await scanLibrary({ signal: abortController.signal });
 * ```
 */
export const scanLibrary = async (
  options: LibraryScanOptions = {}
): Promise<LibraryScanResult> => {
  const {
    batchSize = 50,
    maxTracks = Infinity,
    onProgress,
    signal
  } = options;

  const sectionId = await getMusicLibrarySectionId();
  if (!sectionId) {
    throw new Error('No music library section found. Ensure Plex has a music library configured.');
  }

  const server = await getPlexServer();
  const allTracks: Track[] = [];
  let offset = 0;
  let totalSize: number | undefined;
  let cancelled = false;

  logger.info(
    { sectionId, batchSize, maxTracks: maxTracks === Infinity ? 'unlimited' : maxTracks },
    'starting library scan'
  );

  while (offset < maxTracks) {
    // Check for cancellation
    if (signal?.aborted) {
      logger.info({ tracksScanned: allTracks.length }, 'library scan cancelled');
      cancelled = true;
      break;
    }

    try {
      // Fetch batch using Plex API: /library/sections/{sectionId}/all?type=10&X-Plex-Container-Start={offset}&X-Plex-Container-Size={batchSize}
      // type=10 is for tracks (type=8 is artists, type=9 is albums)
      const endpoint = `/library/sections/${sectionId}/all?type=10&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${batchSize}`;
      const data = await server.query<MediaContainer>(endpoint);

      const container = data?.MediaContainer;
      if (!container) {
        logger.warn({ offset, endpoint }, 'no media container in response');
        break;
      }

      // Extract total size from first response
      if (totalSize === undefined && container.totalSize !== undefined) {
        totalSize = container.totalSize;
        logger.info({ totalSize, batchSize }, 'discovered total library size');
      }

      const metadata = container.Metadata;
      if (!Array.isArray(metadata) || metadata.length === 0) {
        logger.debug({ offset }, 'no more tracks in library (empty batch)');
        break;
      }

      // Convert raw metadata to Track objects
      const batch: Track[] = [];
      for (const item of metadata) {
        try {
          // Create Track instance from raw metadata
          // Track constructor: new Track(server, data, initpath, parent)
          const track = new Track(server, item, endpoint, undefined);
          batch.push(track);
        } catch (error) {
          logger.warn(
            { error, ratingKey: item.ratingKey },
            'failed to create Track object, skipping'
          );
        }
      }

      allTracks.push(...batch);
      offset += batch.length;

      // Call progress callback
      if (onProgress) {
        try {
          await onProgress(allTracks.length, totalSize || allTracks.length, batch);
        } catch (error) {
          logger.warn({ error }, 'progress callback threw error, continuing scan');
        }
      }

      logger.debug(
        {
          batchSize: batch.length,
          totalFetched: allTracks.length,
          offset,
          totalSize: totalSize || 'unknown'
        },
        'fetched library batch'
      );

      // Stop if we got less than requested (end of library)
      if (batch.length < batchSize) {
        logger.info({ totalFetched: allTracks.length }, 'reached end of library');
        break;
      }

      // Stop if we've reached maxTracks limit
      if (allTracks.length >= maxTracks) {
        logger.info(
          { totalFetched: allTracks.length, maxTracks },
          'reached maxTracks limit'
        );
        break;
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          offset,
          tracksFetched: allTracks.length
        },
        'error during library scan, stopping'
      );
      throw error;
    }
  }

  logger.info(
    {
      totalFetched: allTracks.length,
      totalSize: totalSize || 'unknown',
      cancelled,
      batches: Math.ceil(allTracks.length / batchSize)
    },
    'library scan completed'
  );

  return {
    tracks: allTracks,
    totalFetched: allTracks.length,
    cancelled
  };
};

/**
 * Fetch a single batch of tracks (for incremental operations)
 * Useful for chunked processing without loading entire library into memory
 */
export const fetchLibraryBatch = async (
  offset: number,
  batchSize: number = 50
): Promise<Track[]> => {
  const sectionId = await getMusicLibrarySectionId();
  if (!sectionId) {
    throw new Error('No music library section found');
  }

  const server = await getPlexServer();
  const endpoint = `/library/sections/${sectionId}/all?type=10&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${batchSize}`;

  try {
    const data = await server.query<MediaContainer>(endpoint);
    const metadata = data?.MediaContainer?.Metadata;

    if (!Array.isArray(metadata) || metadata.length === 0) {
      return [];
    }

    const tracks: Track[] = [];
    for (const item of metadata) {
      try {
        const track = new Track(server, item, endpoint, undefined);
        tracks.push(track);
      } catch (error) {
        logger.warn({ error, ratingKey: item.ratingKey }, 'failed to create Track object');
      }
    }

    return tracks;
  } catch (error) {
    logger.error({ error, offset, batchSize }, 'failed to fetch library batch');
    throw error;
  }
};

/**
 * Get total track count in music library (fast query)
 */
export const getLibraryTrackCount = async (): Promise<number> => {
  const sectionId = await getMusicLibrarySectionId();
  if (!sectionId) {
    return 0;
  }

  try {
    const server = await getPlexServer();
    const endpoint = `/library/sections/${sectionId}/all?type=10&X-Plex-Container-Size=1`;
    const data = await server.query<MediaContainer>(endpoint);
    return data?.MediaContainer?.totalSize || 0;
  } catch (error) {
    logger.error({ error }, 'failed to get library track count');
    return 0;
  }
};

/**
 * Fetch recently added tracks (added within last N days)
 * Useful for detecting new library additions without full scan
 */
export const fetchRecentlyAdded = async (days: number = 1): Promise<Track[]> => {
  const sectionId = await getMusicLibrarySectionId();
  if (!sectionId) {
    return [];
  }

  const server = await getPlexServer();
  const sinceTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

  try {
    // Use addedAt filter: /library/sections/{sectionId}/all?type=10&addedAt>={timestamp}
    const endpoint = `/library/sections/${sectionId}/all?type=10&addedAt>=${sinceTimestamp}`;
    const data = await server.query<MediaContainer>(endpoint);
    const metadata = data?.MediaContainer?.Metadata;

    if (!Array.isArray(metadata) || metadata.length === 0) {
      logger.debug({ days, sinceTimestamp }, 'no recently added tracks found');
      return [];
    }

    const tracks: Track[] = [];
    for (const item of metadata) {
      try {
        const track = new Track(server, item, endpoint, undefined);
        tracks.push(track);
      } catch (error) {
        logger.warn({ error, ratingKey: item.ratingKey }, 'failed to create Track object');
      }
    }

    logger.info({ trackCount: tracks.length, days }, 'fetched recently added tracks');
    return tracks;
  } catch (error) {
    logger.error({ error, days }, 'failed to fetch recently added tracks');
    return [];
  }
};
