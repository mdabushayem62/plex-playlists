import type { Track } from '@ctrl/plex';
import { getPlexServer } from '../plex/client.js';
import { logger } from '../logger.js';

/**
 * Converts a star rating (0-5) to Plex's internal rating scale (0-10)
 * Plex uses: 0, 2, 4, 6, 8, 10 for 0, 1, 2, 3, 4, 5 stars
 */
const starRatingToPlexRating = (stars: number): number => {
  const clamped = Math.min(Math.max(stars, 0), 5);
  return Math.round(clamped * 2);
};

/**
 * Sets the rating for a Plex track
 * Only sets the rating if the track doesn't already have one (userRating is null or undefined)
 */
export const setTrackRating = async (
  track: Track,
  starRating: number,
  dryRun: boolean = false
): Promise<boolean> => {
  const ratingKey = track.ratingKey?.toString();

  if (!ratingKey) {
    logger.warn({ track: track.title }, 'Track has no rating key');
    return false;
  }

  // Skip if track already has a rating
  if (track.userRating != null) {
    logger.debug(
      {
        track: `${track.grandparentTitle} - ${track.title}`,
        existingRating: track.userRating / 2,
        skipReason: 'already rated'
      },
      'Skipping track with existing rating'
    );
    return false;
  }

  const plexRating = starRatingToPlexRating(starRating);

  if (dryRun) {
    logger.info(
      {
        track: `${track.grandparentTitle} - ${track.title}`,
        ratingKey,
        starRating,
        plexRating,
        dryRun: true
      },
      '[DRY RUN] Would set rating'
    );
    return true;
  }

  try {
    const server = await getPlexServer();
    await server.query(`/:/rate?key=${ratingKey}&identifier=com.plexapp.plugins.library&rating=${plexRating}`, 'put');

    logger.info(
      {
        track: `${track.grandparentTitle} - ${track.title}`,
        ratingKey,
        starRating,
        plexRating
      },
      'Set track rating'
    );

    return true;
  } catch (error) {
    logger.error(
      {
        track: `${track.grandparentTitle} - ${track.title}`,
        ratingKey,
        starRating,
        error
      },
      'Failed to set track rating'
    );
    return false;
  }
};
