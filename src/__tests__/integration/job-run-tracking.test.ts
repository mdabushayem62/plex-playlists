/**
 * Integration tests for job run tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc } from 'drizzle-orm';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as schema from '../../db/schema.js';

describe('Job Run Tracking Integration', () => {
  let ctx: TestDbContext;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    closeTestDb(ctx);
  });

  it('should record job start', () => {
    const startTime = new Date();

    const inserted = db
      .insert(schema.jobRuns)
      .values({
        window: 'morning',
        startedAt: startTime,
        status: 'running'
      })
      .returning({ id: schema.jobRuns.id })
      .get();

    expect(inserted).toBeDefined();
    expect(inserted!.id).toBeGreaterThan(0);

    // Verify job was recorded
    const job = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.id, inserted!.id))
      .get();

    expect(job).toBeDefined();
    expect(job!.window).toBe('morning');
    expect(job!.status).toBe('running');
    expect(job!.finishedAt).toBeNull();
    expect(job!.error).toBeNull();
  });

  it('should record successful job completion', () => {
    // Start job
    const startTime = new Date();
    const inserted = db
      .insert(schema.jobRuns)
      .values({
        window: 'afternoon',
        startedAt: startTime,
        status: 'running'
      })
      .returning({ id: schema.jobRuns.id })
      .get();

    const jobId = inserted!.id;

    // Complete job successfully
    const finishTime = new Date(startTime.getTime() + 5000); // 5 seconds later
    db.update(schema.jobRuns)
      .set({
        finishedAt: finishTime,
        status: 'success'
      })
      .where(eq(schema.jobRuns.id, jobId))
      .run();

    // Verify completion
    const completedJob = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.id, jobId))
      .get();

    expect(completedJob!.status).toBe('success');
    expect(completedJob!.finishedAt).toBeDefined();
    expect(completedJob!.error).toBeNull();
  });

  it('should record failed job with error message', () => {
    // Start job
    const inserted = db
      .insert(schema.jobRuns)
      .values({
        window: 'evening',
        startedAt: new Date(),
        status: 'running'
      })
      .returning({ id: schema.jobRuns.id })
      .get();

    const jobId = inserted!.id;

    // Fail job with error
    const errorMessage = 'Plex server unreachable: ECONNREFUSED';
    db.update(schema.jobRuns)
      .set({
        finishedAt: new Date(),
        status: 'failed',
        error: errorMessage
      })
      .where(eq(schema.jobRuns.id, jobId))
      .run();

    // Verify failure
    const failedJob = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.id, jobId))
      .get();

    expect(failedJob!.status).toBe('failed');
    expect(failedJob!.error).toBe(errorMessage);
    expect(failedJob!.finishedAt).toBeDefined();
  });

  it('should track multiple jobs for different windows', () => {
    const windows = ['morning', 'afternoon', 'evening', 'synthwave'];

    windows.forEach(window => {
      db.insert(schema.jobRuns)
        .values({
          window,
          startedAt: new Date(),
          status: 'success',
          finishedAt: new Date()
        })
        .run();
    });

    // Verify all jobs recorded
    const allJobs = db.select().from(schema.jobRuns).all();
    expect(allJobs).toHaveLength(4);

    const recordedWindows = allJobs.map(job => job.window).sort();
    expect(recordedWindows).toEqual(['afternoon', 'evening', 'morning', 'synthwave']);
  });

  it('should query most recent job for a window', () => {
    const window = 'morning';

    // Insert multiple jobs for same window
    db.insert(schema.jobRuns)
      .values({
        window,
        startedAt: new Date(Date.now() - 3600000), // 1 hour ago
        status: 'success',
        finishedAt: new Date(Date.now() - 3500000)
      })
      .run();

    db.insert(schema.jobRuns)
      .values({
        window,
        startedAt: new Date(Date.now() - 1800000), // 30 minutes ago
        status: 'success',
        finishedAt: new Date(Date.now() - 1700000)
      })
      .run();

    const job3 = db
      .insert(schema.jobRuns)
      .values({
        window,
        startedAt: new Date(), // Just now
        status: 'running'
      })
      .returning({ id: schema.jobRuns.id })
      .get();

    // Query most recent job
    const mostRecent = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.window, window))
      .orderBy(desc(schema.jobRuns.startedAt))
      .limit(1)
      .get();

    expect(mostRecent).toBeDefined();
    expect(mostRecent!.id).toBe(job3!.id);
    expect(mostRecent!.status).toBe('running');
  });

  it('should calculate job duration from timestamps', () => {
    const startTime = new Date('2025-10-09T10:00:00Z');
    const finishTime = new Date('2025-10-09T10:05:30Z'); // 5.5 minutes later

    const inserted = db
      .insert(schema.jobRuns)
      .values({
        window: 'test',
        startedAt: startTime,
        status: 'success',
        finishedAt: finishTime
      })
      .returning({ id: schema.jobRuns.id })
      .get();

    const job = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.id, inserted!.id))
      .get();

    // Calculate duration in application code
    const durationMs = job!.finishedAt!.getTime() - job!.startedAt.getTime();
    const durationSeconds = durationMs / 1000;

    expect(durationSeconds).toBe(330); // 5 minutes 30 seconds = 330 seconds
  });

  it('should handle long error messages', () => {
    const longError = 'Error: '.repeat(100) + 'Very long error message with stack trace...';

    db.insert(schema.jobRuns)
      .values({
        window: 'morning',
        startedAt: new Date(),
        status: 'failed',
        finishedAt: new Date(),
        error: longError
      })
      .run();

    const job = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.window, 'morning'))
      .get();

    expect(job!.error).toBe(longError);
    expect(job!.error!.length).toBeGreaterThan(100);
  });

  it('should support querying job history by status', () => {
    // Insert mixed success/failure jobs
    db.insert(schema.jobRuns)
      .values([
        {
          window: 'morning',
          startedAt: new Date(Date.now() - 86400000),
          status: 'success',
          finishedAt: new Date(Date.now() - 86300000)
        },
        {
          window: 'morning',
          startedAt: new Date(Date.now() - 43200000),
          status: 'failed',
          finishedAt: new Date(Date.now() - 43100000),
          error: 'Plex timeout'
        },
        {
          window: 'morning',
          startedAt: new Date(),
          status: 'success',
          finishedAt: new Date()
        }
      ])
      .run();

    // Query failed jobs
    const failures = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.status, 'failed'))
      .all();

    expect(failures).toHaveLength(1);
    expect(failures[0]!.error).toBe('Plex timeout');

    // Query successful jobs
    const successes = db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.status, 'success'))
      .all();

    expect(successes).toHaveLength(2);
  });
});
