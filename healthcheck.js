#!/usr/bin/env node
/**
 * Docker healthcheck script
 *
 * Verifies:
 * 1. Database is accessible
 * 2. At least one job has run (scheduler is working)
 * 3. Most recent job was within expected timeframe
 *
 * Exit codes:
 * 0 = healthy
 * 1 = unhealthy
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || '/data/plex-playlists.db';
const MAX_JOB_AGE_HOURS = 25; // Allow 1 hour grace period for daily jobs

function healthcheck() {
  try {
    // Check 1: Database file exists and is readable
    if (!fs.existsSync(DB_PATH)) {
      console.error('UNHEALTHY: Database file not found at', DB_PATH);
      process.exit(1);
    }

    const stats = fs.statSync(DB_PATH);
    if (!stats.isFile()) {
      console.error('UNHEALTHY: Database path is not a file');
      process.exit(1);
    }

    // Check 2: Database is accessible (try to open it)
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

    // Check 3: At least one job has been recorded
    const jobCount = db.prepare('SELECT COUNT(*) as count FROM job_runs').get();
    if (jobCount.count === 0) {
      // This is OK during initial startup - container is healthy but no jobs yet
      console.log('HEALTHY: No jobs run yet (initial startup)');
      db.close();
      process.exit(0);
    }

    // Check 4: Most recent job was within acceptable timeframe
    const mostRecentJob = db.prepare(`
      SELECT
        window,
        started_at,
        status,
        (strftime('%s', 'now') * 1000 - started_at) / 1000 / 3600 as hours_ago
      FROM job_runs
      ORDER BY started_at DESC
      LIMIT 1
    `).get();

    db.close();

    if (!mostRecentJob) {
      console.error('UNHEALTHY: Could not retrieve most recent job');
      process.exit(1);
    }

    const hoursAgo = parseFloat(mostRecentJob.hours_ago);

    if (hoursAgo > MAX_JOB_AGE_HOURS) {
      console.error(
        `UNHEALTHY: Last job was ${hoursAgo.toFixed(1)} hours ago (max ${MAX_JOB_AGE_HOURS}h)`,
        `Window: ${mostRecentJob.window}, Status: ${mostRecentJob.status}`
      );
      process.exit(1);
    }

    console.log(
      `HEALTHY: Last job ${hoursAgo.toFixed(1)}h ago`,
      `(${mostRecentJob.window}: ${mostRecentJob.status})`
    );
    process.exit(0);

  } catch (error) {
    console.error('UNHEALTHY: Healthcheck failed:', error.message);
    process.exit(1);
  }
}

healthcheck();
