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
  await copyTemplateIfMissing(
    './playlists.config.json',
    path.join(configDir, 'playlists.config.json'),
    'playlists configuration'
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

  // Check for .env in config/ and log if found
  const configEnvPath = path.join(configDir, '.env');
  if (existsSync(configEnvPath)) {
    logger.info({ path: configEnvPath }, 'found .env in config directory');
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
