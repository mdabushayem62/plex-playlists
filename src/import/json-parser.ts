import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { logger } from '../logger.js';
import type { NormalizedTrack } from './types.js';

/**
 * YouTube Music JSON export formats
 *
 * Format 1: Liked Songs (Google Takeout)
 * {
 *   "title": "Song Title",
 *   "artist": "Artist Name",
 *   "album": "Album Name"
 * }
 *
 * Format 2: Playlist (Google Takeout)
 * [
 *   {
 *     "title": "Song Title",
 *     "artist": "Artist Name",
 *     "album": "Album Name"
 *   }
 * ]
 *
 * Format 3: Wrapped object
 * {
 *   "tracks": [ ... ]
 * }
 */

interface YouTubeMusicJSONTrack {
  title?: string;
  artist?: string;
  album?: string;
  // Alternative field names
  song?: string;
  songTitle?: string;
  artistName?: string;
  albumTitle?: string;
}

const normalizeJSONTrack = (
  track: YouTubeMusicJSONTrack,
  sourcePlaylist: string
): NormalizedTrack | null => {
  // Try different field name variations
  const title = track.title || track.song || track.songTitle || '';
  const artist = track.artist || track.artistName || '';
  const album = track.album || track.albumTitle || '';

  // Skip tracks without title or artist
  if (!title || !artist) {
    return null;
  }

  return {
    title: title.trim(),
    artist: artist.trim(),
    album: album.trim(),
    sourcePlaylists: [sourcePlaylist]
  };
};

export const parseJSONFile = (filePath: string): NormalizedTrack[] => {
  const playlistName = basename(filePath, '.json');

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    const tracks: NormalizedTrack[] = [];

    // Handle different JSON structures
    let trackArray: YouTubeMusicJSONTrack[] = [];

    if (Array.isArray(data)) {
      // Format 2: Direct array
      trackArray = data;
    } else if (data.tracks && Array.isArray(data.tracks)) {
      // Format 3: Wrapped in tracks property
      trackArray = data.tracks;
    } else if (typeof data === 'object' && data.title) {
      // Format 1: Single track object
      trackArray = [data];
    } else {
      logger.warn({ filePath }, 'Unknown JSON structure');
      return [];
    }

    for (const track of trackArray) {
      const normalized = normalizeJSONTrack(track, playlistName);
      if (normalized) {
        tracks.push(normalized);
      }
    }

    logger.debug({ filePath, trackCount: tracks.length }, 'Parsed JSON file');
    return tracks;
  } catch (error) {
    logger.error({ filePath, error }, 'Failed to parse JSON file');
    return [];
  }
};
