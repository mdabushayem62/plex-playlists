# Configuration Reference

Complete reference for all environment variables.

---

## Required Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `PLEX_BASE_URL` | Plex server URL | `http://localhost:32400` |
| `PLEX_AUTH_TOKEN` | Plex X-Plex-Token | `abc123xyz...` |

---

## Scheduling

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_PLAYLISTS_CRON` | `0 5 * * *` | Daily playlists schedule (5am daily) |
| `DISCOVERY_CRON` | `0 6 * * 1` | Discovery playlist schedule (Monday 6am) |
| `THROWBACK_CRON` | `0 6 * * 6` | Throwback playlist schedule (Saturday 6am) |
| `CUSTOM_PLAYLISTS_CRON` | `0 6 * * 0` | Custom playlists schedule (Sunday 6am) |
| `CACHE_WARM_CRON` | `0 3 * * 0` | Full cache warming (Sunday 3am) |
| `CACHE_REFRESH_CRON` | `0 2 * * *` | Refresh expiring cache (2am daily) |

**Cron syntax:** `minute hour day month weekday`
- `0 5 * * *` = Every day at 5:00am
- `0 6 * * 1` = Every Monday at 6:00am
- `*/30 * * * *` = Every 30 minutes

---

## Scoring & Selection

| Variable | Default | Description |
|----------|---------|-------------|
| `HALF_LIFE_DAYS` | `7` | Recency decay half-life (days) |
| `MAX_GENRE_SHARE` | `0.4` | Max percentage per genre (0-1) |
| `PLAY_COUNT_SATURATION` | `25` | Play count normalization cap |
| `EXPLORATION_RATE` | `0.15` | Exploration vs exploitation (0-1) |
| `EXCLUSION_DAYS` | `7` | Days to exclude tracks from other playlists |
| `DISCOVERY_DAYS` | `90` | Min days since play for discovery |

**Examples:**
- `HALF_LIFE_DAYS=7`: Track played 7 days ago has 50% recency weight
- `MAX_GENRE_SHARE=0.4`: Max 40% of playlist from one genre
- `EXPLORATION_RATE=0.15`: 15% exploration, 85% top-scored tracks

---

## Throwback Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `THROWBACK_LOOKBACK_START` | `730` | Start of lookback window (days ago) |
| `THROWBACK_LOOKBACK_END` | `1825` | End of lookback window (days ago) |
| `THROWBACK_RECENT_EXCLUSION` | `90` | Exclude recently played tracks (days) |

**Examples:**
- `THROWBACK_LOOKBACK_START=730`: Look back starting 2 years ago
- `THROWBACK_LOOKBACK_END=1825`: Look back ending 5 years ago (window: 2-5 years)
- `THROWBACK_RECENT_EXCLUSION=90`: Skip tracks played in last 90 days

**Throwback Window:**
The throwback playlist analyzes tracks you played between `LOOKBACK_END` and `LOOKBACK_START` days ago, but excludes any tracks you've played in the last `RECENT_EXCLUSION` days to maintain freshness.

**Adaptive Window Behavior:**
If your library doesn't have enough history for the configured window, the system automatically adapts:
- **Ideal (5+ years history)**: Uses configured 2-5 year window
- **Good (3+ years history)**: Adapts to 1-3 year window
- **Acceptable (2+ years history)**: Adapts to 6 months - 2 years
- **Minimum (6+ months history)**: Adapts to 3-6 month window
- **Insufficient (<3 months)**: Throwback playlist disabled

This allows throwback playlists to work on newer libraries while still optimizing for nostalgic content on mature libraries.

---

## Playlist Generation

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYLIST_TARGET_SIZE` | `50` | Target tracks per playlist |
| `MAX_PER_ARTIST` | `2` | Max tracks per artist |
| `HISTORY_DAYS` | `30` | Days of history to analyze |
| `FALLBACK_LIMIT` | `200` | Max fallback candidate tracks |

---

## API Keys (Optional)

| Variable | Description | Get Key |
|----------|-------------|---------|
| `LASTFM_API_KEY` | Last.fm API key for genre enrichment | [Last.fm Setup](api-setup/lastfm-setup.md) |
| `SPOTIFY_CLIENT_ID` | Spotify client ID | [Spotify Setup](api-setup/spotify-setup.md) |
| `SPOTIFY_CLIENT_SECRET` | Spotify client secret | [Spotify Setup](api-setup/spotify-setup.md) |

**Genre Enrichment Strategy:**
1. Check cache (90-day TTL)
2. Plex metadata (Genre, Style, Mood tags)
3. Last.fm (always attempted if key provided)
4. Spotify (fallback if Plex + Last.fm return nothing)

---

## Cache Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_WARM_CONCURRENCY` | `10` | Max concurrent API requests during cache warming |

**Recommendations:**
- Artist cache: `2-5` (very conservative, avoid rate limits)
- Album cache: `3-10` (slightly more permissive)

---

## Storage & Web UI

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/plex-playlists.db` | SQLite database location |
| `WEB_UI_ENABLED` | `true` | Enable web UI server |
| `WEB_UI_PORT` | `8687` | Web UI port |

**Docker paths:**
- Local: `./data/plex-playlists.db`
- Docker: `/data/plex-playlists.db` (mapped to volume)

---

## System Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TZ` | `UTC` | Timezone for cron schedules |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `production` | Environment: `production`, `development` |

**Important:** Set `TZ` for correct cron scheduling!

---

## Example Configurations

### Minimal (Required Only)

```bash
PLEX_BASE_URL=http://localhost:32400
PLEX_AUTH_TOKEN=abc123xyz...
```

### Recommended (With Genre Enrichment)

```bash
PLEX_BASE_URL=http://localhost:32400
PLEX_AUTH_TOKEN=abc123xyz...
TZ=America/New_York

# Optional: Genre enrichment
LASTFM_API_KEY=your-lastfm-key
```

### Power User (Custom Tuning)

```bash
PLEX_BASE_URL=http://localhost:32400
PLEX_AUTH_TOKEN=abc123xyz...
TZ=America/Los_Angeles

# Scheduling
DAILY_PLAYLISTS_CRON=0 6 * * *
DISCOVERY_CRON=0 7 * * 6
THROWBACK_CRON=0 7 * * 0

# Tuning
PLAYLIST_TARGET_SIZE=75
EXPLORATION_RATE=0.20
HALF_LIFE_DAYS=5
MAX_GENRE_SHARE=0.5
THROWBACK_LOOKBACK_START=730
THROWBACK_LOOKBACK_END=1825

# APIs
LASTFM_API_KEY=your-lastfm-key
SPOTIFY_CLIENT_ID=your-spotify-id
SPOTIFY_CLIENT_SECRET=your-spotify-secret
```

### Development

```bash
PLEX_BASE_URL=http://localhost:32400
PLEX_AUTH_TOKEN=abc123xyz...
NODE_ENV=development
LOG_LEVEL=debug
WEB_UI_PORT=8687
DATABASE_PATH=./data/dev.db
```

---

## Configuration via Web UI

All settings can be edited via the web UI:
1. Navigate to **Settings** tab
2. Edit values in the form
3. Click **Save**
4. Restart container/service for changes to take effect

**Docker users:**
```bash
docker-compose restart
```

**CLI users:**
```bash
# Restart systemd service
sudo systemctl restart plex-playlists

# Or restart manually if using screen/tmux
```

---

## Validation

The app validates all environment variables on startup using `envalid`:
- **Required variables** must be present
- **Numeric values** validated for type and range
- **Cron expressions** validated for syntax
- **URLs** validated for format

**Check configuration:**
```bash
# CLI
plex-playlists start  # Will error if config invalid

# Docker
docker-compose up  # Check logs for validation errors
```

---

## Performance Tuning

### Large Libraries (>10,000 tracks)

```bash
FALLBACK_LIMIT=100          # Reduce Plex API load
HISTORY_DAYS=21             # Analyze less history
CACHE_WARM_CONCURRENCY=5    # More conservative
```

### Aggressive Exploration

```bash
EXPLORATION_RATE=0.25       # 25% exploration
EXCLUSION_DAYS=14           # Longer exclusion window
DISCOVERY_DAYS=60           # More frequent discovery
```

### More Variety

```bash
MAX_GENRE_SHARE=0.3         # Lower genre limit (30%)
MAX_PER_ARTIST=1            # One track per artist
PLAYLIST_TARGET_SIZE=100    # Larger playlists
```

---

## Related Documentation

- [Docker Guide](docker-guide.md) - Docker-specific configuration
- [CLI Guide](cli-guide.md) - CLI environment setup
- [Algorithm Explained](algorithm-explained.md) - How scoring parameters affect selection
- [Last.fm Setup](api-setup/lastfm-setup.md) - Get Last.fm API key
- [Spotify Setup](api-setup/spotify-setup.md) - Get Spotify credentials
