import type { Track, MusicSection } from '@ctrl/plex';
import { stringSimilarity } from 'string-similarity-js';
import { logger } from '../logger.js';
import type { NormalizedTrack } from './types.js';

const SIMILARITY_THRESHOLD = 0.85; // 85% similarity required for a match

interface MatchCandidate {
  track: Track;
  artistSimilarity: number;
  titleSimilarity: number;
  combinedScore: number;
}

const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Normalize whitespace
};

const calculateMatchScore = (
  normalizedTrack: NormalizedTrack,
  plexTrack: Track
): MatchCandidate | null => {
  const plexTitle = plexTrack.title || '';
  const plexArtist = plexTrack.grandparentTitle || ''; // Artist name

  if (!plexTitle || !plexArtist) {
    return null;
  }

  const normalizedPlexTitle = normalizeString(plexTitle);
  const normalizedPlexArtist = normalizeString(plexArtist);
  const normalizedImportTitle = normalizeString(normalizedTrack.title);
  const normalizedImportArtist = normalizeString(normalizedTrack.artist);

  const titleSimilarity = stringSimilarity(normalizedImportTitle, normalizedPlexTitle);
  const artistSimilarity = stringSimilarity(normalizedImportArtist, normalizedPlexArtist);

  // Combined score: artist is more important (70%) than title (30%)
  // Both must be above threshold
  const combinedScore = artistSimilarity * 0.7 + titleSimilarity * 0.3;

  if (artistSimilarity < SIMILARITY_THRESHOLD || titleSimilarity < SIMILARITY_THRESHOLD) {
    return null;
  }

  return {
    track: plexTrack,
    artistSimilarity,
    titleSimilarity,
    combinedScore
  };
};

export const findBestMatch = (
  normalizedTrack: NormalizedTrack,
  plexTracks: Track[]
): Track | null => {
  const candidates: MatchCandidate[] = [];

  for (const plexTrack of plexTracks) {
    const candidate = calculateMatchScore(normalizedTrack, plexTrack);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by combined score descending
  candidates.sort((a, b) => b.combinedScore - a.combinedScore);

  const best = candidates[0];
  logger.debug(
    {
      importTrack: `${normalizedTrack.artist} - ${normalizedTrack.title}`,
      plexTrack: `${best.track.grandparentTitle} - ${best.track.title}`,
      artistSimilarity: best.artistSimilarity.toFixed(3),
      titleSimilarity: best.titleSimilarity.toFixed(3),
      combinedScore: best.combinedScore.toFixed(3)
    },
    'Found track match'
  );

  return best.track;
};

export const searchPlexTracks = async (
  musicSection: MusicSection,
  normalizedTrack: NormalizedTrack
): Promise<Track[]> => {
  try {
    // Search by artist name
    const results = await musicSection.searchTracks({
      artist: normalizedTrack.artist,
      libtype: 'track',
      maxresults: 50 // Get more results for better fuzzy matching
    });

    return (results as Track[]) || [];
  } catch (error) {
    logger.debug(
      { track: `${normalizedTrack.artist} - ${normalizedTrack.title}`, error },
      'Failed to search for track'
    );
    return [];
  }
};
