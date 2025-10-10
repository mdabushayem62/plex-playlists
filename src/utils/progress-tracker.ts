/**
 * Progress tracking utility for long-running jobs
 * Provides in-memory progress state with SSE broadcasting and rate-limited DB persistence
 */

import { EventEmitter } from 'events';
import { getDb } from '../db/index.js';
import { jobRuns } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

export interface SourceCounts {
  spotify: number;
  lastfm: number;
  plex: number;
  manual: number;
  cached: number;
}

export interface JobProgress {
  jobId: number;
  current: number;
  total: number;
  message: string;
  startTime: number;
  lastUpdateTime: number;
  lastPersistTime: number;
  lastPersistedPercent: number;
  sourceCounts?: SourceCounts;
}

export interface ProgressUpdate {
  jobId: number;
  current: number;
  total: number;
  message: string;
  percent: number;
  eta: number | null; // seconds remaining
  sourceCounts?: SourceCounts;
}

/**
 * Global progress tracker singleton
 * Maintains in-memory state for active jobs and broadcasts updates via SSE
 */
class ProgressTracker extends EventEmitter {
  private jobs: Map<number, JobProgress> = new Map();
  private persistThresholdPercent = 10; // Persist every 10% progress
  private persistThresholdMs = 30000; // Persist every 30 seconds

  /**
   * Initialize progress tracking for a job
   */
  startTracking(jobId: number, total: number, message: string, trackSources = false): void {
    const now = Date.now();
    this.jobs.set(jobId, {
      jobId,
      current: 0,
      total,
      message,
      startTime: now,
      lastUpdateTime: now,
      lastPersistTime: now,
      lastPersistedPercent: 0,
      sourceCounts: trackSources ? { spotify: 0, lastfm: 0, plex: 0, manual: 0, cached: 0 } : undefined
    });

    logger.debug({ jobId, total, message }, 'started progress tracking');
    this.emitUpdate(jobId);
  }

  /**
   * Update progress for a job
   * Automatically persists to DB based on thresholds (10% or 30s)
   */
  async updateProgress(
    jobId: number,
    current: number,
    message?: string
  ): Promise<void> {
    const progress = this.jobs.get(jobId);
    if (!progress) {
      logger.warn({ jobId }, 'attempted to update progress for untracked job');
      return;
    }

    const now = Date.now();
    progress.current = current;
    progress.lastUpdateTime = now;
    if (message) {
      progress.message = message;
    }

    // Check if we should persist to database
    const currentPercent = Math.floor((current / progress.total) * 100);
    const percentDelta = currentPercent - progress.lastPersistedPercent;
    const timeDelta = now - progress.lastPersistTime;

    const shouldPersist =
      percentDelta >= this.persistThresholdPercent ||
      timeDelta >= this.persistThresholdMs ||
      current === progress.total; // Always persist on completion

    if (shouldPersist) {
      await this.persistToDb(jobId);
      progress.lastPersistTime = now;
      progress.lastPersistedPercent = currentPercent;
    }

    // Always emit update for SSE clients
    this.emitUpdate(jobId);
  }

  /**
   * Increment source count for a job
   * Used to track which API source was used for genre enrichment
   */
  incrementSource(
    jobId: number,
    source: 'spotify' | 'lastfm' | 'plex' | 'manual' | 'cached'
  ): void {
    const progress = this.jobs.get(jobId);
    if (!progress || !progress.sourceCounts) {
      return;
    }

    progress.sourceCounts[source]++;

    // Emit update for real-time source tracking
    this.emitUpdate(jobId);
  }

  /**
   * Get current progress for a job
   */
  getProgress(jobId: number): ProgressUpdate | null {
    const progress = this.jobs.get(jobId);
    if (!progress) {
      return null;
    }

    return {
      jobId: progress.jobId,
      current: progress.current,
      total: progress.total,
      message: progress.message,
      percent: Math.floor((progress.current / progress.total) * 100),
      eta: this.calculateETA(progress),
      sourceCounts: progress.sourceCounts
    };
  }

  /**
   * Stop tracking a job (cleanup)
   */
  async stopTracking(jobId: number): Promise<void> {
    const progress = this.jobs.get(jobId);
    if (!progress) {
      return;
    }

    // Final persist to DB
    await this.persistToDb(jobId);

    this.jobs.delete(jobId);
    logger.debug({ jobId }, 'stopped progress tracking');
  }

  /**
   * Calculate ETA in seconds based on current progress rate
   */
  private calculateETA(progress: JobProgress): number | null {
    if (progress.current === 0) {
      return null;
    }

    const elapsed = (Date.now() - progress.startTime) / 1000; // seconds
    const rate = progress.current / elapsed; // items per second
    const remaining = progress.total - progress.current;

    if (rate === 0) {
      return null;
    }

    return Math.ceil(remaining / rate);
  }

  /**
   * Emit progress update event for SSE subscribers
   */
  private emitUpdate(jobId: number): void {
    const update = this.getProgress(jobId);
    if (update) {
      this.emit('progress', update);
    }
  }

  /**
   * Persist current progress to database
   */
  private async persistToDb(jobId: number): Promise<void> {
    const progress = this.jobs.get(jobId);
    if (!progress) {
      return;
    }

    try {
      const db = getDb();
      await db
        .update(jobRuns)
        .set({
          progressCurrent: progress.current,
          progressTotal: progress.total,
          progressMessage: progress.message
        })
        .where(eq(jobRuns.id, jobId));

      logger.debug(
        { jobId, current: progress.current, total: progress.total },
        'persisted progress to database'
      );
    } catch (error) {
      logger.error({ jobId, error }, 'failed to persist progress to database');
    }
  }

  /**
   * Get all active jobs with progress
   */
  getAllProgress(): ProgressUpdate[] {
    return Array.from(this.jobs.keys())
      .map(jobId => this.getProgress(jobId))
      .filter((p): p is ProgressUpdate => p !== null);
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();

/**
 * Helper to format ETA as human-readable string
 */
export function formatETA(seconds: number | null): string {
  if (seconds === null) {
    return 'calculating...';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
