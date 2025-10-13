/**
 * AudioMuse PostgreSQL client for fetching audio features
 */

import postgres from 'postgres';
import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';

export interface AudioMuseTrack {
  itemId: string;
  title: string;
  author: string;
  tempo: number | null;
  key: string | null;
  scale: string | null;
  energy: number | null;
  moodVector: Map<string, number>; // mood -> confidence (0-1)
  features: Map<string, number>; // feature -> value (0-1)
}

let sqlClient: ReturnType<typeof postgres> | null = null;

export function getAudioMuseClient() {
  if (!sqlClient) {
    sqlClient = postgres({
      host: APP_ENV.AUDIOMUSE_DB_HOST,
      port: APP_ENV.AUDIOMUSE_DB_PORT,
      database: APP_ENV.AUDIOMUSE_DB_NAME,
      username: APP_ENV.AUDIOMUSE_DB_USER,
      password: APP_ENV.AUDIOMUSE_DB_PASSWORD,
      max: 10 // Connection pool size
    });

    logger.info({
      host: APP_ENV.AUDIOMUSE_DB_HOST,
      port: APP_ENV.AUDIOMUSE_DB_PORT,
      database: APP_ENV.AUDIOMUSE_DB_NAME
    }, 'audiomuse client initialized');
  }

  return sqlClient;
}

/**
 * Parse mood_vector string into Map
 * Example: "ambient:0.562,electronic:0.552,experimental:0.538"
 */
function parseMoodVector(moodVectorStr: string | null): Map<string, number> {
  const map = new Map<string, number>();

  if (!moodVectorStr) return map;

  moodVectorStr.split(',').forEach((pair) => {
    const [mood, confidenceStr] = pair.split(':');
    if (mood && confidenceStr) {
      map.set(mood.trim(), parseFloat(confidenceStr));
    }
  });

  return map;
}

/**
 * Parse other_features string into Map
 * Example: "danceable:0.44,aggressive:0.11,happy:0.11"
 */
function parseFeatures(featuresStr: string | null): Map<string, number> {
  const map = new Map<string, number>();

  if (!featuresStr) return map;

  featuresStr.split(',').forEach((pair) => {
    const [feature, valueStr] = pair.split(':');
    if (feature && valueStr) {
      map.set(feature.trim(), parseFloat(valueStr));
    }
  });

  return map;
}

/**
 * Convert database row to AudioMuseTrack
 */
function rowToTrack(row: Record<string, unknown>): AudioMuseTrack {
  return {
    itemId: row.item_id as string,
    title: row.title as string,
    author: row.author as string,
    tempo: row.tempo as number | null,
    key: row.key as string | null,
    scale: row.scale as string | null,
    energy: row.energy as number | null,
    moodVector: parseMoodVector(row.mood_vector as string | null),
    features: parseFeatures(row.other_features as string | null)
  };
}

/**
 * Get audio features for a single track by item_id
 */
export async function getAudioFeatures(itemId: string): Promise<AudioMuseTrack | null> {
  const sql = getAudioMuseClient();

  const results = await sql`
    SELECT * FROM score WHERE item_id = ${itemId}
  `;

  if (results.length === 0) return null;

  return rowToTrack(results[0]);
}

/**
 * Get all audio features from AudioMuse database
 */
export async function getAllAudioFeatures(): Promise<AudioMuseTrack[]> {
  const sql = getAudioMuseClient();

  const results = await sql`
    SELECT * FROM score
    ORDER BY author, title
  `;

  return results.map(rowToTrack);
}

/**
 * Get count of tracks in AudioMuse
 */
export async function getAudioMuseTrackCount(): Promise<number> {
  const sql = getAudioMuseClient();

  const results = await sql`
    SELECT COUNT(*) as count FROM score
  `;

  return Number(results[0].count);
}

/**
 * Get audio features statistics
 */
export async function getAudioMuseStats() {
  const sql = getAudioMuseClient();

  const stats = await sql`
    SELECT
      COUNT(*) as total_tracks,
      COUNT(DISTINCT author) as total_artists,
      MIN(tempo) as min_tempo,
      MAX(tempo) as max_tempo,
      AVG(tempo) as avg_tempo,
      MIN(energy) as min_energy,
      MAX(energy) as max_energy,
      AVG(energy) as avg_energy
    FROM score
  `;

  return {
    totalTracks: Number(stats[0].total_tracks),
    totalArtists: Number(stats[0].total_artists),
    tempo: {
      min: stats[0].min_tempo,
      max: stats[0].max_tempo,
      avg: stats[0].avg_tempo
    },
    energy: {
      min: stats[0].min_energy,
      max: stats[0].max_energy,
      avg: stats[0].avg_energy
    }
  };
}

/**
 * Close AudioMuse connection
 */
export async function closeAudioMuseClient() {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    logger.info('audiomuse client closed');
  }
}
