import { Track } from '@ctrl/plex';

import { getPlexServer } from './client.js';
import { logger } from '../logger.js';

interface TrackMediaContainer {
  MediaContainer?: {
    Metadata?: Array<Record<string, unknown>>;
  };
}

export const fetchTrackByRatingKey = async (ratingKey: string): Promise<Track | null> => {
  const server = await getPlexServer();
  const key = `/library/metadata/${ratingKey}`;
  const data = await server.query<TrackMediaContainer>(key);
  const metadata = data?.MediaContainer?.Metadata?.[0];
  if (!metadata) {
    return null;
  }
  return new Track(server, metadata, key, undefined);
};

/**
 * Fetch multiple tracks efficiently using Plex's batch query API
 * Uses type=10 (track) with id filter to fetch all tracks in one or few requests
 *
 * Performance: O(ceil(n/batchSize)) instead of O(n) sequential requests
 * Example: 100 tracks @ batch=100 = 1 request vs 100 sequential requests
 *
 * @param ratingKeys - Array of Plex rating keys to fetch
 * @param batchSize - Max rating keys per request (default: 100, Plex API tested up to 500+)
 * @returns Map of ratingKey -> Track
 */
export const fetchTracksByRatingKeys = async (
  ratingKeys: string[],
  batchSize = 100
): Promise<Map<string, Track>> => {
  if (ratingKeys.length === 0) {
    return new Map();
  }

  const server = await getPlexServer();
  const results = new Map<string, Track>();

  // Split into batches to avoid URL length limits
  const batches: string[][] = [];
  for (let i = 0; i < ratingKeys.length; i += batchSize) {
    batches.push(ratingKeys.slice(i, i + batchSize));
  }

  logger.debug(
    { totalTracks: ratingKeys.length, batches: batches.length, batchSize },
    'fetching tracks in batches'
  );

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    try {
      // Build query: type=10 (track) & id=123,456,789
      // The comma operator means OR, so this fetches all tracks matching any of the IDs
      const idQuery = batch.join(',');
      const query = `/library/all?type=10&id=${idQuery}`;

      const data = await server.query<TrackMediaContainer>(query);
      const metadata = data?.MediaContainer?.Metadata || [];

      logger.debug(
        {
          batch: batchIdx + 1,
          totalBatches: batches.length,
          requested: batch.length,
          received: metadata.length
        },
        'batch fetch complete'
      );

      // Map results by ratingKey
      for (const item of metadata) {
        const ratingKey = (item.ratingKey as string)?.toString();
        if (ratingKey) {
          const track = new Track(server, item, query, undefined);
          results.set(ratingKey, track);
        }
      }
    } catch (error) {
      logger.warn(
        {
          batch: batchIdx + 1,
          batchSize: batch.length,
          err: error instanceof Error ? error.message : String(error)
        },
        'batch fetch failed, falling back to individual fetches'
      );

      // Fallback: fetch individually for this batch
      for (const ratingKey of batch) {
        try {
          const track = await fetchTrackByRatingKey(ratingKey);
          if (track) {
            results.set(ratingKey, track);
          }
        } catch (err) {
          logger.warn({ ratingKey, err }, 'failed to fetch individual track');
        }
      }
    }
  }

  const missingCount = ratingKeys.length - results.size;
  if (missingCount > 0) {
    logger.warn(
      { requested: ratingKeys.length, fetched: results.size, missing: missingCount },
      'some tracks could not be fetched'
    );
  }

  return results;
};
