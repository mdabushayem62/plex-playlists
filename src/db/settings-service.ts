/**
 * Settings service for managing web UI configuration overrides
 * These settings take precedence over environment variables
 * Settings are written to ./config/.env for persistence across restarts
 */

import { eq, desc } from 'drizzle-orm';
import { getDb } from './index.js';
import { settings, settingsHistory } from './schema.js';
import { logger } from '../logger.js';
import { APP_ENV } from '../config.js';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

export type SettingKey =
  // Plex
  | 'plex_base_url'
  | 'plex_auth_token'
  // API Keys
  | 'lastfm_api_key'
  | 'spotify_client_id'
  | 'spotify_client_secret'
  // Scoring Parameters
  | 'half_life_days'
  | 'max_genre_share'
  | 'play_count_saturation'
  | 'playlist_target_size'
  | 'max_per_artist'
  | 'history_days'
  | 'fallback_limit'
  // Scheduling
  | 'daily_playlists_cron'
  // Playlist Config (JSON)
  | 'playlists_config';

/**
 * Get a setting value from database
 * Returns null if not set (meaning use env var default)
 */
export async function getSetting(key: SettingKey): Promise<string | null> {
  const db = getDb();
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);

  return result.length > 0 ? result[0].value : null;
}

/**
 * Set a setting value in database
 * Pass null to remove override and fall back to env var
 */
export async function setSetting(key: SettingKey, value: string | null): Promise<void> {
  const db = getDb();

  if (value === null) {
    // Remove setting to fall back to env var
    await db.delete(settings).where(eq(settings.key, key));
    logger.info(`setting removed: ${key}`);
  } else {
    // Upsert setting
    await db
      .insert(settings)
      .values({
        key,
        value,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value,
          updatedAt: new Date()
        }
      });

    logger.info(`setting updated: ${key}`);
  }
}

/**
 * Get all settings as a key-value object
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const allSettings = await db.select().from(settings);

  return allSettings.reduce(
    (acc, setting) => {
      if (setting.value) {
        acc[setting.key] = setting.value;
      }
      return acc;
    },
    {} as Record<string, string>
  );
}

/**
 * Get effective configuration (DB overrides + env var fallbacks)
 */
export async function getEffectiveConfig() {
  const dbSettings = await getAllSettings();

  // Helper to parse number from DB or fall back to env
  const getNumber = (dbKey: string, envValue: number): number => {
    const dbValue = dbSettings[dbKey];
    return dbValue ? parseFloat(dbValue) : envValue;
  };

  return {
    // Plex
    plexBaseUrl: dbSettings.plex_base_url || APP_ENV.PLEX_BASE_URL,
    plexAuthToken: dbSettings.plex_auth_token || APP_ENV.PLEX_AUTH_TOKEN,

    // API Keys
    lastfmApiKey: dbSettings.lastfm_api_key || APP_ENV.LASTFM_API_KEY,
    spotifyClientId: dbSettings.spotify_client_id || APP_ENV.SPOTIFY_CLIENT_ID,
    spotifyClientSecret: dbSettings.spotify_client_secret || APP_ENV.SPOTIFY_CLIENT_SECRET,

    // Scoring Parameters
    halfLifeDays: getNumber('half_life_days', APP_ENV.HALF_LIFE_DAYS),
    maxGenreShare: getNumber('max_genre_share', APP_ENV.MAX_GENRE_SHARE),
    playCountSaturation: getNumber('play_count_saturation', APP_ENV.PLAY_COUNT_SATURATION),
    playlistTargetSize: getNumber('playlist_target_size', APP_ENV.PLAYLIST_TARGET_SIZE),
    maxPerArtist: getNumber('max_per_artist', APP_ENV.MAX_PER_ARTIST),
    historyDays: getNumber('history_days', APP_ENV.HISTORY_DAYS),
    fallbackLimit: getNumber('fallback_limit', APP_ENV.FALLBACK_LIMIT),

    // Scheduling
    dailyPlaylistsCron: dbSettings.daily_playlists_cron || APP_ENV.DAILY_PLAYLISTS_CRON,

    // Playlist Config
    playlistsConfig: dbSettings.playlists_config || null
  };
}

/**
 * Setting metadata with validation rules
 */
export interface SettingMetadata {
  key: SettingKey;
  value: string | number | boolean;
  source: 'database' | 'env' | 'default';
  type: 'text' | 'number' | 'url' | 'password' | 'json' | 'cron';
  category: 'plex' | 'api' | 'scoring' | 'scheduling' | 'playlists';
  description: string;
  defaultValue: string | number;
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
  };
  requiresRestart?: boolean;
}

/**
 * Settings that require app restart when changed
 */
export const RESTART_REQUIRED_SETTINGS: SettingKey[] = [
  'plex_base_url',
  'plex_auth_token'
];

/**
 * Get all settings with metadata for inline editing
 */
export async function getAllSettingsWithMetadata(): Promise<Record<string, SettingMetadata>> {
  const dbSettings = await getAllSettings();

  // Helper to determine source
  const getSource = (key: SettingKey): 'database' | 'env' | 'default' => {
    return dbSettings[key] ? 'database' : 'env';
  };

  const effectiveConfig = await getEffectiveConfig();

  return {
    // Plex
    plex_base_url: {
      key: 'plex_base_url',
      value: effectiveConfig.plexBaseUrl,
      source: getSource('plex_base_url'),
      type: 'url',
      category: 'plex',
      description: 'Plex server URL',
      defaultValue: 'http://localhost:32400',
      validation: {
        required: true,
        pattern: '^https?://.+'
      },
      requiresRestart: true
    },
    plex_auth_token: {
      key: 'plex_auth_token',
      value: effectiveConfig.plexAuthToken ? '***' + effectiveConfig.plexAuthToken.slice(-4) : '',
      source: getSource('plex_auth_token'),
      type: 'password',
      category: 'plex',
      description: 'Plex authentication token',
      defaultValue: '',
      validation: {
        required: true
      },
      requiresRestart: true
    },

    // API Keys
    lastfm_api_key: {
      key: 'lastfm_api_key',
      value: effectiveConfig.lastfmApiKey || '',
      source: getSource('lastfm_api_key'),
      type: 'password',
      category: 'api',
      description: 'Last.fm API key for genre metadata',
      defaultValue: ''
    },
    spotify_client_id: {
      key: 'spotify_client_id',
      value: effectiveConfig.spotifyClientId || '',
      source: getSource('spotify_client_id'),
      type: 'text',
      category: 'api',
      description: 'Spotify client ID for genre metadata',
      defaultValue: ''
    },
    spotify_client_secret: {
      key: 'spotify_client_secret',
      value: effectiveConfig.spotifyClientSecret || '',
      source: getSource('spotify_client_secret'),
      type: 'password',
      category: 'api',
      description: 'Spotify client secret',
      defaultValue: ''
    },

    // Scoring Parameters
    half_life_days: {
      key: 'half_life_days',
      value: effectiveConfig.halfLifeDays,
      source: getSource('half_life_days'),
      type: 'number',
      category: 'scoring',
      description: 'Number of days for recency weight to decay by 50%',
      defaultValue: 7,
      validation: {
        min: 1,
        max: 90
      }
    },
    max_genre_share: {
      key: 'max_genre_share',
      value: effectiveConfig.maxGenreShare,
      source: getSource('max_genre_share'),
      type: 'number',
      category: 'scoring',
      description: 'Maximum percentage of playlist from a single genre (0.0-1.0)',
      defaultValue: 0.4,
      validation: {
        min: 0.1,
        max: 1.0
      }
    },
    play_count_saturation: {
      key: 'play_count_saturation',
      value: effectiveConfig.playCountSaturation,
      source: getSource('play_count_saturation'),
      type: 'number',
      category: 'scoring',
      description: 'Play count threshold for normalization',
      defaultValue: 25,
      validation: {
        min: 1,
        max: 1000
      }
    },
    playlist_target_size: {
      key: 'playlist_target_size',
      value: effectiveConfig.playlistTargetSize,
      source: getSource('playlist_target_size'),
      type: 'number',
      category: 'scoring',
      description: 'Target number of tracks per playlist',
      defaultValue: 50,
      validation: {
        min: 10,
        max: 500
      }
    },
    max_per_artist: {
      key: 'max_per_artist',
      value: effectiveConfig.maxPerArtist,
      source: getSource('max_per_artist'),
      type: 'number',
      category: 'scoring',
      description: 'Maximum tracks per artist in a playlist',
      defaultValue: 2,
      validation: {
        min: 1,
        max: 20
      }
    },
    history_days: {
      key: 'history_days',
      value: effectiveConfig.historyDays,
      source: getSource('history_days'),
      type: 'number',
      category: 'scoring',
      description: 'Number of days of listening history to analyze',
      defaultValue: 30,
      validation: {
        min: 1,
        max: 365
      }
    },
    fallback_limit: {
      key: 'fallback_limit',
      value: effectiveConfig.fallbackLimit,
      source: getSource('fallback_limit'),
      type: 'number',
      category: 'scoring',
      description: 'Maximum tracks to fetch for fallback candidates',
      defaultValue: 200,
      validation: {
        min: 50,
        max: 1000
      }
    },

    // Scheduling
    daily_playlists_cron: {
      key: 'daily_playlists_cron',
      value: effectiveConfig.dailyPlaylistsCron,
      source: getSource('daily_playlists_cron'),
      type: 'cron',
      category: 'scheduling',
      description: 'Daily playlists generation schedule (runs all three sequentially)',
      defaultValue: '0 5 * * *'
    }
  };
}

/**
 * Validate setting value
 */
export function validateSetting(key: SettingKey, value: string): { valid: boolean; error?: string } {
  // Number validators
  const numberValidators: Partial<Record<SettingKey, (v: number) => boolean>> = {
    half_life_days: v => !isNaN(v) && v >= 1 && v <= 90,
    max_genre_share: v => !isNaN(v) && v >= 0.1 && v <= 1.0,
    play_count_saturation: v => !isNaN(v) && v >= 1 && v <= 1000,
    playlist_target_size: v => !isNaN(v) && v >= 10 && v <= 500,
    max_per_artist: v => !isNaN(v) && v >= 1 && v <= 20,
    history_days: v => !isNaN(v) && v >= 1 && v <= 365,
    fallback_limit: v => !isNaN(v) && v >= 50 && v <= 1000
  };

  // URL validator
  const urlValidator = (v: string) => /^https?:\/\/.+/.test(v);

  // Cron validator (basic)
  const cronValidator = (v: string) => {
    const parts = v.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  };

  // Apply appropriate validator
  if (numberValidators[key]) {
    const num = parseFloat(value);
    if (!numberValidators[key]!(num)) {
      return { valid: false, error: `Invalid value for ${key}` };
    }
  } else if (key === 'plex_base_url') {
    if (!urlValidator(value)) {
      return { valid: false, error: 'Invalid URL format (must start with http:// or https://)' };
    }
  } else if (key.includes('_cron')) {
    if (!cronValidator(value)) {
      return { valid: false, error: 'Invalid cron expression (must have 5 or 6 parts)' };
    }
  }

  return { valid: true };
}

/**
 * Get settings change history
 */
export async function getSettingsHistory(limit = 50) {
  const db = getDb();
  return await db
    .select()
    .from(settingsHistory)
    .orderBy(desc(settingsHistory.changedAt))
    .limit(limit);
}

/**
 * Record a setting change in history
 */
export async function recordSettingChange(
  key: SettingKey,
  oldValue: string | null,
  newValue: string,
  changedBy = 'web_ui'
) {
  const db = getDb();
  await db.insert(settingsHistory).values({
    settingKey: key,
    oldValue: oldValue || null,
    newValue,
    changedBy,
    changedAt: new Date()
  });
}

/**
 * Convert SettingKey to environment variable name
 */
function settingKeyToEnvVar(key: SettingKey): string {
  return key.toUpperCase();
}

/**
 * Write setting to ./config/.env file for persistence
 * This ensures settings survive container restarts
 */
export async function writeSettingToEnvFile(key: SettingKey, value: string | null): Promise<void> {
  const { APP_ENV } = await import('../config.js');
  const configDir = APP_ENV.CONFIG_DIR;
  const envPath = path.join(configDir, '.env');

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Read existing .env file or create empty content
  let envContent = '';
  if (existsSync(envPath)) {
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (error) {
      logger.warn({ error, path: envPath }, 'failed to read .env file, creating new');
      envContent = '';
    }
  }

  const envKey = settingKeyToEnvVar(key);

  if (value === null) {
    // Remove the line for this setting
    const lines = envContent.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith(envKey + '=') && !trimmed.startsWith(`# ${envKey}=`);
    });
    envContent = filteredLines.join('\n');
    logger.info({ key, envKey, path: envPath }, 'removed setting from .env file');
  } else {
    // Update or append the setting
    const regex = new RegExp(`^${envKey}=.*$`, 'm');
    const newLine = `${envKey}=${value}`;

    if (regex.test(envContent)) {
      // Replace existing line
      envContent = envContent.replace(regex, newLine);
      logger.info({ key, envKey, path: envPath }, 'updated setting in .env file');
    } else {
      // Append new line
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `${newLine}\n`;
      logger.info({ key, envKey, path: envPath }, 'added setting to .env file');
    }
  }

  // Write back to file
  try {
    await fs.writeFile(envPath, envContent, 'utf-8');
  } catch (error) {
    logger.error({ error, path: envPath }, 'failed to write .env file');
    throw new Error(`Failed to persist setting to .env file: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * Set a setting with automatic writeback to .env file
 * This is the recommended function to use from the web UI
 */
export async function setSettingWithWriteback(
  key: SettingKey,
  value: string | null,
  writeback = true
): Promise<void> {
  // Always update database first
  await setSetting(key, value);

  // Then write to .env file if enabled
  if (writeback) {
    try {
      await writeSettingToEnvFile(key, value);
    } catch (error) {
      logger.error({ error, key }, 'writeback to .env file failed, but DB updated');
      // Don't throw - DB update succeeded, writeback is best-effort
    }
  }
}
