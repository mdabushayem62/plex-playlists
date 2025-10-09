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
```

### Database
```bash
npx drizzle-kit generate          # Generate migrations (after schema changes)
npx drizzle-kit studio            # Open Drizzle Studio
# Note: Migrations run automatically on app startup
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
- `history_cache`: Cached 30-day play counts per window (unused in current flow but schema exists)
- `job_runs`: Job execution history (start, finish, status, errors)

**Note**: Migrations run automatically on first database connection (`db/index.ts:runMigrations()`)

## Configuration

All config via environment variables (validated with `envalid` in `config.ts`):

- `PLEX_BASE_URL`: Plex server URL (required)
- `PLEX_AUTH_TOKEN`: Plex X-Plex-Token (required)
- `DATABASE_PATH`: SQLite file path (default: `./data/plex-playlists.db`)
- `MORNING_CRON`, `AFTERNOON_CRON`, `EVENING_CRON`: Cron schedules (defaults: 6am, 12pm, 6pm)
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

Uses Vitest with expected coverage:
- Unit tests: ~90% (selection logic, scoring, time calculations)
- Integration tests: ~9% (Plex client + SQLite with mocks)
- E2E: ~1% (optional staging Plex smoke tests)

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
The playlist runner (`playlist-runner.ts:50-165`) logs detailed metrics at each stage:
- History retrieval: entry count, unique tracks
- Candidate pool: total candidates, sources (history vs fallback)
- Selection: initial selection size, sonic expansion usage
- Final metrics: playlist size, candidate sources, cross-playlist exclusions

### Job Tracking
- All runs recorded in `job_runs` table with start/finish times and status
- Failed runs include error messages for debugging
- Query job history: `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 10`

### Graceful Shutdown
- SIGTERM/SIGINT handlers in `cli.ts:14-21`
- Cleanly closes database and Plex connections
- Safe for Docker stop/restart
