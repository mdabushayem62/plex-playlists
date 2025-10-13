/**
 * Match AudioMuse tracks to Plex tracks by metadata (title + artist)
 */

import { PlexServer } from '@ctrl/plex';
import { logger } from '../logger.js';
import type { AudioMuseTrack } from './client.js';

export interface PlexTrackMatch {
  ratingKey: string;
  title: string;
  artist: string;
  album: string | null;
  confidence: 'exact' | 'fuzzy' | 'none';
}

/**
 * Normalize string for matching (lowercase, remove special chars, trim)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Calculate simple string similarity (Levenshtein distance-based)
 * Returns 0-1 where 1 is identical
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  // Simple substring check
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Calculate Levenshtein distance
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[shorter.length] = lastValue;
    }
  }

  const distance = costs[shorter.length];
  return (longer.length - distance) / longer.length;
}

/**
 * Search Plex for a track by title and artist
 */
export async function matchTrackInPlex(
  plex: PlexServer,
  audioMuseTrack: AudioMuseTrack
): Promise<PlexTrackMatch | null> {
  try {
    // Search by track title
    const searchQuery = audioMuseTrack.title;
    const results = await plex.query(`/search?query=${encodeURIComponent(searchQuery)}&type=10`);

    if (!results.MediaContainer?.Metadata || results.MediaContainer.Metadata.length === 0) {
      logger.debug(
        { title: audioMuseTrack.title, artist: audioMuseTrack.author },
        'no plex search results for track'
      );
      return null;
    }

    // Find best match by comparing title and artist
    let bestMatch: PlexTrackMatch | null = null;
    let bestScore = 0;

    for (const track of results.MediaContainer.Metadata) {
      const plexTitle = track.title || '';
      const plexArtist = track.grandparentTitle || track.originalTitle || '';

      // Calculate similarity scores
      const titleSimilarity = stringSimilarity(audioMuseTrack.title, plexTitle);
      const artistSimilarity = stringSimilarity(audioMuseTrack.author, plexArtist);

      // Combined score (title weighted more heavily)
      const combinedScore = titleSimilarity * 0.7 + artistSimilarity * 0.3;

      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = {
          ratingKey: track.ratingKey,
          title: plexTitle,
          artist: plexArtist,
          album: track.parentTitle || null,
          confidence: combinedScore > 0.95 ? 'exact' : combinedScore > 0.75 ? 'fuzzy' : 'none'
        };
      }
    }

    // Only return matches with reasonable confidence
    if (bestMatch && bestScore > 0.7) {
      logger.debug(
        {
          audioMuse: `${audioMuseTrack.title} by ${audioMuseTrack.author}`,
          plex: `${bestMatch.title} by ${bestMatch.artist}`,
          score: bestScore.toFixed(2),
          confidence: bestMatch.confidence
        },
        'matched audiomuse track to plex'
      );
      return bestMatch;
    }

    logger.debug(
      {
        title: audioMuseTrack.title,
        artist: audioMuseTrack.author,
        bestScore: bestScore.toFixed(2)
      },
      'no confident match found in plex'
    );
    return null;
  } catch (error) {
    logger.error(
      { error, title: audioMuseTrack.title, artist: audioMuseTrack.author },
      'error matching track in plex'
    );
    return null;
  }
}

/**
 * Batch match multiple AudioMuse tracks to Plex
 * Returns map of itemId -> PlexTrackMatch
 */
export async function batchMatchTracks(
  plex: PlexServer,
  audioMuseTracks: AudioMuseTrack[],
  options: {
    concurrency?: number;
    onProgress?: (matched: number, total: number) => void;
  } = {}
): Promise<Map<string, PlexTrackMatch>> {
  const { concurrency = 5, onProgress } = options;
  const matches = new Map<string, PlexTrackMatch>();
  let processed = 0;

  // Process in batches to avoid overwhelming Plex API
  for (let i = 0; i < audioMuseTracks.length; i += concurrency) {
    const batch = audioMuseTracks.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (track) => {
        const match = await matchTrackInPlex(plex, track);
        return { track, match };
      })
    );

    // Store successful matches
    for (const { track, match } of batchResults) {
      if (match) {
        matches.set(track.itemId, match);
      }
      processed++;
    }

    if (onProgress) {
      onProgress(processed, audioMuseTracks.length);
    }

    // Small delay between batches to be nice to Plex
    if (i + concurrency < audioMuseTracks.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return matches;
}
