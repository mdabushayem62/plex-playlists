# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript-based automated Plex playlist generator that creates three daily playlists (morning, afternoon, evening) using time-windowed listening history, exponential recency weighting, and sonic similarity expansion.

## Essential Commands

### Development
```bash
npm run dev              # Run with tsx (development mode)
npm run build            # Build with tsup (ESM + CJS + .d.ts)
npm run start            # Run compiled CLI
npm run lint             # ESLint with max-warnings=0
npm run test             # Run all tests with vitest
npm run test:watch       # Run tests in watch mode
```

### CLI Usage
```bash
plex-playlists start              # Start scheduler (cron-based)
plex-playlists run <window>       # Run single window (morning|afternoon|evening)
plex-playlists run-all            # Run all three daily playlists sequentially
```

### Database
```bash
npx drizzle-kit generate          # Generate migrations (after schema changes)
npx drizzle-kit studio            # Open Drizzle Studio
# Note: Migrations run automatically on app startup
```

### Cache Management
```bash
plex-playlists cache warm [--dry-run] [--concurrency=N]
                                  # Warm genre cache for all Plex artists
                                  # Default concurrency: 2 (very conservative to avoid rate limits)
                                  # Skips already-cached artists (incremental)
                                  # Tracked in job_runs table
plex-playlists cache stats        # Show cache statistics (total, by source, expiring)
plex-playlists cache clear [--all]# Clear expired (or all) cache entries
```

## Architecture

### Core Pipeline (playlist-runner.ts)

The `DailyPlaylistRunner` orchestrates the entire generation flow:

1. **History Retrieval** (`history-service.ts`)
   - Fetches Plex listening history filtered by time window (default: last 30 days)
   - Windows: morning (6-11h), afternoon (12-17h), evening (18-23h)
   - Filters by `type === 'track'` and hour-of-day boundaries

2. **History Aggregation** (`aggregate.ts`)
   - Groups history entries by `ratingKey`
   - Computes play count and most recent play date per track

3. **Candidate Building** (`candidate-builder.ts`)
   - Fetches full track metadata from Plex
   - Applies scoring: `finalScore = 0.7 * recencyWeight + 0.3 * fallbackScore`
   - **Recency weight**: Exponential decay `exp(-ln(2) * daysSince / halfLifeDays)` (default half-life: 7 days)
   - **Fallback score**: `0.6 * normalizedStarRating + 0.4 * normalizedPlayCount`

4. **Fallback Strategy** (`fallback.ts`)
   - If insufficient candidates, fetch high-rated/frequently-played tracks from Plex library
   - Merges with primary candidates (deduplicated by `ratingKey`)

5. **Selection** (`selector.ts`)
   - Three-pass selection with progressive constraint relaxation:
     - Pass 1: Both genre limit (≤40% per genre) and artist limit (≤2 per artist)
     - Pass 2: Artist limit only
     - Pass 3: No constraints
   - Target: 50 tracks per playlist

6. **Sonic Expansion** (`sonic-expander.ts`)
   - If under target size, uses Plex `sonicallySimilar` API with seed tracks
   - Filters out already-selected and excluded tracks

7. **Playlist Creation** (`plex/playlists.ts`)
   - Deletes existing playlist for window (if exists)
   - Creates new Plex audio playlist with formatted title and summary
   - Summary format: `"Morning 06:00-11:59 • Generated 2025-10-08 17:30"`

8. **Persistence** (`db/repository.ts`)
   - Saves playlist metadata, tracks, and job status to SQLite
   - Tracks job history for observability

### Key Data Flow

```
HistoryEntry[] → AggregatedHistory[] → CandidateTrack[] → Selected[] → Plex Playlist
                                              ↓
                                     (fallback + sonic expansion if needed)
```

### Scoring System

- **Recency Weight**: Exponential decay favoring recently played tracks
  - Configured via `HALF_LIFE_DAYS` (default: 7)
  - Weight at 30 days ≈ 4% with 7-day half-life

- **Fallback Score**: Star rating (60%) + play count saturation (40%)
  - Star ratings normalized to [0, 1] scale
  - Play count saturates at `PLAY_COUNT_SATURATION` (default: 25)

- **Final Score**: `0.7 * recencyWeight + 0.3 * fallbackScore`

### Database Schema (db/schema.ts)

- `playlists`: Window-unique playlists with Plex rating key
- `playlist_tracks`: Tracks with position and scores
- `genre_cache`: Cached genre metadata from Spotify/Last.fm with TTL
- `job_runs`: Job execution history (start, finish, status, errors)

**Note**: Migrations run automatically on first database connection (`db/index.ts:runMigrations()`)

## Configuration

All config via environment variables (validated with `envalid` in `config.ts`):

- `PLEX_BASE_URL`: Plex server URL (required)
- `PLEX_AUTH_TOKEN`: Plex X-Plex-Token (required)
- `DATABASE_PATH`: SQLite file path (default: `./data/plex-playlists.db`)

### Scheduling Options

**Daily Playlists**:
- `DAILY_PLAYLISTS_CRON`: Cron schedule for all three daily playlists (default: `0 5 * * *`)
- All three playlists (morning, afternoon, evening) run sequentially at 5am
- Time-based history filtering is preserved (morning playlist still filters 6-11am history)
- Ensures playlists are ready before you wake up

**Cache Warming** (Automatic Background Jobs):
- `CACHE_WARM_CONCURRENCY`: Max concurrent requests for Spotify/Last.fm
  - Artist cache: 2 concurrent requests (very conservative)
  - Album cache: 3 concurrent requests
  - Retry delays capped at 5 minutes to prevent hour-long stalls
- `CACHE_WARM_CRON`: Weekly full cache warming schedule (default: `0 3 * * 0` - Sunday 3am)
  - Incrementally fetches genres only for uncached artists
  - Tracked in `job_runs` table with success/failure status
- `CACHE_REFRESH_CRON`: Daily refresh of expiring entries (default: `0 2 * * *` - 2am)
  - Refreshes cache entries expiring within 7 days
  - Runs before daily playlist generation to ensure fresh metadata

**Other Parameters**:
- `HALF_LIFE_DAYS`: Recency decay half-life (default: 7)
- `MAX_GENRE_SHARE`: Max percentage of playlist from one genre (default: 0.4)
- `PLAY_COUNT_SATURATION`: Play count normalization cap (default: 25)

## Import Patterns

Uses ES modules with `.js` extensions in import paths (required for Node ESM):

```typescript
import { logger } from './logger.js';
import type { PlaylistWindow } from './windows.js';
```

TypeScript compiles `.ts` → `.js`, but imports must reference `.js`.

## Testing

Uses Vitest following testing pyramid principles:
- **Unit tests (~90%)**: Selection logic, scoring algorithms, time calculations, aggregation
- **Integration tests (~9%)**: Database migrations, Plex client interactions, caching, job tracking
- **E2E (~1%)**: Optional staging Plex smoke tests

All tests run automatically on commit via Husky pre-commit hooks (lint → test → build)

## Common Development Patterns

### Adding New Scoring Factors
1. Update `CandidateTrack` interface in `candidate-builder.ts`
2. Modify scoring weights in `buildCandidate()` or `scoring/weights.ts`
3. Adjust `FINAL_SCORE_*_WEIGHT` constants

### Modifying Selection Constraints
- Artist/genre limits: See `selectWithConstraints()` in `selector.ts`
- Pass configuration: Modify `passes` array in `selectPlaylistTracks()`

### Changing Time Windows
- Update `DEFAULT_WINDOWS` in `windows.ts`
- Ensure cron schedules align with new windows in `.env`

### Plex API Interactions
- Client singleton: `getPlexServer()` in `plex/client.ts` (uses LRU cache)
- Extend `@ctrl/plex` types as needed (e.g., audio playlist support)
- Always use `ratingKey` as primary identifier (string format)

## Observability

### Structured Logging
The playlist runner (`playlist-runner.ts`) logs detailed metrics at each stage:
- History retrieval: entry count, unique tracks
- Candidate pool: total candidates, sources (history vs fallback)
- Selection: initial selection size, sonic expansion usage
- Final metrics: playlist size, candidate sources, cross-playlist exclusions
- Batch mode: logs results for all three playlists (successful/failed counts)

### Job Tracking
- All runs recorded in `job_runs` table with start/finish times and status
- Failed runs include error messages for debugging
- Query job history: `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 10`

### Graceful Shutdown
- SIGTERM/SIGINT handlers in `cli.ts:14-21`
- Cleanly closes database and Plex connections
- Safe for Docker stop/restart

## Genre Enrichment & Multi-Source Merging

### Multi-Source Strategy (genre-enrichment.ts)

The genre enrichment service implements **intelligent multi-source merging** to maximize genre coverage:

**Enrichment Priority:**
1. **Cache** - Check for existing cached genres (90-day TTL)
2. **Plex Metadata** - Local metadata (Genre + Style tags for semantic categories, Mood tags for emotional attributes)
3. **Last.fm** - Community-tagged genres (always attempted, even if Plex has data)
4. **Spotify** - Fallback only if both Plex and Last.fm return nothing (conserves harsh rate limits)

**Merging Behavior:**
- Genres and moods are **merged** from all successful sources
- Deduplication ensures no repeated genres
- Source tracking uses comma-separated format: `"plex,lastfm"` or `"plex,spotify"`
- Combined results cached for 90 days with all sources noted

**Examples:**
- Artist with both Plex and Last.fm: `source: "plex,lastfm"` with merged genres
- Artist with only Last.fm: `source: "lastfm"`
- Artist with no external data: `source: "plex"` (uses Spotify as fallback only if Plex also empty)

**Benefits:**
- **Better coverage**: Plex may have 3 genres, Last.fm adds 5 more → 8 total after dedup
- **Mood preservation**: Only Plex provides moods, always included when available
- **Rate limit friendly**: Spotify only called when Plex + Last.fm both fail

**Album Enrichment:**
- External APIs (Spotify/Last.fm) are **NOT** used for album-level lookups (prevents API thrashing)
- Albums use: Cache → Plex album metadata → fallback to artist genres (which may be multi-source)

## Cache Warming System

### Architecture (cache-cli.ts)

**Incremental Warming** (`warmCache`)
- Fetches all artists from Plex library
- Filters out already-cached artists (90-day TTL)
- Fetches genres from **multiple sources** and merges results (see Multi-Source Strategy above)
- Only processes uncached artists (skip_cached: true by default)
- Tracks sources used per artist for transparency
- Tracked in `job_runs` table with real-time progress updates

**Album Cache Warming** (`warmAlbumCache`)
- Fetches all albums from Plex library (via track enumeration)
- Only uses Plex metadata (no external API calls to avoid thrashing)
- Falls back to artist genres for albums without specific metadata
- Progress tracking shows both metadata fetch and caching phases

**Auto-Refresh** (`refreshExpiringCache`)
- Finds cache entries expiring within 7 days
- Proactively refreshes them to prevent cold-start delays
- Runs daily at 2am (before playlist generation at 5am)

**Rate Limiting** (metadata/providers/spotify.ts, lastfm.ts)
- Very conservative concurrency: 2 concurrent requests for artist cache, 3 for album cache
- Exponential backoff on 429 errors (1s → 2s → 4s → 8s → 16s)
- Respects `Retry-After` headers but **caps retry delays at 5 minutes**
- Global rate limit tracker prevents API hammering
- Note: Spotify can request 50+ minute delays; we cap these to keep cache warming viable

**Scheduled Jobs** (scheduler.ts)
- `cache-warm`: Weekly full warming with multi-source enrichment (Sunday 3am)
- `cache-refresh`: Daily refresh of expiring entries (2am)
- Both tracked in `job_runs` with start/finish times and status
