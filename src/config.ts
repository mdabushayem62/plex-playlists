import { cleanEnv, num, str } from 'envalid';

export const APP_ENV = cleanEnv(process.env, {
  PLEX_BASE_URL: str({ desc: 'Base URL of the Plex server, e.g. http://localhost:32400' }),
  PLEX_AUTH_TOKEN: str({ desc: 'Plex X-Plex-Token for authenticated API access' }),
  DATABASE_PATH: str({ default: './data/plex-playlists.db' }),
  // Metadata enrichment (optional - for genre data)
  LASTFM_API_KEY: str({ default: '', desc: 'Last.fm API key (optional, for genre enrichment)' }),
  SPOTIFY_CLIENT_ID: str({ default: '', desc: 'Spotify client ID (optional, for genre enrichment)' }),
  SPOTIFY_CLIENT_SECRET: str({ default: '', desc: 'Spotify client secret (optional, for genre enrichment)' }),
  // Daily time-based playlists
  MORNING_CRON: str({ default: '0 6 * * *' }),
  AFTERNOON_CRON: str({ default: '0 12 * * *' }),
  EVENING_CRON: str({ default: '0 18 * * *' }),
  // NOTE: Genre playlists are now configured in playlists.config.json
  // Scoring parameters
  HALF_LIFE_DAYS: num({ default: 7 }),
  MAX_GENRE_SHARE: num({ default: 0.4 }),
  PLAY_COUNT_SATURATION: num({ default: 25 }),
  PLAYLIST_TARGET_SIZE: num({ default: 50 }),
  MAX_PER_ARTIST: num({ default: 2 }),
  HISTORY_DAYS: num({ default: 30 }),
  FALLBACK_LIMIT: num({ default: 200 })
});

export type AppEnv = typeof APP_ENV;
