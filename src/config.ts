import { cleanEnv, num, str, bool } from 'envalid';

export const APP_ENV = cleanEnv(process.env, {
  PLEX_BASE_URL: str({ default: '', desc: 'Base URL of the Plex server, e.g. http://localhost:32400 (configure via web UI)' }),
  PLEX_AUTH_TOKEN: str({ default: '', desc: 'Plex X-Plex-Token for authenticated API access (configure via web UI)' }),
  PLEX_TIMEOUT: num({ default: 120000, desc: 'Plex API request timeout in milliseconds (default: 120000 = 2 minutes)' }),
  // Directories
  CONFIG_DIR: str({ default: './config', desc: 'Directory for config files (default: ./config, Docker: /config)' }),
  DATA_DIR: str({ default: './data', desc: 'Directory for data files (default: ./data, Docker: /data)' }),
  DATABASE_PATH: str({ default: './data/plex-playlists.db' }),
  // Web UI
  WEB_UI_ENABLED: bool({ default: true, desc: 'Enable web UI server' }),
  WEB_UI_PORT: num({ default: 8687, desc: 'Port for web UI server' }),
  // Metadata enrichment (optional - for genre data)
  LASTFM_API_KEY: str({ default: '', desc: 'Last.fm API key (optional, for genre enrichment)' }),
  SPOTIFY_CLIENT_ID: str({ default: '', desc: 'Spotify client ID (optional, for genre enrichment)' }),
  SPOTIFY_CLIENT_SECRET: str({ default: '', desc: 'Spotify client secret (optional, for genre enrichment)' }),
  // Cache warming settings
  CACHE_WARM_CONCURRENCY: num({ default: 10, desc: 'Max concurrent requests for cache warming (default: 10)' }),
  CACHE_WARM_CRON: str({ default: '0 3 * * 0', desc: 'Schedule for weekly full cache warming (default: Sunday 3am)' }),
  CACHE_REFRESH_CRON: str({ default: '0 2 * * *', desc: 'Schedule for daily refresh of expiring cache entries (default: 2am)' }),
  // Daily time-based playlists
  DAILY_PLAYLISTS_CRON: str({ default: '0 5 * * *', desc: 'Schedule for batch generation of all daily playlists' }),
  // Custom user-defined playlists (genre/mood combinations)
  CUSTOM_PLAYLISTS_CRON: str({ default: '0 6 * * 0', desc: 'Schedule for custom playlists generation (default: Sunday 6am)' }),
  // NOTE: Custom playlists are configured via web UI and stored in database
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
