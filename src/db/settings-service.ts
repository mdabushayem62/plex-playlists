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
  | 'exploration_rate'
  | 'exclusion_days'
  | 'discovery_days'
  // Throwback Configuration
  | 'throwback_lookback_start'
  | 'throwback_lookback_end'
  | 'throwback_recent_exclusion'
  // Genre Configuration
  | 'genre_ignore_list'
  // Scheduling
  | 'daily_playlists_cron'
  | 'discovery_cron'
  | 'throwback_cron'
  | 'custom_playlists_cron'
  | 'cache_warm_cron'
  | 'cache_refresh_cron'
  // Adaptive Queue
  | 'adaptive_queue_enabled'
  | 'adaptive_sensitivity'
  | 'adaptive_min_skip_count'
  | 'adaptive_window_minutes'
  | 'adaptive_cooldown_seconds';

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

  // Helper to parse JSON array
  const getJsonArray = (dbKey: string, defaultValue: string[]): string[] => {
    const dbValue = dbSettings[dbKey];
    if (!dbValue) return defaultValue;
    try {
      const parsed = JSON.parse(dbValue);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
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
    explorationRate: getNumber('exploration_rate', APP_ENV.EXPLORATION_RATE),
    exclusionDays: getNumber('exclusion_days', APP_ENV.EXCLUSION_DAYS),
    discoveryDays: getNumber('discovery_days', APP_ENV.DISCOVERY_DAYS),

    // Throwback Configuration
    throwbackLookbackStart: getNumber('throwback_lookback_start', APP_ENV.THROWBACK_LOOKBACK_START),
    throwbackLookbackEnd: getNumber('throwback_lookback_end', APP_ENV.THROWBACK_LOOKBACK_END),
    throwbackRecentExclusion: getNumber('throwback_recent_exclusion', APP_ENV.THROWBACK_RECENT_EXCLUSION),

    // Genre Configuration
    genreIgnoreList: getJsonArray('genre_ignore_list', []),

    // Scheduling
    dailyPlaylistsCron: dbSettings.daily_playlists_cron || APP_ENV.DAILY_PLAYLISTS_CRON,
    discoveryCron: dbSettings.discovery_cron || APP_ENV.DISCOVERY_CRON,
    throwbackCron: dbSettings.throwback_cron || APP_ENV.THROWBACK_CRON,
    customPlaylistsCron: dbSettings.custom_playlists_cron || APP_ENV.CUSTOM_PLAYLISTS_CRON,
    cacheWarmCron: dbSettings.cache_warm_cron || APP_ENV.CACHE_WARM_CRON,
    cacheRefreshCron: dbSettings.cache_refresh_cron || APP_ENV.CACHE_REFRESH_CRON,

    // Adaptive Queue
    adaptiveQueueEnabled: dbSettings.adaptive_queue_enabled === 'true' || APP_ENV.ADAPTIVE_QUEUE_ENABLED,
    adaptiveSensitivity: getNumber('adaptive_sensitivity', APP_ENV.ADAPTIVE_SENSITIVITY),
    adaptiveMinSkipCount: getNumber('adaptive_min_skip_count', APP_ENV.ADAPTIVE_MIN_SKIP_COUNT),
    adaptiveWindowMinutes: getNumber('adaptive_window_minutes', APP_ENV.ADAPTIVE_WINDOW_MINUTES),
    adaptiveCooldownSeconds: getNumber('adaptive_cooldown_seconds', APP_ENV.ADAPTIVE_COOLDOWN_SECONDS)
  };
}

/**
 * Setting metadata with validation rules
 */
export interface SettingMetadata {
  key: SettingKey;
  value: string | number | boolean | string[];
  source: 'database' | 'env' | 'default';
  type: 'text' | 'number' | 'url' | 'password' | 'json' | 'cron' | 'boolean';
  category: 'plex' | 'api' | 'scoring' | 'scheduling' | 'playlists' | 'adaptive';
  description: string;
  defaultValue: string | number | string[];
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
    exploration_rate: {
      key: 'exploration_rate',
      value: effectiveConfig.explorationRate,
      source: getSource('exploration_rate'),
      type: 'number',
      category: 'scoring',
      description: 'Exploration rate for discovery (0.0-1.0, default: 0.15 = 15%)',
      defaultValue: 0.15,
      validation: {
        min: 0.0,
        max: 1.0
      }
    },
    exclusion_days: {
      key: 'exclusion_days',
      value: effectiveConfig.exclusionDays,
      source: getSource('exclusion_days'),
      type: 'number',
      category: 'scoring',
      description: 'Days to exclude recently-recommended tracks from new playlists',
      defaultValue: 7,
      validation: {
        min: 1,
        max: 90
      }
    },
    discovery_days: {
      key: 'discovery_days',
      value: effectiveConfig.discoveryDays,
      source: getSource('discovery_days'),
      type: 'number',
      category: 'scoring',
      description: 'Minimum days since last play for discovery playlist',
      defaultValue: 90,
      validation: {
        min: 1,
        max: 365
      }
    },

    // Throwback Configuration
    throwback_lookback_start: {
      key: 'throwback_lookback_start',
      value: effectiveConfig.throwbackLookbackStart,
      source: getSource('throwback_lookback_start'),
      type: 'number',
      category: 'playlists',
      description: 'Start of throwback lookback window in days (e.g., 365 = 1 year ago)',
      defaultValue: 730,
      validation: {
        min: 365,
        max: 3650
      }
    },
    throwback_lookback_end: {
      key: 'throwback_lookback_end',
      value: effectiveConfig.throwbackLookbackEnd,
      source: getSource('throwback_lookback_end'),
      type: 'number',
      category: 'playlists',
      description: 'End of throwback lookback window in days (e.g., 1825 = 5 years ago)',
      defaultValue: 1825,
      validation: {
        min: 730,
        max: 5475
      }
    },
    throwback_recent_exclusion: {
      key: 'throwback_recent_exclusion',
      value: effectiveConfig.throwbackRecentExclusion,
      source: getSource('throwback_recent_exclusion'),
      type: 'number',
      category: 'playlists',
      description: 'Exclude tracks played within last N days from throwback',
      defaultValue: 90,
      validation: {
        min: 30,
        max: 365
      }
    },

    // Genre Configuration
    genre_ignore_list: {
      key: 'genre_ignore_list',
      value: effectiveConfig.genreIgnoreList,
      source: getSource('genre_ignore_list'),
      type: 'json',
      category: 'playlists',
      description: 'Genres to filter out during playlist generation (meta-genres like "electronic", "pop/rock")',
      defaultValue: []
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
    },
    discovery_cron: {
      key: 'discovery_cron',
      value: effectiveConfig.discoveryCron,
      source: getSource('discovery_cron'),
      type: 'cron',
      category: 'scheduling',
      description: 'Discovery playlist schedule (weekly rediscovery of forgotten gems)',
      defaultValue: '0 6 * * 1'
    },
    throwback_cron: {
      key: 'throwback_cron',
      value: effectiveConfig.throwbackCron,
      source: getSource('throwback_cron'),
      type: 'cron',
      category: 'scheduling',
      description: 'Throwback playlist schedule (nostalgic tracks from 2-5 years ago)',
      defaultValue: '0 6 * * 6'
    },
    custom_playlists_cron: {
      key: 'custom_playlists_cron',
      value: effectiveConfig.customPlaylistsCron,
      source: getSource('custom_playlists_cron'),
      type: 'cron',
      category: 'scheduling',
      description: 'Custom playlists generation schedule (runs all enabled custom playlists)',
      defaultValue: '0 6 * * 0'
    },
    cache_warm_cron: {
      key: 'cache_warm_cron',
      value: effectiveConfig.cacheWarmCron,
      source: getSource('cache_warm_cron'),
      type: 'cron',
      category: 'scheduling',
      description: 'Weekly full cache warming schedule (fetches genre data for uncached artists)',
      defaultValue: '0 3 * * 0'
    },
    cache_refresh_cron: {
      key: 'cache_refresh_cron',
      value: effectiveConfig.cacheRefreshCron,
      source: getSource('cache_refresh_cron'),
      type: 'cron',
      category: 'scheduling',
      description: 'Cache refresh schedule (refreshes expiring cache entries)',
      defaultValue: '0 * * * *'
    },

    // Adaptive Queue
    adaptive_queue_enabled: {
      key: 'adaptive_queue_enabled',
      value: effectiveConfig.adaptiveQueueEnabled ? 'true' : 'false',
      source: getSource('adaptive_queue_enabled'),
      type: 'boolean',
      category: 'adaptive',
      description: 'Enable real-time PlayQueue adaptation based on skip patterns (Beta)',
      defaultValue: 'false'
    },
    adaptive_sensitivity: {
      key: 'adaptive_sensitivity',
      value: effectiveConfig.adaptiveSensitivity,
      source: getSource('adaptive_sensitivity'),
      type: 'number',
      category: 'adaptive',
      description: 'Sensitivity level (1-10, higher = more aggressive adaptations)',
      defaultValue: 5,
      validation: {
        min: 1,
        max: 10
      }
    },
    adaptive_min_skip_count: {
      key: 'adaptive_min_skip_count',
      value: effectiveConfig.adaptiveMinSkipCount,
      source: getSource('adaptive_min_skip_count'),
      type: 'number',
      category: 'adaptive',
      description: 'Minimum skips to trigger pattern detection',
      defaultValue: 2,
      validation: {
        min: 1,
        max: 5
      }
    },
    adaptive_window_minutes: {
      key: 'adaptive_window_minutes',
      value: effectiveConfig.adaptiveWindowMinutes,
      source: getSource('adaptive_window_minutes'),
      type: 'number',
      category: 'adaptive',
      description: 'Time window for pattern detection (minutes)',
      defaultValue: 5,
      validation: {
        min: 1,
        max: 15
      }
    },
    adaptive_cooldown_seconds: {
      key: 'adaptive_cooldown_seconds',
      value: effectiveConfig.adaptiveCooldownSeconds,
      source: getSource('adaptive_cooldown_seconds'),
      type: 'number',
      category: 'adaptive',
      description: 'Cooldown between adaptations (seconds)',
      defaultValue: 10,
      validation: {
        min: 5,
        max: 60
      }
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
    fallback_limit: v => !isNaN(v) && v >= 50 && v <= 1000,
    exploration_rate: v => !isNaN(v) && v >= 0.0 && v <= 1.0,
    exclusion_days: v => !isNaN(v) && v >= 1 && v <= 90,
    discovery_days: v => !isNaN(v) && v >= 1 && v <= 365,
    // Throwback Configuration
    throwback_lookback_start: v => !isNaN(v) && v >= 365 && v <= 3650,
    throwback_lookback_end: v => !isNaN(v) && v >= 730 && v <= 5475,
    throwback_recent_exclusion: v => !isNaN(v) && v >= 30 && v <= 365,
    // Adaptive Queue
    adaptive_sensitivity: v => !isNaN(v) && v >= 1 && v <= 10,
    adaptive_min_skip_count: v => !isNaN(v) && v >= 1 && v <= 5,
    adaptive_window_minutes: v => !isNaN(v) && v >= 1 && v <= 15,
    adaptive_cooldown_seconds: v => !isNaN(v) && v >= 5 && v <= 60
  };

  // URL validator
  const urlValidator = (v: string) => /^https?:\/\/.+/.test(v);

  // Cron validator (basic)
  const cronValidator = (v: string) => {
    const parts = v.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  };

  // Boolean validator
  const booleanValidator = (v: string) => v === 'true' || v === 'false';

  // Apply appropriate validator
  if (key === 'adaptive_queue_enabled') {
    if (!booleanValidator(value)) {
      return { valid: false, error: 'Invalid boolean value (must be "true" or "false")' };
    }
  } else if (numberValidators[key]) {
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
