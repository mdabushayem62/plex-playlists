/**
 * Playlist Recommendation Service
 * Analyzes user's listening history to suggest custom playlists based on:
 * - Recent play patterns (uses HISTORY_DAYS config, default 30 days)
 * - Star ratings
 * - Genre/mood correlations
 * - Listening frequency (requires 3+ plays per track)
 *
 * Performance optimizations:
 * - Uses Plex history API with pagination (not full library scan)
 * - Extracts all metadata directly from history response (no re-fetching)
 * - Shares same time window as daily playlists for consistency
 * - Max 10K history entries to prevent timeouts on large libraries
 */

import { subDays } from 'date-fns';
import type { HistoryMetadatum } from '@ctrl/plex';
import { getPlexServer } from '../plex/client.js';
import { getDb } from '../db/index.js';
import { genreCache } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { APP_ENV } from '../config.js';

export interface PlaylistRecommendation {
  name: string;
  genres: string[];
  moods: string[];
  targetSize: number;
  description: string;
  score: number; // Confidence score 0-1
  reason: string; // Why this playlist was recommended
  category: 'favorite' | 'discovery' | 'mood' | 'combo';
}

interface GenreStats {
  genre: string;
  trackCount: number;
  avgRating: number;
  totalPlays: number;
  avgPlays: number;
}

interface MoodStats {
  mood: string;
  trackCount: number;
  avgRating: number;
  totalPlays: number;
  avgPlays: number;
}

interface TrackData {
  ratingKey: string;
  artist: string;
  rating: number; // 0-5 stars
  playCount: number;
}

/**
 * Analyze user's library and generate playlist recommendations
 */
export async function getPlaylistRecommendations(): Promise<PlaylistRecommendation[]> {
  logger.info('analyzing library for playlist recommendations');

  const recommendations: PlaylistRecommendation[] = [];

  try {
    // Get user's listening history (last 365 days)
    const trackData = await fetchRecentListeningHistory();

    if (trackData.length === 0) {
      logger.warn('no listening history found - user may need to listen to music first');
      return [];
    }

    logger.debug({ trackCount: trackData.length }, 'fetched listening history');

    // Get user's library stats from history
    const genreStats = await analyzeGenres(trackData);
    const moodStats = await analyzeMoods(trackData);

    // Generate different types of recommendations
    recommendations.push(...generateFavoriteGenrePlaylists(genreStats));
    recommendations.push(...generateMoodPlaylists(moodStats));
    recommendations.push(...(await generateGenreCombos(genreStats, trackData)));
    recommendations.push(...generateDiscoveryPlaylists(genreStats));

    // Sort by score and take top 10
    recommendations.sort((a, b) => b.score - a.score);
    const topRecommendations = recommendations.slice(0, 10);

    logger.info(
      { totalCandidates: recommendations.length, topRecommendations: topRecommendations.length, tracksAnalyzed: trackData.length },
      'generated playlist recommendations'
    );

    return topRecommendations;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to generate recommendations'
    );
    return [];
  }
}

/**
 * Fetch recent listening history from Plex with pagination support
 * Uses same time window as daily playlists (HISTORY_DAYS config)
 * Extracts all metadata directly from history response (no re-fetching)
 *
 * @param minPlays - Minimum plays required per track (default: 3)
 * @param maxHistoryEntries - Maximum history entries to fetch (default: 10000)
 */
async function fetchRecentListeningHistory(
  minPlays: number = 3,
  maxHistoryEntries: number = 10000
): Promise<TrackData[]> {
  const plex = await getPlexServer();
  const days = APP_ENV.HISTORY_DAYS;
  const minDate = subDays(new Date(), days);

  try {
    logger.debug(
      { days, minDate: minDate.toISOString(), minPlays, maxHistoryEntries },
      'fetching plex listening history with pagination'
    );

    // Fetch history with pagination
    const allHistory: HistoryMetadatum[] = [];
    const pageSize = 500;
    let offset = 0;
    let hasMore = true;

    while (hasMore && allHistory.length < maxHistoryEntries) {
      const batch = await plex.history(pageSize, minDate);

      if (!Array.isArray(batch) || batch.length === 0) {
        hasMore = false;
        break;
      }

      allHistory.push(...batch);
      offset += batch.length;

      // Stop if we got less than a full page (no more data)
      if (batch.length < pageSize) {
        hasMore = false;
      }

      logger.debug(
        { page: Math.floor(offset / pageSize), batchSize: batch.length, totalFetched: allHistory.length },
        'fetched history page'
      );
    }

    logger.debug(
      { totalEntries: allHistory.length, maxReached: allHistory.length >= maxHistoryEntries },
      'received raw history from plex'
    );

    // Log type breakdown
    const typeCounts: Record<string, number> = {};
    for (const item of allHistory) {
      if (item && typeof item === 'object') {
        const type = item.type || 'unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }
    logger.debug({ typeCounts }, 'history type breakdown');

    // Aggregate plays per track and extract metadata directly from history
    const trackMap = new Map<string, TrackData>();

    for (const item of allHistory) {
      if (!item || item.type !== 'track') continue;

      const ratingKey = item.ratingKey;
      if (!ratingKey) continue;

      if (!trackMap.has(ratingKey)) {
        // Extract all metadata from history item (no re-fetching needed!)
        // Safe access to optional properties from HistoryMetadatum
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userRating = (item as any).userRating;

        trackMap.set(ratingKey, {
          ratingKey,
          artist: item.grandparentTitle || 'Unknown Artist',
          rating: userRating ? userRating / 2 : 0, // Convert 0-10 to 0-5
          playCount: 1
        });
      } else {
        // Increment play count
        trackMap.get(ratingKey)!.playCount++;
      }
    }

    logger.debug(
      { uniqueTracks: trackMap.size },
      'aggregated play counts from history'
    );

    // Filter to tracks with minimum play count
    const trackDataList = Array.from(trackMap.values())
      .filter(track => track.playCount >= minPlays);

    logger.info(
      { totalHistoryEntries: allHistory.length, uniqueTracks: trackMap.size, tracksWithMinPlays: trackDataList.length, minPlaysThreshold: minPlays, tracksWithRatings: trackDataList.filter(t => t.rating > 0).length, avgPlaysPerTrack: trackDataList.length > 0 ? (trackDataList.reduce((sum, t) => sum + t.playCount, 0) / trackDataList.length).toFixed(1) : 0 },
      'fetched track data from history'
    );

    if (trackDataList.length === 0) {
      logger.warn(
        { totalTracks: trackMap.size, minPlaysRequired: minPlays, recommendation: 'Listen to more music or reduce minPlays threshold' },
        'insufficient listening history for recommendations'
      );
    }

    return trackDataList;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to fetch listening history'
    );
    return [];
  }
}

/**
 * Analyze genre distribution and user preferences from track data
 */
async function analyzeGenres(trackData: TrackData[]): Promise<GenreStats[]> {
  const db = getDb();

  try {
    // Get genre cache data
    const genreCacheData = await db
      .select()
      .from(genreCache)
      .where(sql`${genreCache.genres} IS NOT NULL AND ${genreCache.genres} != '[]'`);

    // Build artist -> genres map
    const artistGenres = new Map<string, string[]>();
    for (const entry of genreCacheData) {
      const genres = JSON.parse(entry.genres || '[]');
      if (genres.length > 0) {
        artistGenres.set(entry.artistName.toLowerCase(), genres);
      }
    }

    // Aggregate stats by genre from track data
    const genreMap = new Map<string, { trackCount: number; totalRating: number; ratedCount: number; totalPlays: number }>();

    for (const track of trackData) {
      const artistName = track.artist.toLowerCase();
      const genres = artistGenres.get(artistName) || [];
      const rating = track.rating;
      const playCount = track.playCount;

      for (const genre of genres) {
        const stats = genreMap.get(genre) || { trackCount: 0, totalRating: 0, ratedCount: 0, totalPlays: 0 };
        stats.trackCount++;
        if (rating > 0) {
          stats.totalRating += rating;
          stats.ratedCount++;
        }
        stats.totalPlays += playCount;
        genreMap.set(genre, stats);
      }
    }

    // Convert to array and calculate averages
    const genreStats: GenreStats[] = Array.from(genreMap.entries())
      .map(([genre, stats]) => ({
        genre,
        trackCount: stats.trackCount,
        avgRating: stats.ratedCount > 0 ? stats.totalRating / stats.ratedCount : 0,
        totalPlays: stats.totalPlays,
        avgPlays: stats.trackCount > 0 ? stats.totalPlays / stats.trackCount : 0
      }))
      .filter(s => s.trackCount >= 5) // Only genres with at least 5 tracks
      .sort((a, b) => b.totalPlays - a.totalPlays);

    logger.info({ genreCount: genreStats.length }, 'analyzed genres');
    return genreStats;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to analyze genres'
    );
    return [];
  }
}

/**
 * Analyze mood distribution and user preferences from track data
 */
async function analyzeMoods(trackData: TrackData[]): Promise<MoodStats[]> {
  const db = getDb();

  try {
    // Get mood cache data
    const moodCacheData = await db
      .select()
      .from(genreCache)
      .where(sql`${genreCache.moods} IS NOT NULL AND ${genreCache.moods} != '[]'`);

    // Build artist -> moods map
    const artistMoods = new Map<string, string[]>();
    for (const entry of moodCacheData) {
      const moods = JSON.parse(entry.moods || '[]');
      if (moods.length > 0) {
        artistMoods.set(entry.artistName.toLowerCase(), moods);
      }
    }

    // Aggregate stats by mood from track data
    const moodMap = new Map<string, { trackCount: number; totalRating: number; ratedCount: number; totalPlays: number }>();

    for (const track of trackData) {
      const artistName = track.artist.toLowerCase();
      const moods = artistMoods.get(artistName) || [];
      const rating = track.rating;
      const playCount = track.playCount;

      for (const mood of moods) {
        const stats = moodMap.get(mood) || { trackCount: 0, totalRating: 0, ratedCount: 0, totalPlays: 0 };
        stats.trackCount++;
        if (rating > 0) {
          stats.totalRating += rating;
          stats.ratedCount++;
        }
        stats.totalPlays += playCount;
        moodMap.set(mood, stats);
      }
    }

    // Convert to array and calculate averages
    const moodStats: MoodStats[] = Array.from(moodMap.entries())
      .map(([mood, stats]) => ({
        mood,
        trackCount: stats.trackCount,
        avgRating: stats.ratedCount > 0 ? stats.totalRating / stats.ratedCount : 0,
        totalPlays: stats.totalPlays,
        avgPlays: stats.trackCount > 0 ? stats.totalPlays / stats.trackCount : 0
      }))
      .filter(s => s.trackCount >= 3) // Only moods with at least 3 tracks
      .sort((a, b) => b.totalPlays - a.totalPlays);

    logger.info({ moodCount: moodStats.length }, 'analyzed moods');
    return moodStats;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to analyze moods'
    );
    return [];
  }
}

/**
 * Generate playlists for user's favorite genres
 */
function generateFavoriteGenrePlaylists(genreStats: GenreStats[]): PlaylistRecommendation[] {
  const recommendations: PlaylistRecommendation[] = [];

  // Top 3 most-played genres with good ratings
  const topGenres = genreStats
    .filter(g => g.avgRating >= 3.5 || g.avgPlays >= 5) // Well-rated or frequently played
    .slice(0, 3);

  for (const genre of topGenres) {
    const score = Math.min(
      (genre.avgRating / 5) * 0.4 + // Rating component
      Math.min(genre.avgPlays / 10, 1) * 0.4 + // Play frequency (capped at 10)
      Math.min(genre.trackCount / 100, 1) * 0.2, // Library size
      1
    );

    recommendations.push({
      name: genre.genre,
      genres: [genre.genre],
      moods: [],
      targetSize: 50,
      description: `Your ${genre.trackCount} ${genre.genre} tracks${genre.avgRating >= 4 ? ' (highly rated)' : ''}`,
      score,
      reason: `${Math.round(genre.avgPlays)} avg plays per track, ${genre.avgRating > 0 ? genre.avgRating.toFixed(1) + ' stars' : 'frequently played'}`,
      category: 'favorite'
    });
  }

  return recommendations;
}

/**
 * Generate mood-based playlists
 */
function generateMoodPlaylists(moodStats: MoodStats[]): PlaylistRecommendation[] {
  const recommendations: PlaylistRecommendation[] = [];

  // Top 3 moods
  const topMoods = moodStats
    .filter(m => m.avgRating >= 3.5 || m.avgPlays >= 5)
    .slice(0, 3);

  for (const mood of topMoods) {
    const score = Math.min(
      (mood.avgRating / 5) * 0.4 +
      Math.min(mood.avgPlays / 10, 1) * 0.4 +
      Math.min(mood.trackCount / 100, 1) * 0.2,
      1
    );

    recommendations.push({
      name: `${mood.mood.charAt(0).toUpperCase() + mood.mood.slice(1)} Mix`,
      genres: [],
      moods: [mood.mood],
      targetSize: 50,
      description: `${mood.trackCount} tracks with ${mood.mood} vibes`,
      score,
      reason: `${Math.round(mood.avgPlays)} avg plays, perfect for ${mood.mood} moments`,
      category: 'mood'
    });
  }

  return recommendations;
}

/**
 * Generate genre combination playlists based on actual library composition
 */
async function generateGenreCombos(genreStats: GenreStats[], trackData: TrackData[]): Promise<PlaylistRecommendation[]> {
  const recommendations: PlaylistRecommendation[] = [];

  // Analyze genre co-occurrence in user's listening history
  const genrePairs = await analyzeGenreCooccurrence(trackData);

  // Get top 15 genres for combination analysis
  const topGenres = genreStats.slice(0, 15);
  const genreMap = new Map(topGenres.map(g => [g.genre.toLowerCase(), g]));

  // Find the best genre pairs based on co-occurrence and quality
  const viablePairs = genrePairs
    .filter(pair => {
      const g1 = genreMap.get(pair.genre1.toLowerCase());
      const g2 = genreMap.get(pair.genre2.toLowerCase());
      return g1 && g2 && pair.cooccurrenceCount >= 3; // At least 3 tracks with both genres
    })
    .sort((a, b) => b.cooccurrenceCount - a.cooccurrenceCount)
    .slice(0, 5); // Top 5 combinations

  for (const pair of viablePairs) {
    const genre1 = genreMap.get(pair.genre1.toLowerCase())!;
    const genre2 = genreMap.get(pair.genre2.toLowerCase())!;

    // Score based on both genres' quality and co-occurrence strength
    const avgScore = ((genre1.avgPlays + genre2.avgPlays) / 2) / 10;
    const cooccurrenceBonus = Math.min(pair.cooccurrenceCount / 20, 0.15);
    const score = Math.min(avgScore * 0.6 + cooccurrenceBonus + 0.1, 0.85);

    // Generate descriptive name
    const name = generateComboName(pair.genre1, pair.genre2);
    const description = generateComboDescription(pair.genre1, pair.genre2, pair.cooccurrenceCount);

    recommendations.push({
      name,
      genres: [genre1.genre, genre2.genre],
      moods: [],
      targetSize: 50,
      description,
      score,
      reason: `${pair.cooccurrenceCount} tracks combine these genres, ${Math.round((genre1.avgPlays + genre2.avgPlays) / 2)} avg plays`,
      category: 'combo'
    });
  }

  return recommendations;
}

/**
 * Analyze which genres frequently appear together in the user's listening history
 */
async function analyzeGenreCooccurrence(trackData: TrackData[]): Promise<Array<{ genre1: string; genre2: string; cooccurrenceCount: number }>> {
  const db = getDb();

  try {
    // Get genre cache data
    const genreCacheData = await db
      .select()
      .from(genreCache)
      .where(sql`${genreCache.genres} IS NOT NULL AND ${genreCache.genres} != '[]'`);

    // Build artist -> genres map
    const artistGenres = new Map<string, string[]>();
    for (const entry of genreCacheData) {
      const genres = JSON.parse(entry.genres || '[]');
      if (genres.length > 0) {
        artistGenres.set(entry.artistName.toLowerCase(), genres);
      }
    }

    // Count genre co-occurrences from track data
    const pairCounts = new Map<string, number>();

    for (const track of trackData) {
      const artistName = track.artist.toLowerCase();
      const genres = artistGenres.get(artistName) || [];

      // For each pair of genres for this artist
      for (let i = 0; i < genres.length; i++) {
        for (let j = i + 1; j < genres.length; j++) {
          const g1 = genres[i].toLowerCase();
          const g2 = genres[j].toLowerCase();

          // Create consistent key (alphabetically sorted)
          const key = g1 < g2 ? `${g1}|${g2}` : `${g2}|${g1}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + track.playCount);
        }
      }
    }

    // Convert to array and sort by frequency
    return Array.from(pairCounts.entries())
      .map(([key, count]) => {
        const [genre1, genre2] = key.split('|');
        return { genre1, genre2, cooccurrenceCount: count };
      })
      .filter(p => p.cooccurrenceCount >= 3) // Minimum threshold
      .sort((a, b) => b.cooccurrenceCount - a.cooccurrenceCount);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'failed to analyze genre co-occurrence'
    );
    return [];
  }
}

/**
 * Generate a descriptive name for a genre combination
 */
function generateComboName(genre1: string, genre2: string): string {
  // Capitalize and clean up genre names
  const clean = (g: string) => g
    .split(/[\s\-\/]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const g1 = clean(genre1);
  const g2 = clean(genre2);

  // Check if one genre is a subgenre of the other
  if (g1.toLowerCase().includes(g2.toLowerCase())) return g1;
  if (g2.toLowerCase().includes(g1.toLowerCase())) return g2;

  // Otherwise combine them
  return `${g1} & ${g2}`;
}

/**
 * Generate a description for a genre combination
 */
function generateComboDescription(genre1: string, genre2: string, cooccurrenceCount: number): string {
  const descriptions: Record<string, string> = {
    'electronic+ambient': 'Chill electronic soundscapes',
    'rock+alternative': 'Modern alternative rock',
    'metal+rock': 'Heavy and powerful',
    'pop+dance': 'Upbeat and energetic',
    'jazz+soul': 'Smooth grooves and vocals',
    'indie+folk': 'Acoustic and introspective',
    'hip hop+r&b': 'Urban beats and smooth vocals',
    'classical+ambient': 'Peaceful orchestral sounds',
    'techno+house': 'Dance floor energy',
    'trance+progressive': 'Euphoric progressive sounds',
    'metal+progressive': 'Technical and complex',
    'synthwave+electronic': 'Retro futuristic vibes',
    'punk+rock': 'Raw energy and attitude',
    'experimental+electronic': 'Boundary-pushing sounds',
  };

  // Try to find a match
  const key1 = `${genre1.toLowerCase()}+${genre2.toLowerCase()}`;
  const key2 = `${genre2.toLowerCase()}+${genre1.toLowerCase()}`;

  if (descriptions[key1]) return descriptions[key1];
  if (descriptions[key2]) return descriptions[key2];

  // Generic description based on play count
  if (cooccurrenceCount > 50) {
    return `A well-established combination in your listening history`;
  } else if (cooccurrenceCount > 20) {
    return `A frequent pairing in your music taste`;
  } else {
    return `An interesting blend you enjoy`;
  }
}

/**
 * Generate discovery playlists for underrepresented genres
 */
function generateDiscoveryPlaylists(genreStats: GenreStats[]): PlaylistRecommendation[] {
  const recommendations: PlaylistRecommendation[] = [];

  // Find genres with decent track count but lower play counts (discovery opportunities)
  const discoveryGenres = genreStats
    .filter(g =>
      g.trackCount >= 10 && // Has enough tracks in history
      g.avgPlays < 3 && // Not heavily played yet
      g.avgPlays > 0.5 // But some interest
    )
    .slice(0, 3);

  for (const genre of discoveryGenres) {
    const score = Math.min(
      Math.min(genre.trackCount / 50, 1) * 0.5 + // Track count component
      0.3, // Base discovery score (lower than favorites)
      0.65
    );

    recommendations.push({
      name: `Explore ${genre.genre}`,
      genres: [genre.genre],
      moods: [],
      targetSize: 50,
      description: `Discover more from your ${genre.genre} collection`,
      score,
      reason: `You've listened to ${genre.trackCount} tracks but haven't explored this genre much yet`,
      category: 'discovery'
    });
  }

  return recommendations;
}
