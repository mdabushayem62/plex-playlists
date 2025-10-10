# Plex Playlist Enhancer

Automated daily and custom Plex playlists using your listening history, star ratings, and sonic similarity - like Spotify's Daylist, but for Plex and open source.

**In a nutshell**: 3 time-based daily playlists + unlimited custom playlists (genre/mood combinations), all automatic, using your Plex listening history, star ratings, and algorithmic similarity.

## What This Does

Tired of manually creating playlists? This tool automatically generates:

1. **Time-Based Daily Playlists** (`🌅 Daily Morning Mix`, `☀️ Daily Afternoon Mix`, `🌙 Daily Evening Mix`)
   - Based on when you actually listen to different music throughout the day
   - All three updated automatically on a configurable schedule

2. **Custom Playlists** - Create unlimited genre/mood combination playlists via web UI

3. **Analytics Dashboard** - Genre distribution, listening patterns, and library insights

4. **Smart Selection** - Exponential recency decay, star ratings, and sonic similarity

5. **Rating Import** - Bootstrap ratings from Spotify or YouTube Music exports

**Perfect for:**
- 🎧 Music lovers with large Plex libraries
- 🏠 Homelab enthusiasts who want to own their music streaming
- 📊 Data nerds who want algorithmic playlists without Spotify
- 🎵 Anyone tired of listening to the same songs on repeat

## Features

### Core Playlist Generation
- 🕐 **Time-windowed playlists**: Three daily playlists tailored to morning (6-11am), afternoon (12-5pm), and evening (6-11pm) listening patterns
- 🎨 **Custom playlists**: Create genre/mood combination playlists via web UI (up to 2 genres + 2 moods each)
- 🎭 **Mood discovery**: Automatically discover dominant moods from your highly-rated tracks
- 📊 **Smart scoring**: Exponential recency decay with configurable half-life, combined with user ratings and play counts
- 🎵 **Sonic similarity**: Expands playlists using Plex's sonic analysis when needed
- 🎯 **Intelligent constraints**: Genre limits (max 40% per genre) and artist limits (max 2 tracks per artist)
- 🚫 **Cross-playlist deduplication**: Prevents same track appearing in multiple daily playlists

### Rating & Metadata
- 📥 **Import ratings from Spotify/YouTube Music**: Bulk import star ratings from CSV/JSON exports (see [Importing Ratings](#importing-ratings))
- 🏷️ **Multi-source genre enrichment**: Intelligent merging of genres and moods from Plex, Last.fm, and Spotify
  - Plex metadata (Genre/Style tags for genres, Mood tags for moods)
  - Last.fm for additional genre coverage (always attempted)
  - Spotify as fallback when Plex + Last.fm return nothing
  - Deduplication and source tracking ("plex,lastfm")
- 💾 **Genre/mood caching**: 90-day TTL cache to minimize API calls
- ⚡ **Cache pre-warming**: Bulk populate genre/mood cache for entire library

### Operations & Observability
- 🐳 **Docker ready**: Full containerization with docker-compose
- 💾 **SQLite persistence**: Tracks playlist history and job execution for observability
- 📅 **Cron scheduling**: Configurable schedules for each playlist window
- 🏥 **Health monitoring**: Built-in healthcheck validates database and scheduler activity
- 📊 **Job tracking**: View success/failure history with error messages
- ⚙️ **Highly configurable**: 12+ environment variables for tuning behavior

### Developer Experience
- ✅ **Comprehensive test suite** (unit + integration tests) - all passing
- 📖 **Comprehensive docs**: README + docs/ (troubleshooting, import guides, setup guides)
- 🔧 **Type-safe**: Full TypeScript with strict mode
- 🪝 **Graceful shutdown**: Proper SIGTERM/SIGINT handling for clean restarts

## Prerequisites

- Node.js 20 or higher (or Docker)
- Plex Media Server with a music library
- Plex authentication token

## Quick Start

### Getting Your Plex Token

1. Log into Plex Web App
2. Play any media item
3. Click the ⋯ menu → "Get Info"
4. Click "View XML"
5. In the URL, find `X-Plex-Token=...` - copy the token value

### Option 1: Docker (Recommended)

```bash
# Clone and setup
git clone https://github.com/aceofaces/plex-playlists.git
cd plex-playlists

# Create environment file
cp .env.example .env
# Edit .env with your Plex credentials

# Build and run
docker-compose up -d

# View logs
docker-compose logs -f
```

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your Plex credentials

# Run in development mode (migrations run automatically)
npm run dev

# Or build and run
npm run build
npm start
```

### Web UI

Once running (either method), access the web interface at **http://localhost:8687**:
- Setup wizard for first-time configuration
- Dashboard with playlist status
- Manual playlist generation
- Configuration editor

## Importing Ratings

One of the killer features - bootstrap your Plex ratings from Spotify or YouTube Music:

```bash
# Spotify: Export playlists using Exportify (https://exportify.net) → CSV files
# YouTube Music: Use Google Takeout → JSON files (natively supported!)
plex-playlists import ~/music-exports/

# Results:
# ✓ Matched 1,089 of 1,247 tracks (87%)
# ✓ Set 834 ratings
# ✓ Skipped 255 already rated
```

The importer auto-detects CSV and JSON formats - just place your files in a directory and import.

This gives the scoring algorithm real data to work with from day one instead of starting from zero.

**See [docs/importing.md](./docs/importing.md) for complete step-by-step instructions.**

## Custom Playlists

Beyond daily time-based playlists, create custom playlists via the web UI:

### Web UI Playlist Builder

Navigate to **Playlists → Custom Playlists** to create genre/mood combination playlists:

**Configuration:**
- **Name**: Display name for your playlist (e.g., "Chill Electronic", "Dark Synthwave")
- **Genres**: Select up to 2 genres from your library
- **Moods**: Select up to 2 moods (from Plex metadata)
- **Target Size**: Number of tracks (10-200, default 50)
- **Description**: Optional notes
- **Enabled**: Toggle to enable/disable

**Examples:**
- `🎨 Chill Electronic` - Genres: [electronic], Moods: [chill, mellow]
- `🎨 Dark Synthwave` - Genres: [synthwave], Moods: [dark, intense]
- `🎨 Energetic Rock` - Genres: [rock, metal], Moods: [energetic]

**Scheduling:**
- Automatic weekly regeneration (configurable via `CUSTOM_PLAYLISTS_CRON`)
- On-demand generation via "Generate" button
- Enable/disable toggle without deleting

**Under the hood:**
- Stored in database (not config files)
- Uses same selection algorithm as daily playlists
- Filters tracks by genre/mood metadata from cache
- Real-time progress tracking during generation

## Configuration

All configuration is done via environment variables in `.env`:

### Required

- `PLEX_BASE_URL`: Your Plex server URL (e.g., `http://localhost:32400`)
- `PLEX_AUTH_TOKEN`: Your Plex authentication token

### Optional - Scheduling

- `DAILY_PLAYLISTS_CRON`: Cron schedule for all three daily playlists (default: `0 5 * * *`)
  - All three playlists (morning, afternoon, evening) run sequentially at scheduled time
  - Time-based history filtering is preserved (morning playlist still uses 6-11am history)
- `CUSTOM_PLAYLISTS_CRON`: Cron schedule for custom playlists (default: `0 6 * * 0` - Sunday 6am)
  - Generates all enabled custom playlists (genre/mood combinations)
- `CACHE_WARM_CRON`: Cron schedule for cache warming (default: `0 3 * * 0` - Sunday 3am)
- `CACHE_REFRESH_CRON`: Cron schedule for cache refresh (default: `0 2 * * *` - Daily 2am)

### Optional - Scoring

- `HALF_LIFE_DAYS`: Recency decay half-life in days (default: `7`)
- `MAX_GENRE_SHARE`: Max percentage per genre (default: `0.4` = 40%)
- `PLAY_COUNT_SATURATION`: Play count normalization cap (default: `25`)

### Optional - Playlist Generation

- `PLAYLIST_TARGET_SIZE`: Target number of tracks per playlist (default: `50`)
- `MAX_PER_ARTIST`: Maximum tracks per artist (default: `2`)
- `HISTORY_DAYS`: Number of days of history to analyze (default: `30`)
- `FALLBACK_LIMIT`: Maximum tracks to fetch for fallback candidates (default: `200`)

### Optional - Metadata Enrichment

- `LASTFM_API_KEY`: Last.fm API key for genre enrichment (optional)
- `SPOTIFY_CLIENT_ID`: Spotify client ID for genre enrichment (optional)
- `SPOTIFY_CLIENT_SECRET`: Spotify client secret for genre enrichment (optional)

See [docs/lastfm-setup.md](./docs/lastfm-setup.md) and [docs/spotify-setup.md](./docs/spotify-setup.md) for API setup instructions.

### Optional - Storage

- `DATABASE_PATH`: SQLite database location (default: `./data/plex-playlists.db`)

## CLI Reference

All commands can be run via `plex-playlists` (or `node dist/cli.js` if not installed globally).

### Playlist Generation

```bash
# Start the scheduler (runs continuously)
plex-playlists start

# Generate a single playlist on demand
plex-playlists run morning              # Time windows: morning, afternoon, evening
plex-playlists run synthwave            # Genre windows from playlists.config.json
```

### Import Ratings

```bash
# Import ratings from CSV/JSON files (auto-detected)
plex-playlists import <directory>         # Apply ratings
plex-playlists import <directory> --dry-run  # Preview changes only
```

### Cache Management

```bash
# Pre-populate genre cache for all Plex artists
plex-playlists cache warm [--dry-run] [--concurrency=N]

# Show cache statistics
plex-playlists cache stats

# Clear expired or all cache entries
plex-playlists cache clear [--all]
```

## How It Works

### Scoring Algorithm

Each candidate track receives a final score based on:

**Final Score = (0.7 × Recency Weight) + (0.3 × Fallback Score)**

- **Recency Weight**: Exponential decay `exp(-ln(2) × days_since_play / half_life_days)`
  - Recent plays heavily favored
  - Configurable half-life (default 7 days = 50% weight at 7 days, ~4% at 30 days)

- **Fallback Score**: `(0.6 × normalized_star_rating) + (0.4 × normalized_play_count)`
  - Star ratings: 0-5 scale normalized to [0, 1]
  - Play counts: Saturate at configurable threshold (default 25 plays)

### Selection Pipeline

1. **History Retrieval**: Fetch last 30 days of plays filtered by time window
2. **Aggregation**: Group by track, compute play counts
3. **Candidate Building**: Fetch metadata, calculate scores
4. **Fallback**: If insufficient candidates, add high-rated/frequently-played tracks
5. **Multi-pass Selection**: Three passes with progressive constraint relaxation:
   - Pass 1: Genre + artist limits
   - Pass 2: Artist limit only
   - Pass 3: No constraints
6. **Sonic Expansion**: Use Plex `sonicallySimilar` API to fill to target size
7. **Playlist Creation**: Replace existing playlist, persist to database

### Database Schema

- `playlists`: Generated playlist metadata
- `playlist_tracks`: Individual tracks with positions and scores
- `genre_cache`: Cached genre metadata from Spotify/Last.fm APIs
- `job_runs`: Execution history with status and errors

## Development

### Commands

```bash
npm run dev           # Development mode with tsx
npm run build         # Production build (ESM + CJS + types)
npm run lint          # ESLint check
npm run test          # Run tests
npm run test:watch    # Watch mode
```

### Pre-commit Hooks

The project uses Husky to enforce code quality before commits. On every commit, the following checks run automatically:

1. **ESLint** - Code quality and style validation
2. **Tests** - Full test suite (unit + integration)
3. **Build** - TypeScript compilation check

If any check fails, the commit is blocked. This ensures all committed code:
- ✅ Passes linting with zero warnings
- ✅ Has all tests passing
- ✅ Compiles successfully

**Manual execution:**
```bash
.husky/pre-commit  # Run all pre-commit checks manually
```

**First-time setup:**
```bash
npm install  # Automatically sets up hooks via "prepare" script
```

### Database Migrations

Migrations run automatically on startup. To work with the schema:

```bash
# Generate new migration after schema changes
npx drizzle-kit generate

# View database in Drizzle Studio
npx drizzle-kit studio
```

### Project Structure

```
src/
├── cli.ts                  # CLI entry point
├── index.ts                # App factory
├── config.ts               # Environment validation
├── playlist-runner.ts      # Main orchestration
├── db/                     # Database layer
│   ├── schema.ts
│   ├── index.ts
│   └── repository.ts
├── history/                # History fetching/aggregation
│   ├── history-service.ts
│   └── aggregate.ts
├── playlist/               # Selection logic
│   ├── candidate-builder.ts
│   ├── selector.ts
│   ├── fallback.ts
│   └── sonic-expander.ts
├── plex/                   # Plex API client
│   ├── client.ts
│   ├── tracks.ts
│   └── playlists.ts
├── scoring/                # Scoring algorithms
│   └── weights.ts
├── import/                 # Rating import from CSV/JSON
│   ├── importer-fast.ts
│   ├── file-parser.ts      # CSV and JSON parser
│   ├── json-parser.ts      # YouTube Music JSON support
│   └── track-matcher.ts
└── metadata/               # Genre enrichment
    └── providers/
        ├── spotify.ts
        └── lastfm.ts
```

## Troubleshooting

### No tracks in playlist

- Verify you have listening history in the time window
- Check if tracks are accessible in your Plex library
- Review logs for Plex API errors

### Database errors

```bash
# Reset database
rm -rf data/plex-playlists.db*
npx drizzle-kit generate
```

### Docker networking

- If Plex is on `localhost`, use `network_mode: host` in docker-compose.yml
- For remote Plex servers, change to bridge mode and update `PLEX_BASE_URL`

### Timezone Configuration

Cron schedules use the **container's timezone**. If playlists run at the wrong time, configure the timezone:

**Docker Compose:**
```yaml
# docker-compose.yml
services:
  plex-playlists:
    environment:
      - TZ=America/New_York  # Your timezone
      - PLEX_BASE_URL=http://localhost:32400
      - PLEX_AUTH_TOKEN=your-token
```

**Common Timezones:**
- `America/New_York` - Eastern Time (US)
- `America/Chicago` - Central Time (US)
- `America/Los_Angeles` - Pacific Time (US)
- `Europe/London` - UK
- `Europe/Paris` - Central European Time
- `Australia/Sydney` - Australian Eastern Time

**Find your timezone:**
```bash
# On host system
timedatectl | grep "Time zone"

# Or list all available
timedatectl list-timezones | grep -i america
```

**Verify Container Timezone:**
```bash
# Check what timezone the container is using
docker-compose exec plex-playlists date

# Should show your local time, not UTC
```

**Example:** If you want daily playlists to run at 5 AM in Los Angeles:
```yaml
environment:
  - TZ=America/Los_Angeles
  - DAILY_PLAYLISTS_CRON=0 5 * * *  # Runs at 5:00 AM Pacific Time
```

See [docs/troubleshooting.md](./docs/troubleshooting.md) for more detailed error recovery and operational guidance.

## Roadmap

See [docs/roadmap.md](./docs/roadmap.md) for the full roadmap including completed features, planned improvements, and future vision.

**Highlights:**
- ✅ Custom playlists, analytics dashboard, web UI, real-time job monitoring
- 🚧 UI/UX improvements, genre ignore list, background job system
- 🔮 Multi-user support, playlist export, advanced filtering

## License

MIT

## Acknowledgments

Inspired by:
- [Meloday](https://github.com/trackstacker/meloday) - Time-sliced Plex playlists
- Spotify's Daylist feature
- [@ctrl/plex](https://github.com/scttcper/plex) - TypeScript Plex client
