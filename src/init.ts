import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Initialize config and data directories with template files
 * Copies default config files to ./config/ if they don't exist
 */
export async function initializeDirectories(): Promise<void> {
  const { APP_ENV } = await import('./config.js');
  const configDir = APP_ENV.CONFIG_DIR;
  const dataDir = APP_ENV.DATA_DIR;
  const importedPlaylistsDir = path.join(dataDir, 'imported_playlists');

  // Ensure directories exist
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(importedPlaylistsDir, { recursive: true });

  logger.debug({ configDir, dataDir }, 'ensuring directories exist');

  // Copy playlists.config.json if it doesn't exist in config/
  await copyTemplateOrCreateDefault(
    './playlists.config.json',
    path.join(configDir, 'playlists.config.json'),
    'playlists configuration',
    getDefaultPlaylistConfig()
  );

  // Copy genre-mapping.json if user created one and it doesn't exist in config/
  const genreMappingSource = './genre-mapping.json';
  if (existsSync(genreMappingSource)) {
    await copyTemplateIfMissing(
      genreMappingSource,
      path.join(configDir, 'genre-mapping.json'),
      'genre mapping'
    );
  }

  // Create .env in config/ if it doesn't exist
  const configEnvPath = path.join(configDir, '.env');
  if (!existsSync(configEnvPath)) {
    try {
      await fs.writeFile(configEnvPath, getDefaultEnvContent(), 'utf-8');
      logger.info({ path: configEnvPath }, 'created default .env in config directory');
    } catch (error) {
      logger.warn({ path: configEnvPath, error }, 'failed to create .env file');
    }
  } else {
    logger.debug({ path: configEnvPath }, 'found .env in config directory');
  }
}

async function copyTemplateIfMissing(
  sourcePath: string,
  destPath: string,
  description: string
): Promise<void> {
  if (!existsSync(destPath)) {
    try {
      await fs.copyFile(sourcePath, destPath);
      logger.info({ source: sourcePath, dest: destPath }, `copied ${description} template`);
    } catch (error) {
      logger.warn(
        { source: sourcePath, dest: destPath, error },
        `failed to copy ${description} template`
      );
    }
  } else {
    logger.debug({ path: destPath }, `${description} already exists`);
  }
}

async function copyTemplateOrCreateDefault(
  sourcePath: string,
  destPath: string,
  description: string,
  defaultContent: string
): Promise<void> {
  if (!existsSync(destPath)) {
    // Try to copy from source first
    if (existsSync(sourcePath)) {
      try {
        await fs.copyFile(sourcePath, destPath);
        logger.info({ source: sourcePath, dest: destPath }, `copied ${description} template`);
        return;
      } catch (error) {
        logger.warn(
          { source: sourcePath, dest: destPath, error },
          `failed to copy ${description} template, creating default`
        );
      }
    }

    // If source doesn't exist or copy failed, create default
    try {
      await fs.writeFile(destPath, defaultContent, 'utf-8');
      logger.info({ dest: destPath }, `created default ${description}`);
    } catch (error) {
      logger.error(
        { dest: destPath, error },
        `failed to create default ${description}`
      );
    }
  } else {
    logger.debug({ path: destPath }, `${description} already exists`);
  }
}

function getDefaultPlaylistConfig(): string {
  return JSON.stringify({
    "$schema": "./playlists.config.schema.json",
    "genrePlaylists": {
      "pinned": [],
      "autoDiscover": {
        "enabled": false,
        "minArtists": 5,
        "maxPlaylists": 20,
        "exclude": [],
        "schedule": "0 15 * * 1",
        "description": "Auto-discovered genre playlists based on library analysis"
      }
    }
  }, null, 2);
}

function getDefaultEnvContent(): string {
  return `# Plex-Playlists Configuration
# This file is auto-generated. Add your environment variables below.
# See https://github.com/aceofaces/plex-playlists for full documentation.

# Required: Plex Server Configuration
# PLEX_BASE_URL=http://localhost:32400
# PLEX_AUTH_TOKEN=your-plex-token-here

# Optional: API Keys for Genre Enrichment
# LASTFM_API_KEY=your-lastfm-api-key
# SPOTIFY_CLIENT_ID=your-spotify-client-id
# SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Optional: Database Path (default: ./data/plex-playlists.db)
# DATABASE_PATH=./data/plex-playlists.db

# Optional: Web UI Configuration
# WEB_UI_ENABLED=true
# WEB_UI_PORT=8687
`;
}

/**
 * Load config file from config directory, fall back to app root
 * Note: Uses lazy import to avoid circular dependency with config.ts
 */
export function getConfigFilePath(filename: string): string {
  // Lazy load to avoid circular dependency
  let configDir = './config'; // Default
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { APP_ENV } = require('./config.js');
    configDir = APP_ENV.CONFIG_DIR;
  } catch {
    // Fall back to default if config not loaded yet
  }

  const configPath = path.join(configDir, filename);
  const rootPath = `./${filename}`;

  if (existsSync(configPath)) {
    logger.debug({ path: configPath }, `using config file from config directory`);
    return configPath;
  }

  if (existsSync(rootPath)) {
    logger.debug({ path: rootPath }, `using config file from app root`);
    return rootPath;
  }

  // Return config path even if it doesn't exist (will fail later with better error)
  logger.warn({ filename }, `config file not found in config/ or app root`);
  return configPath;
}
