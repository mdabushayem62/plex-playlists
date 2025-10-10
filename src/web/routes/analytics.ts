/**
 * Analytics and insights routes ("Nerd Lines")
 * Focus: YOUR listening patterns and library statistics, not playlist generation
 */

import { Router } from 'express';
import { getViewPath } from '../server.js';
import { getDb } from '../../db/index.js';
import { genreCache, albumGenreCache, jobRuns } from '../../db/schema.js';
import { sql } from 'drizzle-orm';
import { setupState } from '../../db/schema.js';
import { getPlexServer } from '../../plex/client.js';
import { subDays } from 'date-fns';

export const analyticsRouter = Router();

/**
 * Main analytics dashboard - YOUR listening patterns and library stats
 */
analyticsRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    const server = await getPlexServer();

    // 1. Genre Distribution Data
    // Group all tracks by their primary genre from cache
    const genreDistribution = await db
      .select({
        genre: sql<string>`json_extract(${genreCache.genres}, '$[0]')`,
        count: sql<number>`count(*)`
      })
      .from(genreCache)
      .groupBy(sql`json_extract(${genreCache.genres}, '$[0]')`)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    // 2. Cache Health Stats
    const [artistCacheTotal] = await db
      .select({ count: sql<number>`count(*)` })
      .from(genreCache);

    const [albumCacheTotal] = await db
      .select({ count: sql<number>`count(*)` })
      .from(albumGenreCache);

    const [artistCacheExpired] = await db
      .select({ count: sql<number>`count(*)` })
      .from(genreCache)
      .where(sql`${genreCache.expiresAt} < datetime('now')`);

    const [albumCacheExpired] = await db
      .select({ count: sql<number>`count(*)` })
      .from(albumGenreCache)
      .where(sql`${albumGenreCache.expiresAt} < datetime('now')`);

    // Get total artists/albums from Plex for coverage percentage
    let totalArtists = 0;
    let totalAlbums = 0;
    try {
      const server = await getPlexServer();
      const library = await server.library();
      const sections = await library.sections();
      const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');

      if (musicSection) {
        // Estimate total artists/albums (Plex doesn't have a direct count API)
        // We'll use the cache count as a proxy for now
        totalArtists = artistCacheTotal.count || 0;
        totalAlbums = albumCacheTotal.count || 0;
      }
    } catch (error) {
      console.warn('Could not fetch Plex library stats:', error);
    }

    const cacheHealth = {
      artists: {
        cached: artistCacheTotal.count || 0,
        expired: artistCacheExpired.count || 0,
        total: totalArtists || artistCacheTotal.count || 0,
        coverage: totalArtists > 0 ? ((artistCacheTotal.count || 0) / totalArtists) * 100 : 100
      },
      albums: {
        cached: albumCacheTotal.count || 0,
        expired: albumCacheExpired.count || 0,
        total: totalAlbums || albumCacheTotal.count || 0,
        coverage: totalAlbums > 0 ? ((albumCacheTotal.count || 0) / totalAlbums) * 100 : 100
      }
    };

    // 3. LISTENING HISTORY - Time-of-Day Heatmap (when YOU actually listen to music)
    // Use history API (relatively fast - we already use this for playlists)
    const mindate = subDays(new Date(), 90); // Last 90 days of listening
    let history: unknown[] = [];

    try {
      history = await server.history(5000, mindate);
    } catch (error) {
      console.warn('Could not fetch listening history:', error);
      history = [];
    }

    // Type guard for history items
    interface HistoryItem {
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

    const isHistoryItem = (item: unknown): item is HistoryItem => {
      return typeof item === 'object' && item !== null;
    };

    // Parse history into 24x7 grid
    const heatmapGrid: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
    if (history && Array.isArray(history)) {
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
    }

    // 4. LIBRARY STATS - Use history data to build analytics (avoid slow track fetches)
    // Build a map of tracks from history with play counts
    const trackStatsMap = new Map<string, {
      title: string;
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
      ratingKey: string;
    }>();

    if (history && Array.isArray(history)) {
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
    }

    // Convert to array and sort by play count
    const trackStats = Array.from(trackStatsMap.values())
      .sort((a, b) => b.playCount - a.playCount);

    // For scatter plot: We'll use a sample of tracks
    // TODO: In future, cache track ratings in DB during playlist generation
    const ratingPlayCountData: Array<{
      title: string;
      artist: string;
      playCount: number;
      userRating: number;
      ratingKey: string;
    }> = trackStats.slice(0, 100).map(t => ({
      ...t,
      userRating: 0.5 // Placeholder - would need to fetch from Plex or cache
    }));

    // 5. FORGOTTEN FAVORITES - Tracks not played recently
    const now = Date.now();
    const forgottenFavorites = trackStats
      .filter(t => {
        const daysSince = Math.floor((now - t.lastPlayed) / (1000 * 60 * 60 * 24));
        return daysSince > 30 && t.playCount >= 3; // Played before, but not recently
      })
      .map(t => ({
        title: t.title,
        artist: t.artist,
        daysSinceLastPlay: Math.floor((now - t.lastPlayed) / (1000 * 60 * 60 * 24)),
        userRating: 0.7, // Placeholder
        playCount: t.playCount
      }))
      .slice(0, 50);

    // 6. TOP UNRATED TRACKS - For now, just show frequently played tracks
    // TODO: Cache user ratings in DB during playlist generation
    const topUnratedTracks: Array<{
      title: string;
      artist: string;
      album: string;
      playCount: number;
    }> = trackStats.slice(0, 20).map(t => ({
      title: t.title,
      artist: t.artist,
      album: t.album,
      playCount: t.playCount
    }));

    // 7. DIVERSITY METRICS - Based on listening history (no slow API calls)
    // Count plays per artist from history
    const artistPlayCounts = new Map<string, number>();
    if (history && Array.isArray(history)) {
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
    const genreCounts = await db
      .select({
        genre: sql<string>`json_extract(${genreCache.genres}, '$[0]')`,
        count: sql<number>`count(*)`
      })
      .from(genreCache)
      .groupBy(sql`json_extract(${genreCache.genres}, '$[0]')`);

    const totalGenreCount = genreCounts.reduce((acc, g) => acc + g.count, 0);
    const genreDiversity = totalGenreCount > 0
      ? 1 - genreCounts.reduce((acc, g) => {
          const p = g.count / totalGenreCount;
          return acc + p * p;
        }, 0)
      : 0;

    const diversityMetrics = {
      genreDiversity: (genreDiversity * 100).toFixed(1),
      totalGenres: genreCounts.length,
      totalArtists: artistPlayCounts.size,
      concentrationScore: concentrationScore.toFixed(1),
      top10Artists: topArtistsByPlays.slice(0, 10).map(a => ({
        artist: a.artist,
        appearances: a.playCount
      }))
    };

    // 8. ARTIST CONSTELLATION - Genre-based similarity network
    const topArtists = topArtistsByPlays.slice(0, 30);
    const artistNodes: Array<{ id: string; name: string; appearances: number }> = [];
    const artistLinks: Array<{ source: string; target: string; strength: number }> = [];

    // Build nodes
    for (const artist of topArtists) {
      artistNodes.push({
        id: artist.artist,
        name: artist.artist,
        appearances: artist.playCount
      });
    }

    // Fetch genres for each artist
    const artistGenreMap = new Map<string, Set<string>>();
    for (const artist of topArtists) {
      const artistGenres = await db
        .select({ genres: genreCache.genres })
        .from(genreCache)
        .where(sql`lower(${genreCache.artistName}) = lower(${artist.artist})`)
        .limit(1);

      if (artistGenres.length > 0 && artistGenres[0].genres) {
        try {
          const genres = JSON.parse(artistGenres[0].genres) as string[];
          artistGenreMap.set(artist.artist, new Set(genres));
        } catch {
          // Skip if genre parsing fails
        }
      }
    }

    // Build links based on genre similarity
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

          if (similarity > 0.2) {
            artistLinks.push({
              source: artist1,
              target: artist2,
              strength: similarity
            });
          }
        }
      }
    }

    const constellationData = {
      nodes: artistNodes,
      links: artistLinks
    };

    // 9. PLAYLIST GENERATION STATS (optional, minor section)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const jobStats = await db
      .select({
        date: sql<string>`date(${jobRuns.startedAt} / 1000, 'unixepoch')`,
        total: sql<number>`count(*)`,
        successful: sql<number>`sum(case when ${jobRuns.status} = 'success' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${jobRuns.status} = 'failed' then 1 else 0 end)`
      })
      .from(jobRuns)
      .where(sql`${jobRuns.startedAt} >= ${thirtyDaysAgo.getTime()}`)
      .groupBy(sql`date(${jobRuns.startedAt} / 1000, 'unixepoch')`)
      .orderBy(sql`date(${jobRuns.startedAt} / 1000, 'unixepoch') ASC`);

    const totalJobs = jobStats.reduce((acc, day) => acc + day.total, 0);
    const totalSuccessful = jobStats.reduce((acc, day) => acc + day.successful, 0);
    const successRate = totalJobs > 0 ? (totalSuccessful / totalJobs) * 100 : 0;

    // Check setup status for navigation
    const setupStates = await db.select().from(setupState).limit(1);
    const setupComplete = setupStates.length > 0 && setupStates[0].completed;

    // Render TSX component
    const { AnalyticsPage } = await import(getViewPath('analytics/index.tsx'));
    const html = AnalyticsPage({
      genreDistribution: genreDistribution.map(g => ({
        genre: g.genre || 'Unknown',
        count: g.count
      })),
      cacheHealth,
      topUnratedTracks,
      jobStats: jobStats.map(j => ({
        date: j.date,
        total: j.total,
        successful: j.successful,
        failed: j.failed,
        successRate: j.total > 0 ? (j.successful / j.total) * 100 : 0
      })),
      overallSuccessRate: successRate,
      timeOfDayHeatmap: heatmapGrid,
      ratingPlayCountData, // Library stats: userRating vs playCount
      recencyDecayData: forgottenFavorites.map(t => ({
        title: t.title,
        artist: t.artist,
        daysSinceLastSeen: t.daysSinceLastPlay,
        playCount: t.playCount,
        avgScore: t.userRating
      })),
      diversityMetrics,
      constellationData,
      page: 'analytics',
      setupComplete,
      breadcrumbs: [
        { label: 'Dashboard', url: '/' },
        { label: 'Nerd Lines', url: null }
      ]
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Analytics page error:', error);
    res.status(500).send('Internal server error');
  }
});
