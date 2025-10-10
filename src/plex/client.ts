import { PlexServer } from '@ctrl/plex';

import { logger } from '../logger.js';
import { getEffectiveConfig } from '../db/settings-service.js';
import { APP_ENV } from '../config.js';

let plexServer: PlexServer | null = null;

export const getPlexServer = async (): Promise<PlexServer> => {
  if (plexServer) {
    return plexServer;
  }

  // Use database settings (with env var fallback)
  const config = await getEffectiveConfig();

  if (!config.plexBaseUrl || !config.plexAuthToken) {
    throw new Error('Plex credentials not configured. Please configure via web UI at /setup');
  }

  const server = new PlexServer(config.plexBaseUrl, config.plexAuthToken, APP_ENV.PLEX_TIMEOUT);
  await server.connect();
  logger.debug({ baseUrl: config.plexBaseUrl, timeout: APP_ENV.PLEX_TIMEOUT }, 'connected to plex server');
  plexServer = server;
  return plexServer;
};

export const resetPlexServer = (): void => {
  plexServer = null;
};
