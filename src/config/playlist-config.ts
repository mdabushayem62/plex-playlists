import { readFileSync } from 'node:fs';
import { logger } from '../logger.js';
import { getConfigFilePath } from '../init.js';

export interface PinnedPlaylistConfig {
  name: string;
  genre: string;
  cron: string;
  enabled: boolean;
  description?: string;
}

export interface AutoDiscoverConfig {
  enabled: boolean;
  minArtists: number;
  maxPlaylists: number;
  exclude: string[];
  schedule: string;
  description?: string;
}

export interface PlaylistConfig {
  genrePlaylists: {
    pinned: PinnedPlaylistConfig[];
    autoDiscover: AutoDiscoverConfig;
  };
}

const DEFAULT_CONFIG: PlaylistConfig = {
  genrePlaylists: {
    pinned: [
      { name: 'synthwave', genre: 'synthwave', cron: '0 7 * * 1', enabled: true },
      { name: 'psytrance', genre: 'psytrance', cron: '0 8 * * 1', enabled: true },
      { name: 'dubstep', genre: 'dubstep', cron: '0 9 * * 1', enabled: true },
      { name: 'trance', genre: 'trance', cron: '0 10 * * 1', enabled: true },
      { name: 'power-metal', genre: 'power metal', cron: '0 11 * * 1', enabled: true }
    ],
    autoDiscover: {
      enabled: false,
      minArtists: 5,
      maxPlaylists: 20,
      exclude: ['electronic', 'edm', 'electronica'],
      schedule: '0 12 * * 1'
    }
  }
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
    if (!config.genrePlaylists) {
      throw new Error('Missing genrePlaylists section');
    }

    if (!Array.isArray(config.genrePlaylists.pinned)) {
      throw new Error('genrePlaylists.pinned must be an array');
    }

    if (!config.genrePlaylists.autoDiscover) {
      throw new Error('Missing genrePlaylists.autoDiscover section');
    }

    logger.info(
      {
        pinnedPlaylists: config.genrePlaylists.pinned.filter(p => p.enabled).length,
        autoDiscoverEnabled: config.genrePlaylists.autoDiscover.enabled
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

export function getEnabledGenrePlaylists(): PinnedPlaylistConfig[] {
  const config = loadPlaylistConfig();
  return config.genrePlaylists.pinned.filter(p => p.enabled);
}

export function getAutoDiscoverConfig(): AutoDiscoverConfig {
  const config = loadPlaylistConfig();
  return config.genrePlaylists.autoDiscover;
}
