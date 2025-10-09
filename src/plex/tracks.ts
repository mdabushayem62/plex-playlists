import { Track } from '@ctrl/plex';

import { getPlexServer } from './client.js';

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

export const fetchTracksByRatingKeys = async (ratingKeys: string[]): Promise<Map<string, Track>> => {
  const results = new Map<string, Track>();
  for (const ratingKey of ratingKeys) {
    const track = await fetchTrackByRatingKey(ratingKey);
    if (track) {
      results.set(ratingKey, track);
    }
  }
  return results;
};
