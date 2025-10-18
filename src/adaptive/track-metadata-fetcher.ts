/**
 * Fetch track metadata from Plex API
 * Used when webhook doesn't include duration (media.play events)
 */

import { getPlexServer } from '../plex/client.js';
import { logger } from '../logger.js';

/**
 * Fetch track duration from Plex API
 * Returns duration in milliseconds, or null if not found
 */
export async function fetchTrackDuration(ratingKey: string): Promise<number | null> {
  try {
    const server = await getPlexServer();
    const metadata = await server.query(`/library/metadata/${ratingKey}`);

    const track = metadata.MediaContainer?.Metadata?.[0];
    if (!track || track.type !== 'track') {
      logger.warn({ ratingKey }, 'track metadata not found');
      return null;
    }

    const duration = track.duration;
    if (!duration) {
      logger.warn({ ratingKey, track: track.title }, 'track has no duration field');
      return null;
    }

    logger.debug({ ratingKey, track: track.title, duration }, 'fetched track duration from Plex API');
    return duration;
  } catch (error) {
    logger.warn({ error, ratingKey }, 'failed to fetch track metadata from Plex');
    return null;
  }
}
