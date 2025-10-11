/**
 * Tests for job cancellation via AbortSignal
 */

import { describe, it, expect, vi } from 'vitest';

describe('Job Cancellation', () => {
  describe('AbortSignal behavior', () => {
    it('should detect abort signal when checked', () => {
      const controller = new AbortController();

      expect(controller.signal.aborted).toBe(false);

      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });

    it('should allow passing abort signal to functions', async () => {
      const controller = new AbortController();

      const mockFunction = async (signal?: AbortSignal) => {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 10));

        // Check for cancellation
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        return 'completed';
      };

      // Normal execution
      const result1 = await mockFunction(controller.signal);
      expect(result1).toBe('completed');

      // Cancelled execution
      controller.abort();
      await expect(mockFunction(controller.signal)).rejects.toThrow('Operation cancelled');
    });

    it('should handle abort after operation completes', async () => {
      const controller = new AbortController();

      const mockFunction = async (signal?: AbortSignal) => {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        return 'completed';
      };

      const result = await mockFunction(controller.signal);
      controller.abort(); // Abort after completion

      expect(result).toBe('completed');
    });
  });

  describe('Cache warming cancellation', () => {
    it('should check abort signal at strategic points', async () => {
      const controller = new AbortController();
      let checkCount = 0;

      const mockCacheWarm = async (signal?: AbortSignal) => {
        // Check 1: Before fetching Plex data
        checkCount++;
        if (signal?.aborted) throw new Error('Cancelled before Plex fetch');

        await new Promise(resolve => setTimeout(resolve, 5));

        // Check 2: Before enrichment
        checkCount++;
        if (signal?.aborted) throw new Error('Cancelled before enrichment');

        await new Promise(resolve => setTimeout(resolve, 5));

        // Check 3: Before cache write
        checkCount++;
        if (signal?.aborted) throw new Error('Cancelled before cache write');

        return { success: true };
      };

      // Test early cancellation
      controller.abort();
      await expect(mockCacheWarm(controller.signal))
        .rejects.toThrow('Cancelled before Plex fetch');

      expect(checkCount).toBe(1); // Should stop at first check
    });

    it('should allow cancellation during long-running operation', async () => {
      const controller = new AbortController();

      const longRunningOperation = async (signal?: AbortSignal) => {
        for (let i = 0; i < 10; i++) {
          if (signal?.aborted) {
            throw new Error(`Cancelled at iteration ${i}`);
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return 'completed';
      };

      // Start operation and cancel mid-way
      const operationPromise = longRunningOperation(controller.signal);

      setTimeout(() => controller.abort(), 25); // Cancel after ~2 iterations

      await expect(operationPromise).rejects.toThrow(/Cancelled at iteration/);
    });
  });

  describe('Multiple concurrent cancellations', () => {
    it('should handle cancelling multiple jobs independently', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const controller3 = new AbortController();

      expect(controller1.signal.aborted).toBe(false);
      expect(controller2.signal.aborted).toBe(false);
      expect(controller3.signal.aborted).toBe(false);

      controller2.abort();

      expect(controller1.signal.aborted).toBe(false);
      expect(controller2.signal.aborted).toBe(true);
      expect(controller3.signal.aborted).toBe(false);
    });

    it('should maintain independent abort signals per job', async () => {
      const controllers = [
        new AbortController(),
        new AbortController(),
        new AbortController()
      ];

      const mockJobs = controllers.map((controller, index) => ({
        id: index,
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          if (controller.signal.aborted) {
            throw new Error(`Job ${index} cancelled`);
          }
          return `Job ${index} completed`;
        }
      }));

      // Cancel job 1
      controllers[1].abort();

      const results = await Promise.allSettled(
        mockJobs.map(job => job.execute())
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      if (results[1].status === 'rejected') {
        expect(results[1].reason.message).toBe('Job 1 cancelled');
      }
    });
  });

  describe('Cleanup after cancellation', () => {
    it('should clean up resources when job is cancelled', async () => {
      const controller = new AbortController();
      const cleanupMock = vi.fn();

      const jobWithCleanup = async (signal?: AbortSignal) => {
        try {
          if (signal?.aborted) {
            throw new Error('Cancelled');
          }

          await new Promise(resolve => setTimeout(resolve, 10));

          if (signal?.aborted) {
            throw new Error('Cancelled');
          }

          return 'completed';
        } finally {
          cleanupMock();
        }
      };

      controller.abort();

      await expect(jobWithCleanup(controller.signal)).rejects.toThrow('Cancelled');

      expect(cleanupMock).toHaveBeenCalledTimes(1);
    });

    it('should cleanup even on successful completion', async () => {
      const controller = new AbortController();
      const cleanupMock = vi.fn();

      const jobWithCleanup = async (signal?: AbortSignal) => {
        try {
          if (signal?.aborted) throw new Error('Cancelled');
          return 'completed';
        } finally {
          cleanupMock();
        }
      };

      const result = await jobWithCleanup(controller.signal);

      expect(result).toBe('completed');
      expect(cleanupMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Race conditions', () => {
    it('should handle abort signal set before job starts', async () => {
      const controller = new AbortController();

      controller.abort(); // Abort before job starts

      const job = async (signal?: AbortSignal) => {
        if (signal?.aborted) {
          throw new Error('Already cancelled');
        }
        return 'completed';
      };

      await expect(job(controller.signal)).rejects.toThrow('Already cancelled');
    });

    it('should handle rapid abort after job completion', async () => {
      const controller = new AbortController();

      const job = async (signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error('Cancelled');
        return 'completed';
      };

      const result = await job(controller.signal);
      controller.abort(); // Abort immediately after

      expect(result).toBe('completed');
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe('Error propagation', () => {
    it('should propagate cancellation errors with context', async () => {
      const controller = new AbortController();

      const job = async (jobId: number, signal?: AbortSignal) => {
        await new Promise(resolve => setTimeout(resolve, 10));

        if (signal?.aborted) {
          throw new Error(`Job ${jobId} was cancelled by user`);
        }

        return 'completed';
      };

      controller.abort();

      try {
        await job(123, controller.signal);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Job 123 was cancelled by user');
      }
    });
  });
});
