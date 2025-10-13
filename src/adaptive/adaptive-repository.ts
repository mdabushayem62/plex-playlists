/**
 * Database repository for adaptive queue operations
 * Phase 1: Basic stats queries
 * Phase 2+: Full session tracking, skip events, pattern analysis
 */

import { getDb } from '../db/index.js';
import {
  adaptiveSessions,
  adaptiveSkipEvents,
  adaptiveActions,
  type AdaptiveSessionRecord
} from '../db/schema.js';
import { sql } from 'drizzle-orm';

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
 * Phase 2+
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
