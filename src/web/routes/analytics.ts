/**
 * Analytics and insights routes ("Nerd Lines")
 * Focus: YOUR listening patterns and library statistics, not playlist generation
 */

import { Router } from 'express';
import { getViewPath } from '../server.js';
import { getDb } from '../../db/index.js';
import { jobRuns, trackCache } from '../../db/schema.js';
import { sql, eq, and, desc } from 'drizzle-orm';
import { setupState } from '../../db/schema.js';
import { subDays } from 'date-fns';
import {
  generateListeningHeatmap,
  calculateTrackStatistics,
  findForgottenFavorites,
  calculateDiversityMetrics,
  buildArtistConstellation,
  isHistoryItem
} from '../../analytics/analytics-service.js';
import { getCacheStats } from '../../cache/cache-cli.js';
import { isHtmxRequest, withOobSidebar } from '../middleware/htmx.js';
import {
  updateHistoryCache,
  getHistoryFromCache
} from '../../analytics/listening-history-cache.js';

export const analyticsRouter = Router();

/**
 * JSON endpoint for constellation data only
 * Used for dynamic size updates without full page reload
 */
analyticsRouter.get('/constellation', async (req, res) => {
  try {
    const constellationSize = Math.min(
      Math.max(parseInt(req.query.size as string || '30', 10), 10),
      200
    );

    // Fetch listening history for artist calculation
    const mindate = subDays(new Date(), 90);
    let history: unknown[] = [];

    try {
      await updateHistoryCache();
      history = await getHistoryFromCache({
        since: mindate,
        limit: 10000
      });
    } catch (error) {
      console.warn('Could not fetch listening history for constellation:', error);
    }

    // Build top N artists from history
    const historyArray: unknown[] = Array.isArray(history) ? history : [];
    const artistPlayCountMap = historyArray.reduce<Map<string, number>>((map, item) => {
      if (isHistoryItem(item) && item.type === 'track' && item.grandparentTitle) {
        const artist = item.grandparentTitle;
        map.set(artist, (map.get(artist) || 0) + 1);
      }
      return map;
    }, new Map<string, number>());

    const topArtistsFromHistory = Array.from(artistPlayCountMap.entries())
      .map(([artist, playCount]): { artist: string; playCount: number } => ({ artist, playCount }))
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, constellationSize);

    // Build constellation
    const constellationData = await buildArtistConstellation(topArtistsFromHistory, 0.2);

    // Return JSON
    res.json({
      success: true,
      size: constellationSize,
      data: constellationData
    });
  } catch (error) {
    console.error('Constellation API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build constellation'
    });
  }
});

/**
 * Main analytics dashboard - YOUR listening patterns and library stats
 */
analyticsRouter.get('/', async (req, res) => {
  try {
    const db = getDb();

    // 1. Genre Distribution Data (from cache)
    const { artistCache } = await import('../../db/schema.js');
    const genreDistribution = await db
      .select({
        genre: sql<string>`json_extract(${artistCache.genres}, '$[0]')`,
        count: sql<number>`count(*)`
      })
      .from(artistCache)
      .groupBy(sql`json_extract(${artistCache.genres}, '$[0]')`)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    // 2. Cache Health Stats (from cache service)
    const cacheStats = await getCacheStats();
    const cacheHealth = {
      artists: {
        cached: cacheStats.artists.total,
        expired: cacheStats.artists.expired,
        total: cacheStats.artists.total, // Use cache count as proxy (Plex has no direct count API)
        coverage: 100 // Assume 100% since we use cache as source of truth
      },
      albums: {
        cached: cacheStats.albums.total,
        expired: cacheStats.albums.expired,
        total: cacheStats.albums.total,
        coverage: 100
      }
    };

    // 3. LISTENING HISTORY - Use cache with incremental updates
    const mindate = subDays(new Date(), 90);
    let history: unknown[] = [];

    try {
      // Update cache with latest Plex data (incremental, fast)
      await updateHistoryCache();

      // Fetch from local cache (instant)
      history = await getHistoryFromCache({
        since: mindate,
        limit: 10000
      });
    } catch (error) {
      console.warn('Could not fetch listening history from cache:', error);
      history = [];
    }

    // 4. Generate time-of-day heatmap (analytics service)
    let heatmapGrid;
    try {
      heatmapGrid = generateListeningHeatmap(history);
    } catch (error) {
      console.error('Failed to generate heatmap:', error);
      heatmapGrid = Array(7).fill(null).map(() => Array(24).fill(0));
    }

    // 5. Calculate track statistics (analytics service)
    let trackStats: ReturnType<typeof calculateTrackStatistics>;
    try {
      trackStats = calculateTrackStatistics(history);
    } catch (error) {
      console.error('Failed to calculate track stats:', error);
      trackStats = [];
    }

    // For scatter plot: Get rated tracks from cache for visualization
    const ratedTracksFromCache = await db
      .select({
        title: trackCache.title,
        artist: trackCache.artistName,
        playCount: trackCache.viewCount,
        userRating: trackCache.userRating,
        ratingKey: trackCache.ratingKey
      })
      .from(trackCache)
      .where(and(
        sql`${trackCache.userRating} IS NOT NULL`,
        sql`${trackCache.viewCount} > 0`
      ))
      .orderBy(desc(trackCache.viewCount))
      .limit(100);

    const ratingPlayCountData = ratedTracksFromCache.map(t => ({
      title: t.title,
      artist: t.artist,
      playCount: t.playCount || 0,
      userRating: t.userRating || 0,
      ratingKey: t.ratingKey
    }));

    // 6. Find forgotten favorites (analytics service)
    let forgottenFavorites: ReturnType<typeof findForgottenFavorites>;
    try {
      forgottenFavorites = findForgottenFavorites(trackStats, {
        minDaysSince: 30,
        minPlayCount: 3,
        limit: 50
      });
    } catch (error) {
      console.error('Failed to find forgotten favorites:', error);
      forgottenFavorites = [];
    }

    // 6. TOP UNRATED TRACKS - Show frequently played but unrated tracks from cache
    const unratedTracksFromCache = await db
      .select({
        title: trackCache.title,
        artist: trackCache.artistName,
        album: trackCache.albumName,
        playCount: trackCache.viewCount
      })
      .from(trackCache)
      .where(and(
        eq(trackCache.isUnrated, true),
        sql`${trackCache.viewCount} > 0`
      ))
      .orderBy(desc(trackCache.viewCount))
      .limit(20);

    const topUnratedTracks = unratedTracksFromCache.map(t => ({
      title: t.title,
      artist: t.artist,
      album: t.album || 'Unknown Album',
      playCount: t.playCount || 0
    }));

    // 7. Calculate diversity metrics (analytics service)
    let diversityMetrics;
    try {
      diversityMetrics = await calculateDiversityMetrics(history);
    } catch (error) {
      console.error('Failed to calculate diversity metrics:', error);
      diversityMetrics = {
        genreDiversity: '0.0',
        totalGenres: 0,
        totalArtists: 0,
        concentrationScore: '0.0',
        top10Artists: []
      };
    }

    // 8. Build artist constellation network (analytics service)
    // Get constellation size from query param (default: 30)
    const constellationSize = Math.min(
      Math.max(parseInt(req.query.constellationSize as string || '30', 10), 10),
      200
    );

    let constellationData;
    try {
      // Sort all artists by play count and take the requested number
      const historyArray: unknown[] = Array.isArray(history) ? history : [];
      const artistPlayCountMap = historyArray.reduce<Map<string, number>>((map, item) => {
        if (isHistoryItem(item) && item.type === 'track' && item.grandparentTitle) {
          const artist = item.grandparentTitle;
          map.set(artist, (map.get(artist) || 0) + 1);
        }
        return map;
      }, new Map<string, number>());

      const topArtistsFromHistory = Array.from(artistPlayCountMap.entries())
        .map(([artist, playCount]): { artist: string; playCount: number } => ({ artist, playCount }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, constellationSize);

      constellationData = await buildArtistConstellation(topArtistsFromHistory, 0.2);
    } catch (error) {
      console.error('Failed to build artist constellation:', error);
      constellationData = { nodes: [], links: [] };
    }

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

    const data = {
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
      breadcrumbs: [
        { label: 'Dashboard', url: '/' },
        { label: 'Nerd Lines', url: null }
      ]
    };

    // Check if this is an HTMX request
    if (isHtmxRequest(req)) {
      // Return partial HTML for HTMX with OOB sidebar update
      const { AnalyticsContent } = await import(getViewPath('analytics/index.tsx'));
      const content = AnalyticsContent(data);

      // Combine content with OOB sidebar to update active state
      const html = await withOobSidebar(content, {
        page: 'analytics',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      // Return full page layout for regular requests
      const { AnalyticsPage } = await import(getViewPath('analytics/index.tsx'));
      const html = AnalyticsPage({
        ...data,
        page: 'analytics',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }
  } catch (error) {
    console.error('Analytics page error:', error);
    res.status(500).send('Internal server error');
  }
});
