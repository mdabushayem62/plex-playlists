import { parse } from 'csv-parse/sync';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { logger } from '../logger.js';
import type { SpotifyTrack, YouTubeMusicTrack, NormalizedTrack } from './types.js';
import { parseJSONFile } from './json-parser.js';

const isSpotifyCSV = (headers: string[]): boolean => {
  return headers.includes('Track URI') && headers.includes('Track Name') && headers.includes('Artist Name(s)');
};

const isYouTubeMusicCSV = (headers: string[]): boolean => {
  return headers.includes('Video ID') && headers.includes('Song Title') && headers.includes('Artist Name 1');
};

const parseSpotifyTrack = (record: Record<string, string>, playlistName: string): SpotifyTrack => {
  return {
    trackUri: record['Track URI'] || '',
    trackName: record['Track Name'] || '',
    artistName: record['Artist Name(s)'] || '',
    albumName: record['Album Name'] || '',
    sourcePlaylist: playlistName
  };
};

const parseYouTubeMusicTrack = (record: Record<string, string>, playlistName: string): YouTubeMusicTrack => {
  // YouTube Music can have up to 4 artist columns, take the first non-empty one
  const artist = record['Artist Name 1'] || record['Artist Name 2'] || record['Artist Name 3'] || record['Artist Name 4'] || '';

  return {
    songTitle: record['Song Title'] || '',
    artistName: artist,
    albumTitle: record['Album Title'] || '',
    sourcePlaylist: playlistName
  };
};

const normalizeTrack = (track: SpotifyTrack | YouTubeMusicTrack): NormalizedTrack | null => {
  let title: string;
  let artist: string;
  let album: string;
  let sourcePlaylist: string;

  if ('trackName' in track) {
    // Spotify track
    title = track.trackName;
    artist = track.artistName;
    album = track.albumName;
    sourcePlaylist = track.sourcePlaylist;
  } else {
    // YouTube Music track
    title = track.songTitle;
    artist = track.artistName;
    album = track.albumTitle;
    sourcePlaylist = track.sourcePlaylist;
  }

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

export const parseCSVFile = (filePath: string): NormalizedTrack[] => {
  const playlistName = basename(filePath, '.csv');

  try {
    const content = readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true, // Handle UTF-8 BOM
      relax_quotes: true, // Allow malformed quotes
      relax_column_count: true, // Allow variable column counts
      skip_records_with_error: true // Skip malformed rows instead of failing
    }) as Record<string, string>[];

    if (records.length === 0) {
      logger.warn({ filePath }, 'CSV file is empty');
      return [];
    }

    const headers = Object.keys(records[0]);
    const tracks: NormalizedTrack[] = [];

    if (isSpotifyCSV(headers)) {
      for (const record of records) {
        const spotifyTrack = parseSpotifyTrack(record, playlistName);
        const normalized = normalizeTrack(spotifyTrack);
        if (normalized) {
          tracks.push(normalized);
        }
      }
    } else if (isYouTubeMusicCSV(headers)) {
      for (const record of records) {
        const ytTrack = parseYouTubeMusicTrack(record, playlistName);
        const normalized = normalizeTrack(ytTrack);
        if (normalized) {
          tracks.push(normalized);
        }
      }
    } else {
      logger.warn({ filePath, headers }, 'Unknown CSV format');
      return [];
    }

    logger.debug({ filePath, trackCount: tracks.length }, 'Parsed CSV file');
    return tracks;
  } catch (error) {
    logger.error({ filePath, error }, 'Failed to parse CSV file');
    return [];
  }
};

/**
 * Parse all CSV and JSON files in a directory
 * Auto-detects format and handles YouTube Music JSON exports
 */
export const parseAllFiles = (directoryPath: string): Map<string, NormalizedTrack> => {
  const trackMap = new Map<string, NormalizedTrack>();

  try {
    const files = readdirSync(directoryPath);
    const csvFiles = files.filter(file => file.endsWith('.csv'));
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    logger.info(
      { directoryPath, csvCount: csvFiles.length, jsonCount: jsonFiles.length },
      'Parsing files'
    );

    // Process CSV files
    for (const file of csvFiles) {
      const filePath = join(directoryPath, file);
      const stat = statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      const tracks = parseCSVFile(filePath);

      for (const track of tracks) {
        // Use artist + title as unique key (case-insensitive)
        const key = `${track.artist.toLowerCase()}::${track.title.toLowerCase()}`;

        const existing = trackMap.get(key);
        if (existing) {
          // Merge source playlists
          existing.sourcePlaylists.push(...track.sourcePlaylists);
        } else {
          trackMap.set(key, track);
        }
      }
    }

    // Process JSON files (YouTube Music exports)
    for (const file of jsonFiles) {
      const filePath = join(directoryPath, file);
      const stat = statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      const tracks = parseJSONFile(filePath);

      for (const track of tracks) {
        // Use artist + title as unique key (case-insensitive)
        const key = `${track.artist.toLowerCase()}::${track.title.toLowerCase()}`;

        const existing = trackMap.get(key);
        if (existing) {
          // Merge source playlists
          existing.sourcePlaylists.push(...track.sourcePlaylists);
        } else {
          trackMap.set(key, track);
        }
      }
    }

    logger.info(
      { uniqueTracks: trackMap.size, csvFiles: csvFiles.length, jsonFiles: jsonFiles.length },
      'Completed parsing all files'
    );
    return trackMap;
  } catch (error) {
    logger.error({ directoryPath, error }, 'Failed to read directory');
    return trackMap;
  }
};
