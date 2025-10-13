import type { Track } from '@ctrl/plex';

import type { AggregatedHistory } from '../history/aggregate.js';
import { calculateScore } from '../scoring/strategies.js';
import type { ScoringStrategy } from '../scoring/types.js';
import { fetchTracksByRatingKeys } from '../plex/tracks.js';
import { getEnrichedAlbumGenres, getEnrichedAlbumMoods } from '../genre-enrichment.js';
import { getDb } from '../db/index.js';
import { artistCache } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { filterMetaGenres, DEFAULT_GENRE_IGNORE_LIST } from '../metadata/genre-service.js';
import { getEffectiveConfig } from '../db/settings-service.js';

export interface CandidateTrack {
  ratingKey: string;
  track: Track;
  artist: string;
  album?: string;
  title: string;
  genre?: string;
  genres?: string[]; // All genres for multi-genre filtering
  moods?: string[]; // All moods for mood-based filtering
  recencyWeight: number;
  fallbackScore: number;
  playCount: number;
  lastPlayedAt: Date | null;
  finalScore: number;
}

/**
 * Get genre for a track with enrichment from multiple sources
 * Priority: Embedded tag > Album genres > Artist genres
 * Note: Uses cache-only mode to avoid rate limits during playlist generation
 */
export const getGenre = async (track: Track): Promise<string | undefined> => {
  // Try embedded genre tag first
  const embeddedGenre = track.genres?.[0];
  if (embeddedGenre?.tag) {
    return embeddedGenre.tag;
  }

  // Use album-level genre enrichment (with artist fallback)
  // Note: Album enrichment only uses Plex metadata and cached data
  const artistName = track.grandparentTitle;
  const albumName = track.parentTitle;

  if (artistName && albumName) {
    const albumGenres = await getEnrichedAlbumGenres(artistName, albumName);
    if (albumGenres.length > 0) {
      return albumGenres[0]; // Return primary genre
    }
  }

  // Try artist-level genres (cache-only to avoid API calls during playlist generation)
  if (artistName) {
    const { getGenreEnrichmentService } = await import('../genre-enrichment.js');
    const service = getGenreEnrichmentService();
    const artistGenres = await service.getGenresForArtist(artistName, { cacheOnly: true });
    if (artistGenres.length > 0) {
      return artistGenres[0];
    }
  }

  return undefined;
};

/**
 * Get all genres for a track (for multi-genre matching)
 * Filters out meta-genres based on settings (ignoreMetaGenres = true by default)
 */
const getAllGenres = async (track: Track, ignoreMetaGenres = true): Promise<string[]> => {
  const artistName = track.grandparentTitle;
  const albumName = track.parentTitle;

  let genres: string[] = [];

  if (artistName && albumName) {
    const albumGenres = await getEnrichedAlbumGenres(artistName, albumName);
    if (albumGenres.length > 0) {
      genres = albumGenres;
    }
  }

  if (genres.length === 0 && artistName) {
    const { getGenreEnrichmentService } = await import('../genre-enrichment.js');
    const service = getGenreEnrichmentService();
    const artistGenres = await service.getGenresForArtist(artistName, { cacheOnly: true });
    if (artistGenres.length > 0) {
      genres = artistGenres;
    }
  }

  // Filter out meta-genres if enabled
  if (ignoreMetaGenres && genres.length > 0) {
    const config = await getEffectiveConfig();
    const ignoreList = config.genreIgnoreList.length > 0
      ? config.genreIgnoreList
      : DEFAULT_GENRE_IGNORE_LIST;

    genres = filterMetaGenres(genres, ignoreList);
  }

  return genres;
};

/**
 * Get all moods for a track
 */
const getAllMoods = async (track: Track): Promise<string[]> => {
  const artistName = track.grandparentTitle;
  const albumName = track.parentTitle;

  if (artistName && albumName) {
    const albumMoods = await getEnrichedAlbumMoods(artistName, albumName);
    if (albumMoods.length > 0) {
      return albumMoods;
    }
  }

  if (artistName) {
    const { getGenreEnrichmentService } = await import('../genre-enrichment.js');
    const service = getGenreEnrichmentService();
    const artistMoods = await service.getMoodsForArtist(artistName);
    if (artistMoods.length > 0) {
      return artistMoods;
    }
  }

  return [];
};

const buildCandidate = async (
  track: Track,
  history: { playCount: number; lastPlayedAt: Date | null },
  scoringMode: ScoringMode = 'standard'
): Promise<CandidateTrack> => {
  const genre = await getGenre(track);
  const genres = await getAllGenres(track);
  const moods = await getAllMoods(track);

  // Map legacy mode names to new strategy names
  const strategy: ScoringStrategy = scoringMode === 'quality-first' ? 'quality' : 'balanced';

  // Calculate score using centralized strategy
  const scoringResult = calculateScore(strategy, {
    userRating: track.userRating,
    playCount: track.viewCount ?? history.playCount,
    lastPlayedAt: history.lastPlayedAt
  });

  return {
    ratingKey: track.ratingKey?.toString() ?? '',
    track,
    artist: track.grandparentTitle ?? 'Unknown Artist',
    album: track.parentTitle ?? undefined,
    title: track.title ?? 'Untitled Track',
    genre,
    genres,
    moods,
    recencyWeight: scoringResult.components.recencyWeight,
    fallbackScore: scoringResult.components.fallbackScore,
    playCount: history.playCount,
    lastPlayedAt: history.lastPlayedAt,
    finalScore: scoringResult.finalScore
  };
};

export type ScoringMode = 'standard' | 'quality-first';

export interface BuildCandidatesOptions {
  genreFilter?: string; // Filter candidates by genre (case-insensitive substring match)
  genreFilters?: string[]; // Filter by multiple genres (match ANY)
  moodFilters?: string[]; // Filter by multiple moods (match ANY)
  scoringMode?: ScoringMode; // Scoring strategy (default: 'standard')
}

export const buildCandidateTracks = async (
  history: AggregatedHistory[],
  options: BuildCandidatesOptions = {}
): Promise<CandidateTrack[]> => {
  if (history.length === 0) {
    return [];
  }

  const { scoringMode = 'standard' } = options;
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
    }, scoringMode);

    // Apply genre filter if specified (legacy single-genre filter)
    if (options.genreFilter) {
      const candidateGenre = candidate.genre?.toLowerCase() || '';
      const filterGenre = options.genreFilter.toLowerCase();
      if (!candidateGenre.includes(filterGenre)) {
        continue;
      }
    }

    // Apply multi-genre filter (match ANY of the specified genres)
    if (options.genreFilters && options.genreFilters.length > 0) {
      const candidateGenres = (candidate.genres || []).map(g => g.toLowerCase());
      const filterGenres = options.genreFilters.map(g => g.toLowerCase());

      // Check if candidate has at least one matching genre
      const hasMatchingGenre = filterGenres.some(filterGenre =>
        candidateGenres.some(candidateGenre => candidateGenre.includes(filterGenre))
      );

      if (!hasMatchingGenre) {
        continue;
      }
    }

    // Apply mood filter (match ANY of the specified moods)
    if (options.moodFilters && options.moodFilters.length > 0) {
      const candidateMoods = (candidate.moods || []).map(m => m.toLowerCase());
      const filterMoods = options.moodFilters.map(m => m.toLowerCase());

      // Check if candidate has at least one matching mood
      const hasMatchingMood = filterMoods.some(filterMood =>
        candidateMoods.some(candidateMood => candidateMood.includes(filterMood))
      );

      if (!hasMatchingMood) {
        continue;
      }
    }

    candidates.push(candidate);
  }

  // Sort descending by final score for downstream selectors
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // Track cache usage for all artists in this playlist generation
  // This enables usage-based refresh prioritization (Phase 3)
  if (candidates.length > 0) {
    const uniqueArtists = [...new Set(candidates.map(c => c.artist))];
    // Fire-and-forget to avoid blocking playlist generation
    updateCacheUsage(uniqueArtists).catch(err => {
      // Silently fail - usage tracking is non-critical
      console.warn('Failed to update cache usage:', err);
    });
  }

  return candidates;
};

export const candidateFromTrack = async (
  track: Track,
  history: { playCount: number; lastPlayedAt: Date | null },
  scoringMode: ScoringMode = 'standard'
): Promise<CandidateTrack> => buildCandidate(track, history, scoringMode);

/**
 * Update last_used_at timestamp for cache entries (async, non-blocking)
 * Tracks which artists are actively used in playlists for usage-based prioritization
 */
async function updateCacheUsage(artistNames: string[]): Promise<void> {
  if (artistNames.length === 0) return;

  const db = getDb();
  const now = new Date();
  const normalizedNames = artistNames.map(n => n.toLowerCase());

  // Batch update all artists (fire-and-forget pattern)
  // We don't await these to avoid blocking playlist generation
  const updates = normalizedNames.map(name =>
    db
      .update(artistCache)
      .set({ lastUsedAt: now })
      .where(eq(artistCache.artistName, name))
      .catch(() => {
        // Silently ignore errors - usage tracking is non-critical
      })
  );

  await Promise.allSettled(updates);
}
