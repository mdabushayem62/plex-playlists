import { and, count, eq, gte, lte } from 'drizzle-orm';
import { endOfDay, startOfDay, subDays } from 'date-fns';

import type { CandidateTrack } from '../playlist/candidate-builder.js';
import { APP_ENV } from '../config.js';
import { getDb } from './index.js';
import { customPlaylists, jobRuns, playlistTracks, playlists, trackCache } from './schema.js';

export interface PlaylistMetadataInput {
  window: string;
  title: string;
  description?: string;
  plexRatingKey: string;
  generatedAt: Date;
  tracks: Array<CandidateTrack & { position: number }>;
}

export const recordJobStart = async (window: string) => {
  const db = getDb();
  const [inserted] = await db
    .insert(jobRuns)
    .values({ window, startedAt: new Date(), status: 'running' })
    .returning({ id: jobRuns.id });
  return inserted?.id ?? null;
};

export const updateJobProgress = async (
  jobId: number,
  current: number,
  total: number,
  message?: string
) => {
  const db = getDb();
  await db
    .update(jobRuns)
    .set({
      progressCurrent: current,
      progressTotal: total,
      progressMessage: message
    })
    .where(eq(jobRuns.id, jobId));
};

export const recordJobCompletion = async (
  jobId: number,
  status: 'success' | 'failed',
  error?: string
) => {
  const db = getDb();
  await db
    .update(jobRuns)
    .set({ finishedAt: new Date(), status, error })
    .where(eq(jobRuns.id, jobId));
};

export const getPlaylistMetadata = async (window: string) => {
  const db = getDb();
  const [existing] = await db.select().from(playlists).where(eq(playlists.window, window));
  return existing ?? null;
};

export const savePlaylist = async ({
  window,
  title,
  description,
  plexRatingKey,
  generatedAt,
  tracks
}: PlaylistMetadataInput) => {
  const db = getDb();

  db.transaction(tx => {
    const existing = tx.select().from(playlists).where(eq(playlists.window, window)).get();

    let playlistId: number;
    if (existing) {
      tx
        .update(playlists)
        .set({
          title,
          description,
          plexRatingKey,
          generatedAt,
          trackCount: tracks.length
        })
        .where(eq(playlists.id, existing.id))
        .run();
      playlistId = existing.id;

      tx.delete(playlistTracks).where(eq(playlistTracks.playlistId, playlistId)).run();
    } else {
      const inserted = tx
        .insert(playlists)
        .values({
          window,
          title,
          description,
          plexRatingKey,
          generatedAt,
          trackCount: tracks.length
        })
        .returning({ id: playlists.id })
        .get();

      playlistId = inserted?.id ?? (() => {
        throw new Error('failed to insert playlist metadata');
      })();
    }

    if (tracks.length === 0) {
      return;
    }

    tx.insert(playlistTracks).values(
      tracks.map(track => ({
        playlistId,
        plexRatingKey: track.ratingKey,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genres: track.genres ? JSON.stringify(track.genres) : null, // Use enriched genres array
        position: track.position,
        score: track.finalScore,
        recencyWeight: track.recencyWeight,
        fallbackScore: track.fallbackScore,
        scoringMetadata: track.scoringComponents ? JSON.stringify(track.scoringComponents) : null // Full scoring breakdown for tooltips
      }))
    ).run();
  });
};

/**
 * Fetch rating keys of tracks that were recently recommended
 * Used for cross-playlist deduplication and time-based exclusions
 *
 * @param excludeWindow - Optional window name to exclude from results (e.g., don't exclude tracks from own window)
 * @param exclusionDays - Number of days to look back (default: EXCLUSION_DAYS config, 0 = today only)
 * @returns Set of rating keys to exclude from selection
 */
export const fetchExistingTrackRatingKeys = async (
  excludeWindow?: string,
  exclusionDays: number = APP_ENV.EXCLUSION_DAYS
): Promise<Set<string>> => {
  const db = getDb();

  const now = new Date();
  const dayEnd = endOfDay(now);
  const lookbackStart = exclusionDays > 0
    ? startOfDay(subDays(now, exclusionDays))
    : startOfDay(now); // 0 days = today only (backward compatible)

  const rows = await db
    .select({
      ratingKey: playlistTracks.plexRatingKey,
      window: playlists.window,
      generatedAt: playlists.generatedAt
    })
    .from(playlistTracks)
    .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
    .where(
      and(
        gte(playlists.generatedAt, lookbackStart),
        lte(playlists.generatedAt, dayEnd)
      )
    );

  const set = new Set<string>();
  for (const row of rows) {
    if (excludeWindow && row.window === excludeWindow) {
      continue;
    }
    if (row.ratingKey) {
      set.add(row.ratingKey);
    }
  }
  return set;
};

/**
 * Fetch recently-recommended tracks for a specific window
 * Useful for preventing repetition within the same playlist type
 *
 * @param window - Window name (e.g., 'morning', 'afternoon', 'evening')
 * @param exclusionDays - Number of days to look back (default: EXCLUSION_DAYS config)
 * @returns Set of rating keys recommended in this window recently
 */
export const fetchRecentlyRecommendedForWindow = async (
  window: string,
  exclusionDays: number = APP_ENV.EXCLUSION_DAYS
): Promise<Set<string>> => {
  const db = getDb();

  const now = new Date();
  const lookbackStart = startOfDay(subDays(now, exclusionDays));

  const rows = await db
    .select({
      ratingKey: playlistTracks.plexRatingKey
    })
    .from(playlistTracks)
    .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
    .where(
      and(
        eq(playlists.window, window),
        gte(playlists.generatedAt, lookbackStart)
      )
    );

  const set = new Set<string>();
  for (const row of rows) {
    if (row.ratingKey) {
      set.add(row.ratingKey);
    }
  }
  return set;
};

/**
 * Get the total number of tracks in the track cache
 * Used for library size calculations and cache statistics
 *
 * @returns Total count of tracks in the track_cache table
 */
export const getTotalTrackCount = async (): Promise<number> => {
  const db = getDb();
  const [result] = await db
    .select({ count: count() })
    .from(trackCache);
  return result?.count ?? 0;
};

/**
 * Check if user has an enabled discovery playlist configured
 * Used to conditionally display adaptive discovery features in the UI
 *
 * @returns True if at least one enabled discovery playlist exists, false otherwise
 */
export const hasEnabledDiscoveryPlaylist = async (): Promise<boolean> => {
  const db = getDb();

  const [result] = await db
    .select({ id: customPlaylists.id })
    .from(customPlaylists)
    .where(
      and(
        eq(customPlaylists.enabled, true),
        eq(customPlaylists.scoringStrategy, 'discovery')
      )
    )
    .limit(1);

  return result !== undefined;
};
