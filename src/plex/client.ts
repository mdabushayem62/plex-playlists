import { PlexServer } from '@ctrl/plex';

import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';

let plexServer: PlexServer | null = null;

export const getPlexServer = async (): Promise<PlexServer> => {
  if (plexServer) {
    return plexServer;
  }

  const server = new PlexServer(APP_ENV.PLEX_BASE_URL, APP_ENV.PLEX_AUTH_TOKEN);
  await server.connect();
  logger.debug({ baseUrl: APP_ENV.PLEX_BASE_URL }, 'connected to plex server');
  plexServer = server;
  return plexServer;
};

export const resetPlexServer = (): void => {
  plexServer = null;
};
