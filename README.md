# Plex Playlist Enhancer

Automated daily Plex playlist generator that creates time-sliced music playlists (morning, afternoon, evening) based on your listening history with intelligent scoring and sonic similarity.

## Features

- 🕐 **Time-windowed playlists**: Three daily playlists tailored to morning (6-11am), afternoon (12-5pm), and evening (6-11pm) listening patterns
- 📊 **Smart scoring**: Exponential recency decay with configurable half-life, combined with user ratings and play counts
- 🎵 **Sonic similarity**: Automatically expands playlists using Plex's sonic analysis when needed
- 🎯 **Balance constraints**: Genre limits (max 40% per genre) and artist limits (max 2 tracks per artist)
- 💾 **SQLite persistence**: Tracks playlist history and job execution for observability
- 🐳 **Docker ready**: Full containerization support with docker-compose

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
git clone <repository-url>
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

## Configuration

All configuration is done via environment variables in `.env`:

### Required

- `PLEX_BASE_URL`: Your Plex server URL (e.g., `http://localhost:32400`)
- `PLEX_AUTH_TOKEN`: Your Plex authentication token

### Optional

- `DATABASE_PATH`: SQLite database location (default: `./data/plex-playlists.db`)
- `MORNING_CRON`: Cron schedule for morning playlist (default: `0 6 * * *`)
- `AFTERNOON_CRON`: Cron schedule for afternoon playlist (default: `0 12 * * *`)
- `EVENING_CRON`: Cron schedule for evening playlist (default: `0 18 * * *`)
- `HALF_LIFE_DAYS`: Recency decay half-life in days (default: `7`)
- `MAX_GENRE_SHARE`: Max percentage per genre (default: `0.4`)
- `PLAY_COUNT_SATURATION`: Play count normalization cap (default: `25`)
- `PLAYLIST_TARGET_SIZE`: Target number of tracks per playlist (default: `50`)
- `MAX_PER_ARTIST`: Maximum tracks per artist (default: `2`)
- `HISTORY_DAYS`: Number of days of history to analyze (default: `30`)
- `FALLBACK_LIMIT`: Maximum tracks to fetch for fallback candidates (default: `200`)

## Usage

### Scheduler Mode (Default)

Runs continuously with cron-scheduled playlist generation:

```bash
# Local
npm start

# Docker
docker-compose up -d
```

### Manual Mode

Generate a single playlist on demand:

```bash
# Local
npm run build
node dist/cli.js run morning     # or afternoon, evening

# Docker
docker-compose run --rm plex-playlists node dist/cli.js run morning
```

## CLI Commands

All commands can be run via `plex-playlists` (or `node dist/cli.js` if not installed globally).

### Playlist Generation

```bash
# Start the scheduler (runs continuously)
plex-playlists start

# Generate a single playlist on demand
plex-playlists run <window>
# Windows: morning, afternoon, evening
# Also supports genre windows from playlists.config.json (e.g., synthwave, psytrance)
```

### Import Ratings

Import star ratings from Spotify or YouTube Music playlists:

```bash
# Import ratings from CSV files
plex-playlists import <csv-directory> [--dry-run]

# Examples:
plex-playlists import ~/spotify-exports/           # Apply ratings
plex-playlists import ~/spotify-exports/ --dry-run # Preview only
```

See [IMPORTING.md](./IMPORTING.md) for detailed instructions on exporting from Spotify/YouTube Music.

### Cache Management

Pre-warm or manage the genre metadata cache:

```bash
# Pre-populate genre cache for all Plex artists
plex-playlists cache warm [--dry-run] [--concurrency=N]

# Show cache statistics
plex-playlists cache stats

# Clear expired or all cache entries
plex-playlists cache clear [--all]

# Examples:
plex-playlists cache warm --concurrency=5  # Warm cache with 5 concurrent requests
plex-playlists cache stats                 # View cached entries by source
plex-playlists cache clear                 # Remove expired entries
plex-playlists cache clear --all           # Remove all cache entries
```

**Note**: Cache warming requires Last.fm and/or Spotify API credentials (see [LASTFM_SETUP.md](./LASTFM_SETUP.md) and [SPOTIFY_SETUP.md](./SPOTIFY_SETUP.md)).

## Genre Playlists

In addition to time-based playlists (morning/afternoon/evening), you can configure genre-based playlists via `playlists.config.json`:

### Pinned Genre Playlists

Define specific genres you want as weekly playlists:

```json
{
  "genrePlaylists": {
    "pinned": [
      {
        "name": "synthwave",
        "genre": "synthwave",
        "cron": "0 7 * * 1",
        "enabled": true,
        "description": "Synthwave hits from the 80s future"
      }
    ]
  }
}
```

### Auto-Discovery

Automatically create playlists for top genres in your library:

```json
{
  "genrePlaylists": {
    "autoDiscover": {
      "enabled": true,
      "minArtists": 5,
      "maxPlaylists": 20,
      "exclude": ["electronic", "edm"],
      "schedule": "0 15 * * 1"
    }
  }
}
```

**Features**:
- Analyzes your library to find top genres
- Creates playlists for genres with at least N artists
- Excludes broad/generic genres
- Limited to max number of playlists

Run `plex-playlists run <genre-name>` to generate genre playlists manually (e.g., `plex-playlists run synthwave`).

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
6. **Sonic Expansion**: Use Plex `sonicallySimilar` API to fill to 50 tracks
7. **Playlist Creation**: Replace existing playlist, persist to database

### Database Schema

- `playlists`: Generated playlist metadata
- `playlist_tracks`: Individual tracks with positions and scores
- `history_cache`: Cached play counts (schema exists for future use)
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
└── scoring/                # Scoring algorithms
    └── weights.ts
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

**Example:** If you want morning playlist at 6 AM in Los Angeles:
```yaml
environment:
  - TZ=America/Los_Angeles
  - MORNING_CRON=0 6 * * *  # Runs at 6:00 AM Pacific Time
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more detailed error recovery and operational guidance.

## Roadmap

### Completed ✅

- [x] **Cross-playlist deduplication** - Prevents duplicate tracks across daily playlists
- [x] **Configurable playlist size and artist limits** - Via `PLAYLIST_TARGET_SIZE` and `MAX_PER_ARTIST` env vars
- [x] **Unit test coverage** - 88/88 tests passing with 91% coverage of core business logic (history, playlist selection, scoring)

### In Progress / Planned

- [ ] **Integration tests** - End-to-end tests for database and Plex client
- [ ] **Custom playlist artwork** - Generate cover art from album covers or genre themes
- [ ] **Web UI dashboard** - Browser-based configuration and playlist preview
- [ ] **Multi-user support** - Per-user playlists and configuration

## License

MIT

## Acknowledgments

Inspired by:
- [Meloday](https://github.com/trackstacker/meloday) - Time-sliced Plex playlists
- Spotify's Daylist feature
- [@ctrl/plex](https://github.com/scttcper/plex) - TypeScript Plex client
