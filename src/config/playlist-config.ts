import { readFileSync } from 'node:fs';
import { logger } from '../logger.js';
import { getConfigFilePath } from '../init.js';

/**
 * Custom playlist configuration (user-defined genre/mood combinations)
 * These are managed via the web UI and stored in the database
 */
export interface CustomPlaylistConfig {
  id?: number; // Database ID
  name: string;
  genres: string[]; // 0-2 genres
  moods: string[]; // 0-2 moods
  enabled: boolean;
  cron?: string; // Optional custom schedule, defaults to weekly
  targetSize?: number; // Optional target playlist size
  description?: string;
}

/**
 * Auto-discovery settings for mood-based playlists
 */
export interface MoodDiscoveryConfig {
  enabled: boolean;
  minTracks: number; // Minimum tracks with mood to create playlist
  maxPlaylists: number; // Max number of mood playlists to generate
  schedule: string; // Cron schedule for regeneration
  considerStarRatings: boolean; // Weight by star ratings (4-5 stars)
  considerPlayCount: boolean; // Weight by play frequency
}

export interface PlaylistConfig {
  moodDiscovery: MoodDiscoveryConfig;
  customPlaylists: CustomPlaylistConfig[];
}

const DEFAULT_CONFIG: PlaylistConfig = {
  moodDiscovery: {
    enabled: true,
    minTracks: 20, // Need at least 20 tracks with a mood to create playlist
    maxPlaylists: 10, // Generate up to 10 mood playlists
    schedule: '0 6 * * 0', // Sunday 6am (weekly refresh)
    considerStarRatings: true,
    considerPlayCount: true
  },
  customPlaylists: []
};

let cachedConfig: PlaylistConfig | null = null;

export function loadPlaylistConfig(configPath?: string): PlaylistConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load from config/ directory, fallback to app root
  const path = configPath || getConfigFilePath('playlists.config.json');

  try {
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content) as PlaylistConfig;

    // Validate config structure
    if (!config.moodDiscovery) {
      logger.warn('Missing moodDiscovery section, using defaults');
      config.moodDiscovery = DEFAULT_CONFIG.moodDiscovery;
    }

    if (!Array.isArray(config.customPlaylists)) {
      logger.warn('customPlaylists must be an array, using empty array');
      config.customPlaylists = [];
    }

    logger.info(
      {
        customPlaylists: config.customPlaylists.filter(p => p.enabled).length,
        moodDiscoveryEnabled: config.moodDiscovery.enabled
      },
      'loaded playlist config'
    );

    cachedConfig = config;
    return config;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ path, error: errorMsg }, 'failed to load playlist config, using defaults');
    cachedConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }
}

export function reloadPlaylistConfig(): void {
  cachedConfig = null;
}

export function getMoodDiscoveryConfig(): MoodDiscoveryConfig {
  const config = loadPlaylistConfig();
  return config.moodDiscovery;
}

export function getCustomPlaylists(): CustomPlaylistConfig[] {
  const config = loadPlaylistConfig();
  return config.customPlaylists.filter(p => p.enabled);
}

export function getAllCustomPlaylists(): CustomPlaylistConfig[] {
  const config = loadPlaylistConfig();
  return config.customPlaylists;
}
