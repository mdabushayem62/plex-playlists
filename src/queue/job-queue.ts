/**
 * In-process job queue for background tasks
 * Provides concurrency control, cancellation, and progress tracking
 */

import PQueue from 'p-queue';
import { createPlaylistRunner } from '../playlist-runner.js';
import { warmCache, warmAlbumCache } from '../cache/cache-cli.js';
import { syncRatedTracks, syncLibrary } from '../cache/track-cache-service.js';
import { recordJobStart, recordJobCompletion } from '../db/repository.js';
import { progressTracker } from '../utils/progress-tracker.js';
import { logger } from '../logger.js';
import type { PlaylistWindow } from '../windows.js';
import { generateAllCustomPlaylists } from '../playlist/custom-playlist-runner.js';

export type JobType =
  | { type: 'playlist'; window: PlaylistWindow }
  | { type: 'cache-warm'; concurrency?: number }
  | { type: 'cache-albums'; concurrency?: number }
  | { type: 'cache-sync-rated'; batchSize?: number }
  | { type: 'cache-sync-full'; batchSize?: number }
  | { type: 'custom-playlists' };

interface ActiveJob {
  abortController: AbortController;
  type: JobType;
  startedAt: Date;
}

export class JobQueue {
  private queue: PQueue;
  private activeJobs = new Map<number, ActiveJob>();

  constructor(concurrency = 2) {
    this.queue = new PQueue({ concurrency });
    logger.info({ concurrency }, 'job queue initialized');
  }

  /**
   * Enqueue a job for background execution
   * Returns immediately with job ID
   */
  async enqueue(job: JobType): Promise<number> {
    const windowName = this.getWindowName(job);
    const jobId = await recordJobStart(windowName);
    const abortController = new AbortController();

    this.activeJobs.set(jobId, {
      abortController,
      type: job,
      startedAt: new Date()
    });

    logger.info({ jobId, type: job.type, windowName }, 'job enqueued');

    // Add to queue - execution happens asynchronously
    this.queue.add(async () => {
      try {
        // Check if cancelled before starting
        if (abortController.signal.aborted) {
          await recordJobCompletion(jobId, 'failed', 'Job cancelled before execution');
          logger.info({ jobId }, 'job cancelled before execution');
          return;
        }

        logger.info({ jobId, type: job.type, windowName }, 'job execution started');

        // Execute the job using core functions
        await this.executeJob(job, jobId, abortController.signal);

        // Mark as successful
        await recordJobCompletion(jobId, 'success');
        logger.info({ jobId, type: job.type, windowName }, 'job completed successfully');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await recordJobCompletion(jobId, 'failed', errorMsg);
        logger.error({ jobId, err: error, type: job.type, windowName }, 'job failed');
      } finally {
        this.activeJobs.delete(jobId);
        progressTracker.stopTracking(jobId);
      }
    });

    return jobId;
  }

  /**
   * Execute a job using the appropriate core function
   */
  private async executeJob(
    job: JobType,
    jobId: number,
    signal: AbortSignal
  ): Promise<void> {
    switch (job.type) {
      case 'playlist': {
        const runner = createPlaylistRunner();
        await runner.run(job.window, jobId);
        break;
      }

      case 'cache-warm': {
        await warmCache({
          concurrency: job.concurrency ?? 2,
          jobId,
          signal
        });
        break;
      }

      case 'cache-albums': {
        await warmAlbumCache({
          concurrency: job.concurrency ?? 3,
          jobId,
          signal
        });
        break;
      }

      case 'custom-playlists': {
        await generateAllCustomPlaylists();
        break;
      }

      case 'cache-sync-rated': {
        await syncRatedTracks({
          batchSize: job.batchSize ?? 50,
          jobId,
          signal,
          progressTracker
        });
        break;
      }

      case 'cache-sync-full': {
        await syncLibrary({
          batchSize: job.batchSize ?? 50,
          jobId,
          signal,
          progressTracker
        });
        break;
      }

      default:
        throw new Error(`Unknown job type: ${(job as JobType).type}`);
    }
  }

  /**
   * Cancel a running or pending job
   * Returns true if job was found and cancelled
   */
  cancel(jobId: number): boolean {
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      activeJob.abortController.abort();
      logger.info({ jobId, type: activeJob.type.type }, 'job cancelled');
      return true;
    }
    return false;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      active: this.activeJobs.size,
      concurrency: this.queue.concurrency
    };
  }

  /**
   * Get list of active job IDs
   */
  getActiveJobIds(): number[] {
    return Array.from(this.activeJobs.keys());
  }

  /**
   * Helper to get window/job name from job type
   */
  private getWindowName(job: JobType): string {
    switch (job.type) {
      case 'playlist':
        return job.window;
      case 'cache-warm':
        return 'cache-warm';
      case 'cache-albums':
        return 'album-cache-warm';
      case 'cache-sync-rated':
        return 'cache-sync-rated';
      case 'cache-sync-full':
        return 'cache-sync-full';
      case 'custom-playlists':
        return 'custom-playlists';
      default:
        return 'unknown';
    }
  }
}

// Singleton instance with configurable concurrency
export const jobQueue = new JobQueue(2); // Max 2 concurrent background jobs
