# Plex Playlist Enhancer

Automated daily and genre-based Plex playlists using your listening history, star ratings, and sonic similarity - like Spotify's Daylist, but for Plex and open source.

**In a nutshell**: 3 daily playlists + 20 genre playlists, all automatic, using your Plex listening history, star ratings, and algorithmic similarity.

## What This Does

Tired of manually creating playlists? This tool automatically generates:

1. **Time-Based Daily Playlists** (`🌅 Daily Morning Mix`, `☀️ Daily Afternoon Mix`, `🌙 Daily Evening Mix`)
   - Based on when you actually listen to different music throughout the day
   - All three updated automatically on your schedule (default: 5am daily)

2. **Genre-Based Weekly Playlists** (`🎵 Weekly Synthwave`, `🎵 Weekly Psytrance`, etc.)
   - Configurable genre playlists updated weekly
   - Auto-discovery mode finds your top genres automatically

3. **Smart Selection Algorithm**
   - Exponential recency decay (recent plays favored)
   - Star ratings and play count weighting
   - Sonic similarity expansion using Plex's audio analysis

4. **Rating Import**
   - Bootstrap your Plex ratings from Spotify (CSV) or YouTube Music (JSON) exports
   - "Your Top Songs" → 4.5 stars, "Liked Songs" → 4.0 stars

**Perfect for:**
- 🎧 Music lovers with large Plex libraries
- 🏠 Homelab enthusiasts who want to own their music streaming
- 📊 Data nerds who want algorithmic playlists without Spotify
- 🎵 Anyone tired of listening to the same songs on repeat

## Features

### Core Playlist Generation
- 🕐 **Time-windowed playlists**: Three daily playlists tailored to morning (6-11am), afternoon (12-5pm), and evening (6-11pm) listening patterns
- 🎼 **Genre playlists**: Weekly playlists for specific genres (synthwave, psytrance, techno, etc.)
- 🔍 **Auto-discovery**: Automatically create playlists for your top genres in your library
- 📊 **Smart scoring**: Exponential recency decay with configurable half-life, combined with user ratings and play counts
- 🎵 **Sonic similarity**: Expands playlists using Plex's sonic analysis when needed
- 🎯 **Intelligent constraints**: Genre limits (max 40% per genre) and artist limits (max 2 tracks per artist)
- 🚫 **Cross-playlist deduplication**: Prevents same track appearing in multiple daily playlists

### Rating & Metadata
- 📥 **Import ratings from Spotify/YouTube Music**: Bulk import star ratings from CSV/JSON exports
  - Spotify: Export via Exportify (CSV)
  - YouTube Music: Google Takeout (JSON, natively supported)
  - "Your Top Songs" → 4.5 stars
  - "Liked Songs" → 4.0 stars
  - Custom playlists → 3.0 stars
- 🏷️ **Genre metadata enrichment**: Fetch genres from Spotify + Last.fm APIs for better filtering
- 💾 **Genre caching**: 90-day TTL cache to minimize API calls
- ⚡ **Cache pre-warming**: Bulk populate genre cache for entire library

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

🌐 **Access Web UI**: http://localhost:8687
- Setup wizard for first-time configuration
- Dashboard with playlist status
- Manual playlist generation
- Configuration editor

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

🌐 **Access Web UI**: http://localhost:8687
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

## Genre Playlists

Beyond daily time-based playlists, create genre-focused weekly playlists:

### Pinned Genres (Config-Driven)

Configure specific genres you want as weekly playlists:

```json
// playlists.config.json
{
  "genrePlaylists": {
    "pinned": [
      {
        "name": "synthwave",
        "genre": "synthwave",
        "cron": "0 7 * * 1",      // Mondays at 7 AM
        "enabled": true,
        "description": "Synthwave hits from the 80s future"
      }
    ]
  }
}
```

**Creates**: `🎵 Weekly Synthwave` playlist

### Auto-Discovery

Automatically create playlists for your top genres:

```json
{
  "autoDiscover": {
    "enabled": true,
    "minArtists": 5,      // Genre needs 5+ artists to qualify
    "maxPlaylists": 20,   // Cap at 20 genre playlists
    "exclude": ["electronic", "edm"],  // Skip broad/generic genres
    "schedule": "0 15 * * 1"  // Weekly refresh
  }
}
```

Auto-discovery analyzes your library, finds top genres, and creates `🎵 Weekly [Genre]` playlists automatically.

Run `plex-playlists run synthwave` to generate genre playlists manually.

## Use Cases

### Daily Listening Habits
Generate fresh daily playlists that adapt to your patterns:
- **🌅 Morning**: Chill/focus music you listen to while working
- **☀️ Afternoon**: Upbeat tracks from your lunchtime listening
- **🌙 Evening**: Whatever you wind down with at night

### Genre Deep Dives
Create weekly genre playlists for focused listening:
- `🎵 Weekly Synthwave`
- `🎵 Weekly Psytrance`
- `🎵 Weekly Jazz`

### Library Onboarding
Import ratings from Spotify (CSV) or YouTube Music (JSON) to jumpstart scoring:
- Export "Your Top Songs 2024" → instant 4.5-star ratings
- Export "Liked Songs" → 4.0-star baseline
- Auto-detection handles both formats
- Let the algorithm handle the rest

### Music Discovery
- Sonic similarity expands playlists beyond your history
- Auto-discovery finds genres you didn't know you had
- Cross-playlist deduplication keeps daily mixes fresh

## Configuration

All configuration is done via environment variables in `.env`:

### Required

- `PLEX_BASE_URL`: Your Plex server URL (e.g., `http://localhost:32400`)
- `PLEX_AUTH_TOKEN`: Your Plex authentication token

### Optional - Scheduling

- `DAILY_PLAYLISTS_CRON`: Cron schedule for all three daily playlists (default: `0 5 * * *`)
  - All three playlists (morning, afternoon, evening) run sequentially at scheduled time
  - Time-based history filtering is preserved (morning playlist still uses 6-11am history)

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

### Completed ✅

- [x] **Cross-playlist deduplication** - Prevents duplicate tracks across daily playlists
- [x] **Configurable playlist size and artist limits** - Via `PLAYLIST_TARGET_SIZE` and `MAX_PER_ARTIST`
- [x] **Comprehensive test coverage** - Unit tests for core business logic, integration tests for database and caching
- [x] **Rating import** - Import from Spotify/YouTube Music CSV exports
- [x] **Genre metadata enrichment** - Spotify + Last.fm API integration
- [x] **Genre caching** - 90-day TTL cache with pre-warming support
- [x] **Weekly genre playlists** - Pinned genres + auto-discovery mode
- [x] **JSON schema validation** - IDE autocomplete for playlists.config.json
- [x] **Web UI dashboard** - Browser-based setup wizard, configuration editor, dashboard with playlist status, and manual playlist generation

### Planned

- [ ] **Custom playlist artwork** - Generate cover art from album covers or genre themes
- [ ] **Multi-user support** - Per-user playlists and configuration
- [ ] **Playlist export** - Export to M3U or back to Spotify
- [ ] **Mood/energy-based playlists** - Using Plex audio features for energy/mood filtering

## License

MIT

## Acknowledgments

Inspired by:
- [Meloday](https://github.com/trackstacker/meloday) - Time-sliced Plex playlists
- Spotify's Daylist feature
- [@ctrl/plex](https://github.com/scttcper/plex) - TypeScript Plex client
