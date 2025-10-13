import { Playlist } from '@ctrl/plex';
import type { Track } from '@ctrl/plex';

import { logger } from '../logger.js';
import { getPlexServer } from './client.js';

/**
 * Retry helper for transient network errors
 * Implements exponential backoff: 1s, 2s, 4s
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  operation: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a transient network error
      const isTransientError =
        error instanceof Error &&
        (error.message.includes('EPIPE') ||
         error.message.includes('ECONNRESET') ||
         error.message.includes('other side closed') ||
         error.message.includes('socket hang up') ||
         error.message.includes('fetch failed'));

      if (!isTransientError || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      logger.warn(
        { attempt, maxAttempts, delayMs, operation, error: error.message },
        `transient error during ${operation}, retrying after ${delayMs}ms`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// Export Playlist class for direct usage if needed
export { Playlist };

/**
 * Delete a playlist by ratingKey
 * Convenience wrapper around Playlist deletion
 */
export const deletePlaylist = async (ratingKey: string): Promise<void> => {
  const server = await getPlexServer();
  await server.query(`/playlists/${ratingKey}`, 'delete');
  logger.info({ ratingKey }, 'deleted existing playlist');
};

/**
 * Create an audio playlist with tracks
 * Uses native @ctrl/plex Playlist.create() with audio support
 * Retries on transient network errors (3 attempts with exponential backoff)
 */
export const createAudioPlaylist = async (
  title: string,
  description: string | undefined,
  tracks: Track[]
): Promise<{ ratingKey: string; key: string }> => {
  if (tracks.length === 0) {
    throw new Error('cannot create playlist with no tracks');
  }

  const server = await getPlexServer();

  // Use retry wrapper for playlist creation
  const playlist = await retryWithBackoff(
    async () => await Playlist.create(server, title, { items: tracks }),
    3,
    `create playlist "${title}"`
  );

  // Type guard: Playlist.create always returns a playlist with ratingKey and key set
  if (!playlist.ratingKey || !playlist.key) {
    throw new Error('Playlist creation failed: missing ratingKey or key');
  }

  const ratingKey = playlist.ratingKey;
  const key = playlist.key;

  // Update summary if provided (Playlist.create doesn't support summary parameter yet)
  if (description !== undefined) {
    await retryWithBackoff(
      async () => await Playlist.update(server, ratingKey, { summary: description }),
      3,
      `update playlist summary "${title}"`
    );
  }

  logger.info({ title, ratingKey }, 'created audio playlist');

  return { ratingKey, key };
};

/**
 * Update playlist metadata by ratingKey
 * Uses native @ctrl/plex Playlist.update() static method
 */
export const updatePlaylistSummary = async (
  ratingKey: string,
  { title, summary }: { title?: string; summary?: string }
): Promise<void> => {
  if (!title && !summary) {
    return;
  }

  const server = await getPlexServer();
  await Playlist.update(server, ratingKey, { title, summary });
};
