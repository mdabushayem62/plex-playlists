/**
 * Analytics and insights routes ("Nerd Lines")
 * Focus: YOUR listening patterns and library statistics, not playlist generation
 */

import { Router } from 'express';
import { getViewPath } from '../server.js';
import { getDb } from '../../db/index.js';
import { jobRuns } from '../../db/schema.js';
import { sql } from 'drizzle-orm';
import { setupState } from '../../db/schema.js';
import { getPlexServer } from '../../plex/client.js';
import { subDays } from 'date-fns';
import {
  generateListeningHeatmap,
  calculateTrackStatistics,
  findForgottenFavorites,
  calculateDiversityMetrics,
  buildArtistConstellation
} from '../../analytics/analytics-service.js';
import { getCacheStats } from '../../cache/cache-cli.js';

export const analyticsRouter = Router();

/**
 * Main analytics dashboard - YOUR listening patterns and library stats
 */
analyticsRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    const server = await getPlexServer();

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
        cached: cacheStats.artists.totalEntries,
        expired: cacheStats.artists.expired,
        total: cacheStats.artists.totalEntries, // Use cache count as proxy (Plex has no direct count API)
        coverage: 100 // Assume 100% since we use cache as source of truth
      },
      albums: {
        cached: cacheStats.albums.totalEntries,
        expired: cacheStats.albums.expired,
        total: cacheStats.albums.totalEntries,
        coverage: 100
      }
    };

    // 3. LISTENING HISTORY - Fetch from Plex (last 90 days)
    const mindate = subDays(new Date(), 90);
    let history: unknown[] = [];

    try {
      history = await server.history(5000, mindate);
    } catch (error) {
      console.warn('Could not fetch listening history:', error);
      history = [];
    }

    // 4. Generate time-of-day heatmap (analytics service)
    const heatmapGrid = generateListeningHeatmap(history);

    // 5. Calculate track statistics (analytics service)
    const trackStats = calculateTrackStatistics(history);

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

    // 6. Find forgotten favorites (analytics service)
    const forgottenFavorites = findForgottenFavorites(trackStats, {
      minDaysSince: 30,
      minPlayCount: 3,
      limit: 50
    });

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

    // 7. Calculate diversity metrics (analytics service)
    const diversityMetrics = await calculateDiversityMetrics(history);

    // 8. Build artist constellation network (analytics service)
    // Use top artists from diversity metrics
    const topArtistsForConstellation = diversityMetrics.top10Artists.map(a => ({
      artist: a.artist,
      playCount: a.appearances
    }));
    const constellationData = await buildArtistConstellation(topArtistsForConstellation, 0.2);

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
