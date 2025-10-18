/**
 * Manual action routes
 * On-demand operations like playlist generation, cache warming, etc.
 */

import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { artistCache, albumCache, jobRuns, setupState } from '../../db/schema.js';
import { TIME_WINDOWS, SPECIAL_WINDOWS, type PlaylistWindow } from '../../windows.js';
import { lt, eq, and, desc, sql } from 'drizzle-orm';
import { importRatingsFromCSVs } from '../../import/importer-fast.js';
import { clearAllCache } from '../../cache/cache-cli.js';
import { progressTracker, formatETA } from '../../utils/progress-tracker.js';
import { jobQueue } from '../../queue/job-queue.js';
import { sanitizeFilePath, isValidDirectory, escapeHtml } from '../../utils/security.js';

export const actionsRouter = Router();

/**
 * Simple validation: check if window is valid (time-based or genre)
 */
async function isValidWindow(window: string): Promise<boolean> {
  const timeWindows = TIME_WINDOWS as readonly string[];
  const specialWindows = SPECIAL_WINDOWS as readonly string[];

  // Check time, special, cache, or custom playlist windows
  return timeWindows.includes(window) ||
         specialWindows.includes(window) ||
         ['cache-warm', 'cache-refresh', 'custom-playlists'].includes(window) ||
         window.startsWith('custom-');
}

/**
 * Main actions page - DEPRECATED (functionality moved to Dashboard and Config)
 * Redirects to dashboard for backwards compatibility
 */
actionsRouter.get('/', async (req, res) => {
  res.redirect('/');
});

/**
 * Generate playlist for specific window
 */
actionsRouter.post('/generate/:window', async (req, res) => {
  try {
    const window = req.params.window as PlaylistWindow;

    // Validate window
    if (!(await isValidWindow(window))) {
      return res.status(400).json({ error: 'Invalid window' });
    }

    // Enqueue the job (returns immediately with job ID)
    const jobId = await jobQueue.enqueue({
      type: 'playlist',
      window
    });

    res.json({ jobId, window });
  } catch (error) {
    console.error('Generate playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Check job status (JSON endpoint)
 */
actionsRouter.get('/jobs/:jobId', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const db = getDb();
    const [job] = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.id, jobId))
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      id: job.id.toString(),
      type: job.window.includes('cache') ? 'cache' : 'playlist',
      status: job.status,
      started: job.startedAt,
      finished: job.finishedAt || undefined,
      error: job.error || undefined
    });
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Stream job status and progress via Server-Sent Events (SSE)
 */
actionsRouter.get('/jobs/:jobId/stream', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) {
      return res.status(404).json({ error: 'Invalid job ID' });
    }

    const db = getDb();

    // Check if job exists
    const [job] = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.id, jobId))
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial status with progress
    const initialProgress = progressTracker.getProgress(jobId);
    const initialStatus = {
      id: job.id.toString(),
      type: job.window.includes('cache') ? 'cache' : 'playlist',
      status: job.status,
      started: job.startedAt,
      finished: job.finishedAt || undefined,
      error: job.error || undefined,
      progress: initialProgress ? {
        current: initialProgress.current,
        total: initialProgress.total,
        percent: initialProgress.percent,
        message: initialProgress.message,
        eta: initialProgress.eta ? formatETA(initialProgress.eta) : null
      } : null
    };
    res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);

    // Subscribe to progress events
    interface ProgressUpdate {
      jobId: string;
      current: number;
      total: number;
      percent: number;
      message: string;
      eta?: number;
      sourceCounts?: Record<string, number>;
    }

    const progressHandler = (update: unknown) => {
      // Type guard for progress update
      if (typeof update !== 'object' || update === null) return;
      const progressUpdate = update as ProgressUpdate;

      if (progressUpdate.jobId === jobId.toString()) {
        try {
          // Send full job object (same format as initial status) so client's onmessage receives it
          const data = {
            id: job.id.toString(),
            type: job.window.includes('cache') ? 'cache' : 'playlist',
            status: 'running',
            started: job.startedAt,
            progress: {
              current: progressUpdate.current,
              total: progressUpdate.total,
              percent: progressUpdate.percent,
              message: progressUpdate.message,
              eta: progressUpdate.eta ? formatETA(progressUpdate.eta) : null,
              sourceCounts: progressUpdate.sourceCounts
            }
          };
          // Don't specify event type so it triggers onmessage on client
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          console.error('SSE write error:', error);
        }
      }
    };

    progressTracker.on('progress', progressHandler);

    // Poll database for status changes every 1s (less aggressive than before)
    const intervalId = setInterval(async () => {
      try {
        const [currentJob] = await db
          .select()
          .from(jobRuns)
          .where(eq(jobRuns.id, jobId))
          .limit(1);

        if (!currentJob) {
          // Job no longer exists - send as default message event
          res.write('data: {"status":"not_found"}\n\n');
          clearInterval(intervalId);
          progressTracker.off('progress', progressHandler);
          res.end();
          return;
        }

        // If job status changed, send update
        if (currentJob.status !== job.status || currentJob.finishedAt !== job.finishedAt) {
          const progress = progressTracker.getProgress(jobId);
          const status = {
            id: currentJob.id.toString(),
            type: currentJob.window.includes('cache') ? 'cache' : 'playlist',
            status: currentJob.status,
            started: currentJob.startedAt,
            finished: currentJob.finishedAt || undefined,
            error: currentJob.error || undefined,
            progress: progress ? {
              current: progress.current,
              total: progress.total,
              percent: progress.percent,
              message: progress.message,
              eta: progress.eta ? formatETA(progress.eta) : null
            } : null
          };
          // Don't specify event type so it triggers onmessage on client
          res.write(`data: ${JSON.stringify(status)}\n\n`);
        }

        // If job is complete, close connection
        if (currentJob.status !== 'running') {
          setTimeout(() => {
            clearInterval(intervalId);
            progressTracker.off('progress', progressHandler);
            res.end();
          }, 1000); // Keep connection alive for 1 more second
        }
      } catch (error) {
        console.error('SSE polling error:', error);
        clearInterval(intervalId);
        progressTracker.off('progress', progressHandler);
        res.end();
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      progressTracker.off('progress', progressHandler);
      res.end();
    });
  } catch (error) {
    console.error('SSE setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Cache statistics page - DEPRECATED (functionality moved to Config > Cache tab)
 * Redirects to config page for backwards compatibility
 */
actionsRouter.get('/cache', async (req, res) => {
  res.redirect('/config?tab=cache');
});

/**
 * Clear expired cache entries (both artists and albums)
 */
actionsRouter.post('/cache/clear-expired', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date();

    const artistResult = await db
      .delete(artistCache)
      .where(lt(artistCache.expiresAt, now))
      .returning();

    const albumResult = await db
      .delete(albumCache)
      .where(lt(albumCache.expiresAt, now))
      .returning();

    res.json({ deleted: artistResult.length + albumResult.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Clear all cache entries
 */
actionsRouter.post('/cache/clear-all', async (req, res) => {
  try {
    const count = await clearAllCache();
    res.json({ deleted: count });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Warm artist genre cache for all artists
 */
actionsRouter.post('/cache/warm', async (req, res) => {
  try {
    // Enqueue the job (returns immediately with job ID)
    const jobId = await jobQueue.enqueue({
      type: 'cache-warm',
      concurrency: 2
    });

    res.json({ jobId, message: 'Artist cache warming started' });
  } catch (error) {
    console.error('Cache warm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Warm album genre cache for all albums
 */
actionsRouter.post('/cache/warm-albums', async (req, res) => {
  try {
    // Enqueue the job (returns immediately with job ID)
    const jobId = await jobQueue.enqueue({
      type: 'cache-albums',
      concurrency: 3
    });

    res.json({ jobId, message: 'Album cache warming started' });
  } catch (error) {
    console.error('Album cache warm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Sync rated tracks to cache (quick sync for analytics)
 */
actionsRouter.post('/cache/sync-rated', async (req, res) => {
  try {
    // Enqueue the job (returns immediately with job ID)
    const jobId = await jobQueue.enqueue({
      type: 'cache-sync-rated',
      batchSize: 50
    });

    res.json({ jobId, message: 'Rated tracks sync started' });
  } catch (error) {
    console.error('Rated tracks sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Sync full track library to cache (background job with progress tracking)
 */
actionsRouter.post('/cache/sync-full', async (req, res) => {
  try {
    // Enqueue the job (returns immediately with job ID)
    const jobId = await jobQueue.enqueue({
      type: 'cache-sync-full',
      batchSize: 50
    });

    res.json({ jobId, message: 'Full track library sync started' });
  } catch (error) {
    console.error('Full track sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Import ratings from CSV directory
 */
actionsRouter.post('/import/run', async (req, res) => {
  try {
    const { csvPath } = req.body;

    if (!csvPath) {
      return res.status(400).send(`
        <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
          <strong>Error:</strong> CSV path is required
        </div>
      `);
    }

    // Sanitize and validate path to prevent directory traversal
    let sanitizedPath: string;
    try {
      sanitizedPath = sanitizeFilePath(csvPath);
    } catch (error) {
      const errorMsg = error instanceof Error ? escapeHtml(error.message) : 'Invalid path';
      return res.status(400).send(`
        <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
          <strong>Security Error:</strong> ${errorMsg}
        </div>
      `);
    }

    // Validate path exists and is a directory
    if (!isValidDirectory(sanitizedPath)) {
      const escapedPath = escapeHtml(sanitizedPath);
      return res.status(400).send(`
        <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
          <strong>Error:</strong> Directory not found or invalid: <code>${escapedPath}</code>
          <p style="margin: 0.5rem 0 0 0;">
            Make sure the path is correct and the directory exists on your server.
          </p>
        </div>
      `);
    }

    // Send immediate response with escaped path
    const escapedPath = escapeHtml(sanitizedPath);
    res.send(`
      <div style="background: var(--pico-primary); padding: 1rem; border-radius: 0.25rem; margin-bottom: 1rem;">
        <strong>✓ Import Started</strong>
        <p style="margin: 0.5rem 0 0 0;">
          Processing CSV files from <code>${escapedPath}</code>. This may take several minutes...
        </p>
      </div>
      <div id="import-progress">
        <p style="color: var(--pico-muted-color);">⏳ Running import... Check server logs for progress.</p>
      </div>
    `);

    // Run import in background with sanitized path
    (async () => {
      try {
        const result = await importRatingsFromCSVs(sanitizedPath, false);
        console.log('Import completed:', result);
      } catch (error) {
        console.error('Import error:', error);
      }
    })();

  } catch (error) {
    const errorMsg = error instanceof Error ? escapeHtml(error.message) : 'Unknown error';
    res.status(500).send(`
      <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
        <strong>Error:</strong> ${errorMsg}
      </div>
    `);
  }
});

/**
 * Job history page
 * Complete history of all playlist generation and maintenance jobs
 */
actionsRouter.get('/history', async (req, res) => {
  try {
    const db = getDb();

    // Get setup status
    const setupStates = await db.select().from(setupState).limit(1);
    const setupComplete = setupStates.length > 0 && setupStates[0].completed;

    // Parse query params for filtering
    const filters = {
      window: req.query.window as string | undefined,
      status: req.query.status as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined
    };

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    // Build query conditions
    const conditions = [];
    if (filters.window) {
      conditions.push(eq(jobRuns.window, filters.window));
    }
    if (filters.status) {
      conditions.push(eq(jobRuns.status, filters.status));
    }
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      conditions.push(sql`${jobRuns.startedAt} >= ${fromDate.getTime()}`);
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      conditions.push(sql`${jobRuns.startedAt} <= ${toDate.getTime()}`);
    }

    // Get filtered jobs with pagination
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const jobs = await db
      .select()
      .from(jobRuns)
      .where(whereClause)
      .orderBy(desc(jobRuns.startedAt))
      .limit(pageSize + 1) // Get one extra to check if there's a next page
      .offset(offset);

    // Check if there are more pages
    const hasNextPage = jobs.length > pageSize;
    if (hasNextPage) {
      jobs.pop(); // Remove the extra record
    }

    // Get stats
    const allJobs = await db.select().from(jobRuns).where(whereClause);
    const stats = {
      total: allJobs.length,
      success: allJobs.filter(j => j.status === 'success').length,
      failed: allJobs.filter(j => j.status === 'failed').length,
      running: allJobs.filter(j => j.status === 'running').length
    };

    // Get unique values for filters
    const allJobsForFilters = await db.select().from(jobRuns);
    const uniqueWindows = Array.from(new Set(allJobsForFilters.map(j => j.window))).sort();
    const uniqueStatuses = Array.from(new Set(allJobsForFilters.map(j => j.status))).sort();

    // Get playlists for linking
    const { playlists } = await import('../../db/schema.js');
    const allPlaylists = await db.select().from(playlists);
    const playlistsByWindow = new Map(
      allPlaylists.map(p => [p.window, p])
    );

    const data = {
      jobs,
      playlistsByWindow,
      stats,
      filters,
      uniqueWindows,
      uniqueStatuses,
      pagination: {
        page,
        pageSize,
        hasNextPage,
        hasPrevPage: page > 1
      },
      breadcrumbs: [
        { label: 'Dashboard', url: '/' },
        { label: 'Job History', url: null }
      ]
    };

    // Check if this is an HTMX request
    const { isHtmxRequest, withOobSidebar } = await import('../middleware/htmx.js');
    if (isHtmxRequest(req)) {
      // Return partial HTML for HTMX with OOB sidebar update
      const { HistoryContent } = await import('../views/actions/history.js');
      const content = await HistoryContent(data);

      // Combine content with OOB sidebar to update active state
      const html = await withOobSidebar(content, {
        page: 'history',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      // Return full page layout for regular requests
      const { HistoryPage } = await import('../views/actions/history.js');
      const html = HistoryPage({
        ...data,
        setupComplete,
        page: 'history'
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }
  } catch (error) {
    console.error('Job history page error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Clear job history
 * Supports options: all, failed-only, old (older than 30 days)
 */
actionsRouter.post('/history/clear', async (req, res) => {
  try {
    const db = getDb();
    const { clearType } = req.body;

    let deletedCount = 0;

    if (clearType === 'all') {
      // Clear all job history
      const result = await db.delete(jobRuns).returning();
      deletedCount = result.length;
    } else if (clearType === 'failed') {
      // Clear only failed jobs
      const result = await db
        .delete(jobRuns)
        .where(eq(jobRuns.status, 'failed'))
        .returning();
      deletedCount = result.length;
    } else if (clearType === 'old') {
      // Clear jobs older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const result = await db
        .delete(jobRuns)
        .where(lt(jobRuns.startedAt, thirtyDaysAgo))
        .returning();
      deletedCount = result.length;
    } else {
      return res.status(400).json({ error: 'Invalid clearType. Must be: all, failed, or old' });
    }

    res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Cancel all running jobs
 * Updates status from 'running' to 'cancelled'
 */
actionsRouter.post('/history/cancel-running', async (req, res) => {
  try {
    const db = getDb();

    // Get all running jobs from the queue
    const activeJobIds = jobQueue.getActiveJobIds();

    // Cancel each active job via the queue
    let cancelledCount = 0;
    for (const jobId of activeJobIds) {
      if (jobQueue.cancel(jobId)) {
        cancelledCount++;
      }
    }

    // Also update any orphaned running jobs in the database
    const result = await db
      .update(jobRuns)
      .set({
        status: 'cancelled',
        finishedAt: new Date()
      })
      .where(eq(jobRuns.status, 'running'))
      .returning();

    res.json({ success: true, cancelled: cancelledCount + result.length });
  } catch (error) {
    console.error('Cancel running jobs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Cancel a specific job by ID
 */
actionsRouter.post('/jobs/:jobId/cancel', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Attempt to cancel the job via the queue
    const cancelled = jobQueue.cancel(jobId);

    if (cancelled) {
      res.json({ success: true, message: 'Job cancellation initiated' });
    } else {
      // Job might not be in the queue (already completed or not found)
      const db = getDb();
      const [job] = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.id, jobId))
        .limit(1);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (job.status !== 'running') {
        return res.status(400).json({ error: `Job is ${job.status}, cannot cancel` });
      }

      // Update orphaned running job
      await db
        .update(jobRuns)
        .set({
          status: 'cancelled',
          finishedAt: new Date()
        })
        .where(eq(jobRuns.id, jobId));

      res.json({ success: true, message: 'Job marked as cancelled' });
    }
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get queue statistics and status
 */
actionsRouter.get('/queue/stats', async (req, res) => {
  try {
    const stats = jobQueue.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get AudioMuse sync statistics
 */
actionsRouter.get('/audiomuse/stats', async (req, res) => {
  try {
    // Check if AudioMuse is configured
    const { APP_ENV } = await import('../../config.js');
    if (!APP_ENV.AUDIOMUSE_DB_HOST || !APP_ENV.AUDIOMUSE_DB_USER) {
      return res.json({
        configured: false,
        message: 'AudioMuse not configured. Add credentials to .env file.'
      });
    }

    const { getSyncStats } = await import('../../audiomuse/sync-service.js');
    const { getAudioMuseStats } = await import('../../audiomuse/client.js');

    try {
      const [syncStats, audioMuseStats] = await Promise.all([
        getSyncStats(),
        getAudioMuseStats()
      ]);

      res.json({
        configured: true,
        audioMuse: {
          totalTracks: audioMuseStats.totalTracks,
          totalArtists: audioMuseStats.totalArtists,
          tempo: audioMuseStats.tempo,
          energy: audioMuseStats.energy
        },
        sync: {
          totalInAudioMuse: syncStats.totalInAudioMuse,
          totalSynced: syncStats.totalSynced,
          coveragePercent: syncStats.coveragePercent
        }
      });
    } catch (error) {
      // Connection error - likely AudioMuse not accessible
      res.json({
        configured: true,
        error: 'Could not connect to AudioMuse database',
        message: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  } catch (error) {
    console.error('AudioMuse stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Sync audio features from AudioMuse to local database
 */
actionsRouter.post('/audiomuse/sync', async (req, res) => {
  try {
    // Check if AudioMuse is configured
    const { APP_ENV } = await import('../../config.js');
    if (!APP_ENV.AUDIOMUSE_DB_HOST || !APP_ENV.AUDIOMUSE_DB_USER) {
      return res.status(400).json({
        error: 'AudioMuse not configured',
        message: 'Add AUDIOMUSE_DB_HOST, AUDIOMUSE_DB_USER, and AUDIOMUSE_DB_PASSWORD to .env'
      });
    }

    const { dryRun = false, forceResync = false } = req.body;

    // For now, run sync directly (can be moved to queue later if needed)
    const { syncAudioFeatures } = await import('../../audiomuse/sync-service.js');

    // Return job ID immediately and run in background
    const db = getDb();
    const [job] = await db
      .insert(jobRuns)
      .values({
        window: 'audiomuse-sync',
        startedAt: new Date(),
        status: 'running'
      })
      .returning();

    // Run sync in background
    (async () => {
      try {
        const stats = await syncAudioFeatures({
          dryRun,
          forceResync,
          concurrency: 3,
          onProgress: (current, total, message) => {
            progressTracker.update(job.id, {
              current,
              total,
              message
            });
          }
        });

        // Update job as complete
        await db
          .update(jobRuns)
          .set({
            status: 'success',
            finishedAt: new Date(),
            progressMessage: `Synced ${stats.matched} tracks, ${stats.failed} failed`
          })
          .where(eq(jobRuns.id, job.id));
      } catch (error) {
        // Update job as failed
        await db
          .update(jobRuns)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          .where(eq(jobRuns.id, job.id));
      }
    })();

    res.json({
      jobId: job.id,
      message: dryRun ? 'AudioMuse dry-run sync started' : 'AudioMuse sync started'
    });
  } catch (error) {
    console.error('AudioMuse sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
