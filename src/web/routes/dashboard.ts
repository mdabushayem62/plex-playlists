/**
 * Dashboard routes
 */

import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { playlists, jobRuns, setupState } from '../../db/schema.js';
import { desc } from 'drizzle-orm';
import { TIME_WINDOWS } from '../../windows.js';
import { getViewPath } from '../server.js';
import { getCacheStats } from '../../cache/cache-cli.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  try {
    const db = getDb();

    // Check setup status
    const setupStates = await db.select().from(setupState).limit(1);
    const setupComplete = setupStates.length > 0 && setupStates[0].completed;

    // Fetch all playlists (deduplicated by window due to unique index)
    // Note: The schema has a unique index on 'window', so there should only be
    // one playlist per window. We fetch all and sort by most recently generated.
    const allPlaylists = await db
      .select()
      .from(playlists)
      .orderBy(desc(playlists.generatedAt));

    // Categorize playlists
    const timeWindows = TIME_WINDOWS as readonly string[];
    const dailyPlaylists = allPlaylists.filter(p => timeWindows.includes(p.window));
    const genrePlaylists = allPlaylists.filter(p => !timeWindows.includes(p.window));

    // Fetch recent job runs
    const recentJobs = await db
      .select()
      .from(jobRuns)
      .orderBy(desc(jobRuns.startedAt))
      .limit(20);

    // Get cache stats from cache service
    const stats = await getCacheStats();
    const cacheStats = {
      total: stats.artists.totalEntries,
      bySource: stats.artists.bySource,
      expired: stats.artists.expired
    };

    // Render TSX component
    const { DashboardPage } = await import(getViewPath('dashboard.tsx'));
    const html = DashboardPage({
      playlists: allPlaylists,
      dailyPlaylists,
      genrePlaylists,
      jobs: recentJobs,
      cacheStats,
      setupComplete,
      page: 'dashboard'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Internal server error');
  }
});
