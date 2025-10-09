import type { Track } from '@ctrl/plex';

import { logger } from '../logger.js';
import { getPlexServer } from './client.js';

interface PlaylistCreateResponse {
  MediaContainer: {
    Metadata: Array<{
      ratingKey: string;
      key: string;
      title: string;
    }>;
  };
}

export const deletePlaylist = async (ratingKey: string): Promise<void> => {
  const server = await getPlexServer();
  await server.query(`/playlists/${ratingKey}`, 'delete');
  logger.info({ ratingKey }, 'deleted existing playlist');
};

export const createAudioPlaylist = async (
  title: string,
  description: string | undefined,
  tracks: Track[]
): Promise<{ ratingKey: string; key: string }> => {
  if (tracks.length === 0) {
    throw new Error('cannot create playlist with no tracks');
  }

  const server = await getPlexServer();
  const ratingKeys = tracks.map(track => track.ratingKey).join(',');

  const params = new URLSearchParams({
    uri: `${server._uriRoot()}/library/metadata/${ratingKeys}`,
    type: 'audio',
    title,
    smart: '0'
  });
  if (description) {
    params.set('summary', description);
  }

  const response = await server.query<PlaylistCreateResponse>(`/playlists?${params.toString()}`, 'post');
  const metadata = response.MediaContainer?.Metadata?.[0];
  if (!metadata) {
    throw new Error('failed to create playlist');
  }

  logger.info({ title, ratingKey: metadata.ratingKey }, 'created audio playlist');
  return { ratingKey: metadata.ratingKey, key: metadata.key };
};

export const updatePlaylistSummary = async (
  ratingKey: string,
  { title, summary }: { title?: string; summary?: string }
): Promise<void> => {
  const server = await getPlexServer();
  const params = new URLSearchParams();
  if (title) {
    params.set('title', title);
  }
  if (summary) {
    params.set('summary', summary);
  }

  if ([...params.keys()].length === 0) {
    return;
  }

  await server.query(`/playlists/${ratingKey}?${params.toString()}`, 'put');
};
