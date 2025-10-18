/**
 * Plex PlayQueue API client
 * Handles real-time queue manipulation for adaptive playback
 *
 * Research findings:
 * - playQueuePlaylistID field exists (undocumented!) for correlation
 * - Player.uuid is undefined, use machineIdentifier instead
 * - Changes reflected on track transitions (acceptable UX)
 */

import { getPlexServer } from './client.js';
import { logger } from '../logger.js';

/**
 * PlayQueue item with metadata
 */
export interface PlayQueueItem {
  playQueueItemID: number;
  ratingKey: string;
  key: string;
  guid: string;
  type: 'track';
  title: string;
  parentTitle?: string; // Album
  grandparentTitle?: string; // Artist
  duration: number;
  skipCount?: number;
  viewCount?: number;
  Genre?: Array<{ tag: string }>;
  Mood?: Array<{ tag: string }>;
  Artist?: Array<{ tag: string }>;
}

/**
 * PlayQueue state
 */
export interface PlayQueue {
  playQueueID: number;
  playQueueVersion: number;
  playQueueTotalCount: number;
  playQueueSelectedItemID: number;
  playQueueSelectedItemOffset: number;
  playQueueShuffled: boolean;
  playQueuePlaylistID?: number; // Undocumented but exists!
  playQueuePlaylistTitle?: string; // Undocumented but exists!
  playQueueSourceURI?: string | null; // Often null
  playQueueLastAddedItemID?: string;
  identifier: string;
  size: number;
  Metadata: PlayQueueItem[];
}

/**
 * PlayQueue list item (from /playQueues endpoint)
 */
export interface PlayQueueListItem {
  id: number;
  clientIdentifier: string;
  totalItemsCount: number;
  type: string;
  shuffled: boolean;
  playlistID?: number;
}

/**
 * Get all active PlayQueues
 * Note: This endpoint is unreliable - doesn't show all queues
 * Use returned queues as reference points for brute force search
 */
export async function listPlayQueues(): Promise<PlayQueueListItem[]> {
  const server = await getPlexServer();

  try {
    const response = await server.query('/playQueues');
    const queues = response.MediaContainer?.PlayQueue || [];

    logger.debug({ count: queues.length }, 'listed active playQueues');
    return queues;
  } catch (error) {
    logger.warn({ error }, 'failed to list playQueues');
    return [];
  }
}

/**
 * Get current state of PlayQueue
 */
export async function getPlayQueue(playQueueId: number, window?: number): Promise<PlayQueue> {
  const server = await getPlexServer();

  const params = window ? `?window=${window}` : '';
  const response = await server.query(`/playQueues/${playQueueId}${params}`);

  logger.debug(
    {
      playQueueId,
      window,
      version: response.MediaContainer.playQueueVersion,
      totalCount: response.MediaContainer.playQueueTotalCount,
      playlistID: response.MediaContainer.playQueuePlaylistID
    },
    'fetched playQueue'
  );

  return response.MediaContainer as PlayQueue;
}

/**
 * Remove item from PlayQueue
 */
export async function removeFromQueue(
  playQueueId: number,
  playQueueItemId: number
): Promise<void> {
  const server = await getPlexServer();

  await server.query(`/playQueues/${playQueueId}/items/${playQueueItemId}`, 'delete');

  logger.debug({ playQueueId, playQueueItemId }, 'removed item from playQueue');
}

/**
 * Add track to PlayQueue
 * @param playNext - If true, adds to "Up Next" (after current), if false adds to end
 */
export async function addToQueue(
  playQueueId: number,
  trackRatingKey: string,
  playNext: boolean = true
): Promise<void> {
  const server = await getPlexServer();
  const uri = await buildPlexUri(trackRatingKey);
  const nextParam = playNext ? '1' : '0';

  await server.query(
    `/playQueues/${playQueueId}?uri=${encodeURIComponent(uri)}&next=${nextParam}`,
    'put'
  );

  logger.debug({ playQueueId, trackRatingKey, playNext }, 'added item to playQueue');
}

/**
 * Move item in PlayQueue
 */
export async function moveItem(
  playQueueId: number,
  playQueueItemId: number,
  afterItemId?: number
): Promise<void> {
  const server = await getPlexServer();

  const params = afterItemId ? `?after=${afterItemId}` : '';
  await server.query(
    `/playQueues/${playQueueId}/items/${playQueueItemId}/move${params}`,
    'put'
  );

  logger.debug({ playQueueId, playQueueItemId, afterItemId }, 'moved item in playQueue');
}

/**
 * Clear all items from PlayQueue
 */
export async function clearQueue(playQueueId: number): Promise<void> {
  const server = await getPlexServer();

  await server.query(`/playQueues/${playQueueId}/items`, 'delete');

  logger.debug({ playQueueId }, 'cleared playQueue');
}

/**
 * Build Plex server URI for track
 * Format: server://{machineId}/com.plexapp.plugins.library/library/metadata/{ratingKey}
 */
async function buildPlexUri(ratingKey: string): Promise<string> {
  const server = await getPlexServer();

  // Get server machine identifier (cached after first call)
  const identity = await server.query('/identity');
  const machineId = identity.MediaContainer.machineIdentifier;

  return `server://${machineId}/com.plexapp.plugins.library/library/metadata/${ratingKey}`;
}

/**
 * Get server machine identifier (for URI building)
 */
export async function getServerMachineId(): Promise<string> {
  const server = await getPlexServer();
  const identity = await server.query('/identity');
  return identity.MediaContainer.machineIdentifier;
}
