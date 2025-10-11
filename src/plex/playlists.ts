import { Playlist } from '@ctrl/plex';
import type { Track } from '@ctrl/plex';

import { logger } from '../logger.js';
import { getPlexServer } from './client.js';

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

  // Use native Playlist.create with audio support from fork
  const playlist = await Playlist.create(server, title, { items: tracks });

  // Type guard: Playlist.create always returns a playlist with ratingKey and key set
  if (!playlist.ratingKey || !playlist.key) {
    throw new Error('Playlist creation failed: missing ratingKey or key');
  }

  // Update summary if provided (Playlist.create doesn't support summary parameter yet)
  if (description !== undefined) {
    await Playlist.update(server, playlist.ratingKey, { summary: description });
  }

  logger.info({ title, ratingKey: playlist.ratingKey }, 'created audio playlist');

  return { ratingKey: playlist.ratingKey, key: playlist.key };
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
