/**
 * Webhook event processor
 * Coordinates session manager, pattern analyzer, and queue manager
 */

import { logger } from '../logger.js';
import { getSessionManager } from './session-manager.js';
import type { PlexWebhookPayload } from './types.js';

/**
 * Process Plex webhook event
 * Called asynchronously from webhook receiver
 */
export async function processWebhook(payload: PlexWebhookPayload): Promise<void> {
  const { event, Player, Metadata } = payload;

  logger.info({ event, metadataType: Metadata?.type }, 'webhook processor started');

  // Only process track events
  if (Metadata?.type !== 'track') {
    return;
  }

  // Get machine identifier - webhooks use Player.uuid
  const machineIdentifier = Player.uuid || Player.title;

  if (!machineIdentifier) {
    logger.error({ Player }, 'Player object has no uuid or title');
    return;
  }

  logger.info({ event, machineIdentifier, track: Metadata.title }, 'calling session manager');

  const sessionManager = getSessionManager();

  try {
    switch (event) {
      case 'media.play':
        await sessionManager.handleTrackPlay(machineIdentifier, Metadata);
        break;

      case 'media.stop':
        await sessionManager.handleTrackStop(machineIdentifier, Metadata);
        // Pattern analysis and adaptation triggered internally
        break;

      case 'media.scrobble':
        await sessionManager.handleTrackScrobble(machineIdentifier, Metadata);
        break;

      case 'media.pause':
      case 'media.resume':
        // Track for completeness, but don't trigger adaptation
        logger.debug({ event, track: Metadata.title }, 'playback state change');
        break;

      case 'media.rate':
        // User rated a track, could be useful for future enhancements
        logger.debug({ event, track: Metadata.title }, 'track rated');
        break;
    }
  } catch (error) {
    logger.error(
      {
        error,
        event,
        machineIdentifier,
        track: Metadata.title
      },
      'error processing webhook event'
    );
    throw error; // Re-throw so outer catch can log it
  }
}
