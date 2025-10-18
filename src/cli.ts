#!/usr/bin/env node
/**
 * Minimal CLI for Plex Playlist Enhancer
 * Primary interface is the web UI at http://localhost:8687
 */

import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { createApp } from './index.js';
import { logger } from './logger.js';
import { runDiagnostic } from './diagnostic.js';

// Load config from /config/.env if it exists (Docker setup)
const configEnvPath = join(process.env.CONFIG_DIR || './config', '.env');
if (existsSync(configEnvPath)) {
  dotenvConfig({ path: configEnvPath, override: true });
  logger.debug({ path: configEnvPath }, 'loaded config from /config/.env');
}

const usage = `Plex Playlist Enhancer - Intelligent playlist generation for Plex

Usage:
  plex-playlists [server]      Start web server (default)
  plex-playlists diagnostic    Run diagnostic checks
  plex-playlists --help        Show this help

Web UI:
  Access the web interface at http://localhost:8687
  All playlist generation, cache management, and configuration
  is available through the web UI.

For more information:
  https://github.com/aceofaces/plex-playlists#readme`;

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  // Handle help flags first (before creating app)
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
    return;
  }

  // Handle diagnostic command
  if (command === 'diagnostic') {
    const window = args[1];
    if (!window) {
      console.error('Error: Window parameter required');
      console.error('Usage: plex-playlists diagnostic <window>');
      console.error('Example: plex-playlists diagnostic morning');
      process.exit(1);
    }
    await runDiagnostic(window);
    return;
  }

  // Default to server (with or without explicit 'server' command)
  if (!command || command === 'server' || command === 'start') {
    // Graceful shutdown handler
    const shutdown = (signal: string) => {
      logger.info({ signal }, 'received shutdown signal');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    const app = createApp();
    await app.start();
    logger.info('web server running at http://localhost:8687');
    logger.info('press Ctrl+C to exit');
    // keep process alive
    process.stdin.resume();
    return;
  }

  // Unknown command
  console.error(`Error: Unknown command '${command}'`);
  console.log('\n' + usage);
  process.exit(1);
}

main().catch(error => {
  logger.error({ err: error }, 'CLI execution failed');
  process.exit(1);
});
