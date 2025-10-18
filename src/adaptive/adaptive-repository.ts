/**
 * Database repository for adaptive queue operations
 * Provides queries for stats, session tracking, and failure metrics
 */

import { getDb } from '../db/index.js';
import {
  adaptiveSessions,
  adaptiveSkipEvents,
  adaptiveCompletionEvents,
  adaptiveActions,
  type AdaptiveSessionRecord,
  type AdaptiveSkipEventRecord,
  type AdaptiveActionRecord
} from '../db/schema.js';
import { sql, desc, eq } from 'drizzle-orm';
import { getQueueTracker } from './queue-tracker.js';

/**
 * Statistics for adaptive queue dashboard
 */
export interface AdaptiveStats {
  totalSkips: number;
  totalAdaptations: number;
  activeSessions: number;
  totalSessions: number;
  avgSkipsPerSession: number;
}

/**
 * Get aggregate statistics for adaptive queue feature
 * Phase 1: Returns zeros (no data yet)
 * Phase 2+: Real-time stats from database
 */
export async function getAdaptiveStats(): Promise<AdaptiveStats> {
  const db = getDb();

  try {
    // Count total skip events
    const skipCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(adaptiveSkipEvents);
    const totalSkips = skipCountResult[0]?.count || 0;

    // Count total adaptive actions
    const actionCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(adaptiveActions);
    const totalAdaptations = actionCountResult[0]?.count || 0;

    // Count active sessions (created in last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activeSessionsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(adaptiveSessions)
      .where(sql`${adaptiveSessions.updatedAt} >= ${oneDayAgo}`);
    const activeSessions = activeSessionsResult[0]?.count || 0;

    // Count total sessions (all time)
    const totalSessionsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(adaptiveSessions);
    const totalSessions = totalSessionsResult[0]?.count || 0;

    // Calculate average skips per session
    const avgSkipsPerSession = totalSessions > 0
      ? Math.round((totalSkips / totalSessions) * 10) / 10
      : 0;

    return {
      totalSkips,
      totalAdaptations,
      activeSessions,
      totalSessions,
      avgSkipsPerSession
    };
  } catch {
    // If tables don't exist yet or any error, return zeros
    return {
      totalSkips: 0,
      totalAdaptations: 0,
      activeSessions: 0,
      totalSessions: 0,
      avgSkipsPerSession: 0
    };
  }
}

/**
 * Get all sessions (for debugging/monitoring)
 * Phase 2+
 */
export async function getAllSessions(): Promise<AdaptiveSessionRecord[]> {
  const db = getDb();
  return await db.select().from(adaptiveSessions);
}

/**
 * Create or update session
 */
export async function upsertSession(
  machineIdentifier: string,
  playQueueId: number | null,
  playlistId: number | null
): Promise<number> {
  const db = getDb();

  // Try to find existing session
  const existing = await db
    .select()
    .from(adaptiveSessions)
    .where(sql`${adaptiveSessions.machineIdentifier} = ${machineIdentifier}`)
    .limit(1);

  const now = new Date();

  if (existing.length > 0) {
    // Update existing
    await db
      .update(adaptiveSessions)
      .set({
        playQueueId,
        playlistId,
        updatedAt: now
      })
      .where(sql`${adaptiveSessions.id} = ${existing[0].id}`);

    return existing[0].id;
  } else {
    // Create new
    const result = await db
      .insert(adaptiveSessions)
      .values({
        machineIdentifier,
        playQueueId,
        playlistId,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return result[0].id;
  }
}

/**
 * Get recent skip events for a session
 */
export async function getRecentSkips(
  sessionId: number,
  limit = 50
): Promise<AdaptiveSkipEventRecord[]> {
  const db = getDb();

  return await db
    .select()
    .from(adaptiveSkipEvents)
    .where(eq(adaptiveSkipEvents.sessionId, sessionId))
    .orderBy(desc(adaptiveSkipEvents.skippedAt))
    .limit(limit);
}

/**
 * Get recent adaptive actions for a session
 */
export async function getRecentActions(
  sessionId: number,
  limit = 50
): Promise<AdaptiveActionRecord[]> {
  const db = getDb();

  return await db
    .select()
    .from(adaptiveActions)
    .where(eq(adaptiveActions.sessionId, sessionId))
    .orderBy(desc(adaptiveActions.createdAt))
    .limit(limit);
}

/**
 * Get queue discovery failure metrics
 * Uses in-memory tracker, not persisted to database
 */
export function getQueueDiscoveryFailures(limit = 10) {
  const tracker = getQueueTracker();
  return tracker.getRecentFailures(limit);
}

/**
 * Get queue tracker cache statistics
 */
export function getQueueTrackerStats() {
  const tracker = getQueueTracker();
  return tracker.getCacheStats();
}

/**
 * Calculate recent skip rate from adaptive system data
 * Returns skip rate as decimal 0-1 (e.g., 0.30 = 30%)
 * Timeframe: Last 7 days
 * Formula: skip_events / (skip_events + completion_events)
 * Returns 0 if no data or adaptive tables don't exist
 */
export async function getRecentSkipRate(): Promise<number> {
  const db = getDb();

  try {
    // Calculate timestamp for 7 days ago
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Count skip events in last 7 days
    const skipCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(adaptiveSkipEvents)
      .where(sql`${adaptiveSkipEvents.skippedAt} >= ${sevenDaysAgo}`);
    const skipCount = skipCountResult[0]?.count || 0;

    // Count completion events in last 7 days
    const completionCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(adaptiveCompletionEvents)
      .where(sql`${adaptiveCompletionEvents.completedAt} >= ${sevenDaysAgo}`);
    const completionCount = completionCountResult[0]?.count || 0;

    // Calculate total events
    const totalEvents = skipCount + completionCount;

    // If no events, return 0
    if (totalEvents === 0) {
      return 0;
    }

    // Calculate skip rate as decimal
    return skipCount / totalEvents;
  } catch {
    // If tables don't exist yet or any error, return 0
    return 0;
  }
}
