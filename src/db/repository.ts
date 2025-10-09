import { and, eq, gte, lte } from 'drizzle-orm';
import { endOfDay, startOfDay } from 'date-fns';

import type { CandidateTrack } from '../playlist/candidate-builder.js';
import { getDb } from './index.js';
import { jobRuns, playlistTracks, playlists } from './schema.js';

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
        position: track.position,
        score: track.finalScore
      }))
    ).run();
  });
};

export const fetchExistingTrackRatingKeys = async (
  excludeWindow?: string
): Promise<Set<string>> => {
  const db = getDb();

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

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
        gte(playlists.generatedAt, dayStart),
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
