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
  // AudioMuse integration (optional - for audio features)
  AUDIOMUSE_DB_HOST: str({ default: '', desc: 'AudioMuse PostgreSQL host (optional, for audio features)' }),
  AUDIOMUSE_DB_PORT: num({ default: 5432, desc: 'AudioMuse PostgreSQL port (default: 5432)' }),
  AUDIOMUSE_DB_NAME: str({ default: 'audiomuse', desc: 'AudioMuse PostgreSQL database name' }),
  AUDIOMUSE_DB_USER: str({ default: '', desc: 'AudioMuse PostgreSQL username' }),
  AUDIOMUSE_DB_PASSWORD: str({ default: '', desc: 'AudioMuse PostgreSQL password' }),
  // Cache warming settings (artist/album metadata cache)
  CACHE_WARM_CONCURRENCY: num({ default: 5, desc: 'Max concurrent requests for cache warming (default: 5, conservative for Last.fm rate limits)' }),
  CACHE_WARM_CRON: str({ default: '0 3 * * 0', desc: 'Schedule for weekly full cache warming (default: Sunday 3am)' }),
  CACHE_REFRESH_CRON: str({ default: '0 * * * *', desc: 'Schedule for hourly micro-refresh of expiring cache entries (default: every hour at :00)' }),
  // Track cache refresh settings
  TRACK_CACHE_REFRESH_CRON: str({ default: '0 2 * * *', desc: 'Schedule for daily track cache stats refresh (default: daily 2am)' }),
  TRACK_CACHE_SYNC_RECENT_CRON: str({ default: '0 3 * * *', desc: 'Schedule for daily sync of recently added tracks (default: daily 3am)' }),
  // Daily time-based playlists
  DAILY_PLAYLISTS_CRON: str({ default: '0 5 * * *', desc: 'Schedule for batch generation of all daily playlists' }),
  // Discovery playlist (weekly rediscovery of forgotten gems)
  DISCOVERY_CRON: str({ default: '0 6 * * 1', desc: 'Schedule for weekly discovery playlist (default: Monday 6am)' }),
  // Throwback playlist (nostalgia from 2-5 years ago)
  THROWBACK_CRON: str({ default: '0 6 * * 6', desc: 'Schedule for weekly throwback playlist (default: Saturday 6am)' }),
  THROWBACK_LOOKBACK_START: num({ default: 730, desc: 'Start lookback in days for throwback playlist (default: 730 = 2 years)' }),
  THROWBACK_LOOKBACK_END: num({ default: 1825, desc: 'End lookback in days for throwback playlist (default: 1825 = 5 years)' }),
  THROWBACK_RECENT_EXCLUSION: num({ default: 90, desc: 'Exclude tracks played in last N days from throwback (default: 90)' }),
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
  FALLBACK_LIMIT: num({ default: 200 }),
  EXPLORATION_RATE: num({ default: 0.15, desc: 'Exploration rate for discovery (0.0-1.0, default: 0.15 = 15%)' }),
  EXCLUSION_DAYS: num({ default: 7, desc: 'Days to exclude recently-recommended tracks from new playlists (default: 7)' }),
  DISCOVERY_DAYS: num({ default: 90, desc: 'Minimum days since last play for discovery playlist (default: 90)' }),
  // Adaptive PlayQueue settings
  ADAPTIVE_QUEUE_ENABLED: bool({ default: false, desc: 'Enable real-time PlayQueue adaptation based on skip patterns (Beta)' }),
  ADAPTIVE_SENSITIVITY: num({ default: 5, desc: 'Sensitivity level for adaptive queue (1-10, higher = more aggressive)' }),
  ADAPTIVE_MIN_SKIP_COUNT: num({ default: 2, desc: 'Minimum skips to trigger pattern detection' }),
  ADAPTIVE_WINDOW_MINUTES: num({ default: 5, desc: 'Time window for pattern detection (minutes)' }),
  ADAPTIVE_COOLDOWN_SECONDS: num({ default: 10, desc: 'Cooldown between adaptations (seconds)' })
});

export type AppEnv = typeof APP_ENV;
