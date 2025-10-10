import type { Track } from '@ctrl/plex';

import type { AggregatedHistory } from '../history/aggregate.js';
import { fallbackScore, recencyWeight } from '../scoring/weights.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import { getEnrichedAlbumGenres } from '../genre-enrichment.js';

export interface CandidateTrack {
  ratingKey: string;
  track: Track;
  artist: string;
  album?: string;
  title: string;
  genre?: string;
  recencyWeight: number;
  fallbackScore: number;
  playCount: number;
  lastPlayedAt: Date | null;
  finalScore: number;
}

const FINAL_SCORE_RECENCY_WEIGHT = 0.7;
const FINAL_SCORE_FALLBACK_WEIGHT = 0.3;

/**
 * Get genre for a track with enrichment from multiple sources
 * Priority: Embedded tag > Album genres (Spotify/Last.fm) > Fallback to artist
 * Note: Uses cache-only mode to avoid rate limits during playlist generation
 */
export const getGenre = async (track: Track): Promise<string | undefined> => {
  // Try embedded genre tag first
  const embeddedGenre = track.genres?.[0];
  if (embeddedGenre?.tag) {
    return embeddedGenre.tag;
  }

  // Use album-level genre enrichment (with artist fallback)
  // Cache-only mode: only uses cached data, doesn't make API calls
  const artistName = track.grandparentTitle;
  const albumName = track.parentTitle;

  if (artistName && albumName) {
    const albumGenres = await getEnrichedAlbumGenres(artistName, albumName, true);
    if (albumGenres.length > 0) {
      return albumGenres[0]; // Return primary genre
    }
  }

  return undefined;
};

const buildCandidate = async (
  track: Track,
  history: { playCount: number; lastPlayedAt: Date | null }
): Promise<CandidateTrack> => {
  const historyRecency = recencyWeight(history.lastPlayedAt);
  const fallback = fallbackScore(track.userRating, track.viewCount ?? history.playCount);
  const genre = await getGenre(track);

  return {
    ratingKey: track.ratingKey?.toString() ?? '',
    track,
    artist: track.grandparentTitle ?? 'Unknown Artist',
    album: track.parentTitle ?? undefined,
    title: track.title ?? 'Untitled Track',
    genre,
    recencyWeight: historyRecency,
    fallbackScore: fallback,
    playCount: history.playCount,
    lastPlayedAt: history.lastPlayedAt,
    finalScore: historyRecency * FINAL_SCORE_RECENCY_WEIGHT + fallback * FINAL_SCORE_FALLBACK_WEIGHT
  };
};

export interface BuildCandidatesOptions {
  genreFilter?: string; // Filter candidates by genre (case-insensitive substring match)
}

export const buildCandidateTracks = async (
  history: AggregatedHistory[],
  options: BuildCandidatesOptions = {}
): Promise<CandidateTrack[]> => {
  if (history.length === 0) {
    return [];
  }

  const ratingKeys = history.map(h => h.ratingKey);
  const tracksMap = await fetchTracksByRatingKeys(ratingKeys);

  const candidates: CandidateTrack[] = [];

  for (const item of history) {
    const track = tracksMap.get(item.ratingKey);
    if (!track) {
      continue;
    }

    const candidate = await buildCandidate(track, {
      playCount: item.playCount,
      lastPlayedAt: item.lastPlayedAt
    });

    // Apply genre filter if specified
    if (options.genreFilter) {
      const candidateGenre = candidate.genre?.toLowerCase() || '';
      const filterGenre = options.genreFilter.toLowerCase();
      if (!candidateGenre.includes(filterGenre)) {
        continue;
      }
    }

    candidates.push(candidate);
  }

  // Sort descending by final score for downstream selectors
  candidates.sort((a, b) => b.finalScore - a.finalScore);
  return candidates;
};

export const candidateFromTrack = async (
  track: Track,
  history: { playCount: number; lastPlayedAt: Date | null }
): Promise<CandidateTrack> => buildCandidate(track, history);
