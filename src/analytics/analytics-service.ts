/**
 * Analytics Service
 * Core business logic for analyzing listening patterns and library statistics
 */

import { getDb } from '../db/index.js';
import { artistCache } from '../db/schema.js';
import { sql } from 'drizzle-orm';

// Type definitions for analytics data
export interface HistoryItem {
  type?: string;
  viewedAt?: number;
  key?: string;
  parentKey?: string;
  grandparentKey?: string;
  title?: string;
  grandparentTitle?: string;
  originalTitle?: string;
  parentTitle?: string;
}

export interface TrackStats {
  title: string;
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
  ratingKey: string;
}

export interface ForgottenTrack {
  title: string;
  artist: string;
  daysSinceLastPlay: number;
  userRating: number;
  playCount: number;
}

export interface DiversityMetrics {
  genreDiversity: string;
  totalGenres: number;
  totalArtists: number;
  concentrationScore: string;
  top10Artists: Array<{ artist: string; appearances: number }>;
}

export interface ArtistNode {
  id: string;
  name: string;
  appearances: number;
}

export interface ArtistLink {
  source: string;
  target: string;
  strength: number;
}

export interface ConstellationData {
  nodes: ArtistNode[];
  links: ArtistLink[];
}

/**
 * Type guard for history items
 */
export const isHistoryItem = (item: unknown): item is HistoryItem => {
  return typeof item === 'object' && item !== null;
};

/**
 * Generate a 24x7 listening heatmap from history data
 * Shows when user actually listens to music (hour of day vs day of week)
 *
 * @param history Array of history entries from Plex
 * @returns 2D array: [dayOfWeek][hour] with play counts
 */
export function generateListeningHeatmap(history: unknown[]): number[][] {
  const heatmapGrid: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));

  if (!Array.isArray(history)) {
    return heatmapGrid;
  }

  for (const item of history) {
    if (isHistoryItem(item) && item.type === 'track' && item.viewedAt) {
      const viewedAt = item.viewedAt > 1_000_000_000_000
        ? new Date(item.viewedAt)
        : new Date(item.viewedAt * 1000);
      const dayOfWeek = viewedAt.getDay(); // 0 = Sunday
      const hour = viewedAt.getHours();
      heatmapGrid[dayOfWeek][hour]++;
    }
  }

  return heatmapGrid;
}

/**
 * Calculate track statistics from listening history
 * Aggregates play counts and last played timestamps per track
 *
 * @param history Array of history entries from Plex
 * @returns Array of track statistics sorted by play count (descending)
 */
export function calculateTrackStatistics(history: unknown[]): TrackStats[] {
  const trackStatsMap = new Map<string, TrackStats>();

  if (!Array.isArray(history)) {
    return [];
  }

  for (const item of history) {
    if (isHistoryItem(item) && item.type === 'track') {
      const key = item.key || item.parentKey || item.grandparentKey;
      const ratingKey = key?.match(/\/library\/metadata\/(\d+)/)?.[1] || '';

      if (ratingKey && item.viewedAt) {
        const existing = trackStatsMap.get(ratingKey);
        const playedAt = item.viewedAt > 1_000_000_000_000 ? item.viewedAt : item.viewedAt * 1000;

        if (existing) {
          existing.playCount++;
          existing.lastPlayed = Math.max(existing.lastPlayed, playedAt);
        } else {
          trackStatsMap.set(ratingKey, {
            title: item.title || 'Unknown',
            artist: item.grandparentTitle || item.originalTitle || 'Unknown',
            album: item.parentTitle || 'Unknown',
            playCount: 1,
            lastPlayed: playedAt,
            ratingKey
          });
        }
      }
    }
  }

  // Convert to array and sort by play count
  return Array.from(trackStatsMap.values())
    .sort((a, b) => b.playCount - a.playCount);
}

/**
 * Find forgotten favorites - tracks played before but not recently
 * Identifies tracks you used to love but haven't heard in a while
 *
 * @param trackStats Pre-calculated track statistics
 * @param minDaysSince Minimum days since last play (default: 30)
 * @param minPlayCount Minimum historical play count (default: 3)
 * @param limit Maximum results to return (default: 50)
 * @returns Array of forgotten tracks sorted by days since last play
 */
export function findForgottenFavorites(
  trackStats: TrackStats[],
  options: {
    minDaysSince?: number;
    minPlayCount?: number;
    limit?: number;
  } = {}
): ForgottenTrack[] {
  const { minDaysSince = 30, minPlayCount = 3, limit = 50 } = options;
  const now = Date.now();

  return trackStats
    .filter(t => {
      const daysSince = Math.floor((now - t.lastPlayed) / (1000 * 60 * 60 * 24));
      return daysSince > minDaysSince && t.playCount >= minPlayCount;
    })
    .map(t => ({
      title: t.title,
      artist: t.artist,
      daysSinceLastPlay: Math.floor((now - t.lastPlayed) / (1000 * 60 * 60 * 24)),
      userRating: 0.7, // Placeholder - would need actual ratings from Plex
      playCount: t.playCount
    }))
    .slice(0, limit);
}

/**
 * Calculate diversity metrics for user's listening habits
 * Measures genre diversity, artist concentration, and top artists
 *
 * @param history Array of history entries for artist analysis
 * @returns Diversity metrics including genre diversity index and concentration score
 */
export async function calculateDiversityMetrics(history: unknown[]): Promise<DiversityMetrics> {
  // Count plays per artist from history
  const artistPlayCounts = new Map<string, number>();

  if (Array.isArray(history)) {
    for (const item of history) {
      if (isHistoryItem(item) && item.type === 'track' && item.grandparentTitle) {
        const artist = item.grandparentTitle;
        artistPlayCounts.set(artist, (artistPlayCounts.get(artist) || 0) + 1);
      }
    }
  }

  // Sort artists by play count
  const topArtistsByPlays = Array.from(artistPlayCounts.entries())
    .map(([artist, playCount]) => ({ artist, playCount }))
    .sort((a, b) => b.playCount - a.playCount);

  // Calculate concentration (top 10 artists as % of total plays)
  const totalPlays = topArtistsByPlays.reduce((sum, a) => sum + a.playCount, 0);
  const top10Plays = topArtistsByPlays.slice(0, 10).reduce((sum, a) => sum + a.playCount, 0);
  const concentrationScore = totalPlays > 0 ? (top10Plays / totalPlays) * 100 : 0;

  // Genre diversity from cache
  const db = getDb();
  const genreCounts = await db
    .select({
      genre: sql<string>`json_extract(${artistCache.genres}, '$[0]')`,
      count: sql<number>`count(*)`
    })
    .from(artistCache)
    .groupBy(sql`json_extract(${artistCache.genres}, '$[0]')`);

  const totalGenreCount = genreCounts.reduce((acc, g) => acc + g.count, 0);
  const genreDiversity = totalGenreCount > 0
    ? 1 - genreCounts.reduce((acc, g) => {
        const p = g.count / totalGenreCount;
        return acc + p * p;
      }, 0)
    : 0;

  return {
    genreDiversity: (genreDiversity * 100).toFixed(1),
    totalGenres: genreCounts.length,
    totalArtists: artistPlayCounts.size,
    concentrationScore: concentrationScore.toFixed(1),
    top10Artists: topArtistsByPlays.slice(0, 10).map(a => ({
      artist: a.artist,
      appearances: a.playCount
    }))
  };
}

/**
 * Build artist constellation network graph
 * Creates nodes and links based on genre similarity between top artists
 *
 * @param topArtists Top artists by play count (up to 30)
 * @param similarityThreshold Minimum similarity to create link (default: 0.2)
 * @returns Constellation data with nodes and similarity-based links
 */
export async function buildArtistConstellation(
  topArtists: Array<{ artist: string; playCount: number }>,
  similarityThreshold = 0.2
): Promise<ConstellationData> {
  const db = getDb();
  const artistNodes: ArtistNode[] = [];
  const artistLinks: ArtistLink[] = [];

  // Build nodes
  for (const artist of topArtists) {
    artistNodes.push({
      id: artist.artist,
      name: artist.artist,
      appearances: artist.playCount
    });
  }

  // Fetch genres for all artists in a single batched query (instead of N queries)
  const artistGenreMap = new Map<string, Set<string>>();

  if (topArtists.length === 0) {
    return { nodes: artistNodes, links: artistLinks };
  }

  // Build OR conditions for case-insensitive matching
  const artistConditions = topArtists.map(a =>
    sql`lower(${artistCache.artistName}) = ${a.artist.toLowerCase()}`
  );

  const whereClause = artistConditions.length === 1
    ? artistConditions[0]
    : sql`(${sql.join(artistConditions, sql` OR `)})`;

  const artistGenreResults = await db
    .select({
      artistName: artistCache.artistName,
      genres: artistCache.genres
    })
    .from(artistCache)
    .where(whereClause);

  // Map results back to artist names (case-insensitive)
  const artistLookup = new Map(
    topArtists.map(a => [a.artist.toLowerCase(), a.artist])
  );

  for (const result of artistGenreResults) {
    if (result.genres) {
      try {
        const genres = JSON.parse(result.genres) as string[];
        const originalArtistName = artistLookup.get(result.artistName.toLowerCase());
        if (originalArtistName) {
          artistGenreMap.set(originalArtistName, new Set(genres));
        }
      } catch {
        // Skip if genre parsing fails
      }
    }
  }

  // Build links based on genre similarity (Jaccard index)
  for (let i = 0; i < topArtists.length; i++) {
    for (let j = i + 1; j < topArtists.length; j++) {
      const artist1 = topArtists[i].artist;
      const artist2 = topArtists[j].artist;
      const genres1 = artistGenreMap.get(artist1);
      const genres2 = artistGenreMap.get(artist2);

      if (genres1 && genres2 && genres1.size > 0 && genres2.size > 0) {
        const intersection = new Set([...genres1].filter(g => genres2.has(g)));
        const union = new Set([...genres1, ...genres2]);
        const similarity = intersection.size / union.size;

        if (similarity > similarityThreshold) {
          artistLinks.push({
            source: artist1,
            target: artist2,
            strength: similarity
          });
        }
      }
    }
  }

  return {
    nodes: artistNodes,
    links: artistLinks
  };
}
