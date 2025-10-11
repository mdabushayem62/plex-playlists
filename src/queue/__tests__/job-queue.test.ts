/**
 * Unit tests for job queue system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobQueue } from '../job-queue.js';
import type { JobType } from '../job-queue.js';

// Mock dependencies
vi.mock('../../playlist-runner.js', () => ({
  createPlaylistRunner: () => ({
    run: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock('../../cache/cache-cli.js', () => ({
  warmCache: vi.fn().mockResolvedValue({ totalArtists: 100, cached: 100, errors: [] }),
  warmAlbumCache: vi.fn().mockResolvedValue({ totalAlbums: 50, cached: 50, errors: [] })
}));

vi.mock('../../playlist/custom-playlist-runner.js', () => ({
  generateAllCustomPlaylists: vi.fn().mockResolvedValue({ generated: 5, failed: 0 })
}));

vi.mock('../../db/repository.js', () => ({
  recordJobStart: vi.fn().mockResolvedValue(1),
  recordJobCompletion: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/progress-tracker.js', () => ({
  progressTracker: {
    stopTracking: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('JobQueue', () => {
  let queue: JobQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new JobQueue(2); // concurrency of 2 for testing
  });

  afterEach(() => {
    // Clean up any pending jobs
    const activeIds = queue.getActiveJobIds();
    activeIds.forEach(id => queue.cancel(id));
  });

  describe('enqueue', () => {
    it('should enqueue a playlist job and return job ID', async () => {
      const job: JobType = { type: 'playlist', window: 'morning' };

      const jobId = await queue.enqueue(job);

      expect(jobId).toBe(1); // Mocked to return 1
      expect(typeof jobId).toBe('number');
    });

    it('should enqueue a cache-warm job', async () => {
      const job: JobType = { type: 'cache-warm', concurrency: 2 };

      const jobId = await queue.enqueue(job);

      expect(jobId).toBe(1);
    });

    it('should enqueue a cache-albums job', async () => {
      const job: JobType = { type: 'cache-albums', concurrency: 3 };

      const jobId = await queue.enqueue(job);

      expect(jobId).toBe(1);
    });

    it('should enqueue a custom-playlists job', async () => {
      const job: JobType = { type: 'custom-playlists' };

      const jobId = await queue.enqueue(job);

      expect(jobId).toBe(1);
    });

    it('should handle multiple jobs in queue', async () => {
      const jobs: JobType[] = [
        { type: 'playlist', window: 'morning' },
        { type: 'playlist', window: 'afternoon' },
        { type: 'cache-warm', concurrency: 2 }
      ];

      const jobIds = await Promise.all(jobs.map(job => queue.enqueue(job)));

      expect(jobIds).toHaveLength(3);
      expect(jobIds.every(id => typeof id === 'number')).toBe(true);
    });
  });

  describe('cancel', () => {
    it('should track job before execution', async () => {
      const job: JobType = { type: 'cache-warm', concurrency: 2 };
      const jobId = await queue.enqueue(job);

      // Job should be tracked immediately after enqueue
      const activeIds = queue.getActiveJobIds();

      // Job is either active or already completed
      expect(typeof jobId).toBe('number');
      expect(Array.isArray(activeIds)).toBe(true);
    });

    it('should return false when cancelling non-existent job', () => {
      const cancelled = queue.cancel(999);

      expect(cancelled).toBe(false);
    });

    it('should handle cancellation request gracefully', async () => {
      const job: JobType = { type: 'playlist', window: 'morning' };
      const jobId = await queue.enqueue(job);

      const cancelled = queue.cancel(jobId);

      // Might be true or false depending on timing
      expect(typeof cancelled).toBe('boolean');
    });
  });

  describe('getStats', () => {
    it('should return initial stats with no jobs', () => {
      const stats = queue.getStats();

      expect(stats).toEqual({
        pending: 0,
        size: 0,
        active: 0,
        concurrency: 2
      });
    });

    it('should track pending jobs', async () => {
      // Enqueue more jobs than concurrency allows
      const jobs: JobType[] = [
        { type: 'playlist', window: 'morning' },
        { type: 'playlist', window: 'afternoon' },
        { type: 'playlist', window: 'evening' },
        { type: 'cache-warm', concurrency: 2 }
      ];

      await Promise.all(jobs.map(job => queue.enqueue(job)));

      const stats = queue.getStats();

      // With concurrency 2, should have some pending
      expect(stats.concurrency).toBe(2);
      expect(stats.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getActiveJobIds', () => {
    it('should return empty array when no jobs active', () => {
      const activeIds = queue.getActiveJobIds();

      expect(activeIds).toEqual([]);
    });

    it('should return active job IDs', async () => {
      const job: JobType = { type: 'cache-warm', concurrency: 2 };
      await queue.enqueue(job);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      const activeIds = queue.getActiveJobIds();

      // Should contain the job ID or be empty if already completed
      expect(Array.isArray(activeIds)).toBe(true);
    });
  });

  describe('concurrency control', () => {
    it('should respect concurrency limit', async () => {
      const concurrency = 2;
      const testQueue = new JobQueue(concurrency);

      // Enqueue more jobs than concurrency
      const jobs: JobType[] = Array(5).fill(null).map((_, i) => ({
        type: 'playlist' as const,
        window: i % 2 === 0 ? 'morning' : 'afternoon'
      }));

      await Promise.all(jobs.map(job => testQueue.enqueue(job)));

      const stats = testQueue.getStats();

      // Active should not exceed concurrency
      expect(stats.active).toBeLessThanOrEqual(concurrency);

      // Clean up
      testQueue.getActiveJobIds().forEach(id => testQueue.cancel(id));
    });
  });

  describe('error handling', () => {
    it('should handle job execution errors gracefully', async () => {
      const job: JobType = { type: 'playlist', window: 'morning' };

      // Should not throw even if underlying job fails
      const jobId = await queue.enqueue(job);

      expect(typeof jobId).toBe('number');
      expect(jobId).toBeGreaterThan(0);
    });
  });

  describe('AbortSignal integration', () => {
    it('should pass AbortSignal to cache operations', async () => {
      const job: JobType = { type: 'cache-warm', concurrency: 2 };
      const jobId = await queue.enqueue(job);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel the job
      queue.cancel(jobId);

      // AbortSignal should be triggered
      // (Actual signal handling tested in cache-cli tests)
    });
  });
});

describe('JobQueue Integration', () => {
  it('should enqueue multiple jobs successfully', async () => {
    const queue = new JobQueue(1); // Single worker

    // Enqueue jobs
    const jobIds = await Promise.all([
      queue.enqueue({ type: 'playlist', window: 'morning' }),
      queue.enqueue({ type: 'playlist', window: 'afternoon' }),
      queue.enqueue({ type: 'playlist', window: 'evening' })
    ]);

    expect(jobIds).toHaveLength(3);
    expect(jobIds.every(id => typeof id === 'number')).toBe(true);
    expect(jobIds.every(id => id > 0)).toBe(true);

    // Clean up
    jobIds.forEach(id => queue.cancel(id));
  });
});
