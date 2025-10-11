# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Brevity is the soul of wit.**

## Project Overview

A TypeScript-based automated Plex playlist generator that creates time-based daily playlists, weekly discovery/throwback playlists, and custom genre/mood playlists using exponential recency weighting, epsilon-greedy selection, and sonic similarity expansion.

**For user-facing documentation:** See [docs/](docs/) directory. This file is for architecture and development.

---

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
plex-playlists run <window>       # Run single window (morning|afternoon|evening|discovery|throwback)
plex-playlists run-all            # Run all three daily playlists sequentially
plex-playlists run discovery      # Generate weekly discovery playlist
plex-playlists run throwback      # Generate weekly throwback playlist
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
   - **Epsilon-greedy strategy**: 85% exploitation (top-scored) + 15% exploration (random diverse)
   - Exploitation phase uses three-pass selection with progressive constraint relaxation:
     - Pass 1: Both genre limit (≤40% per genre) and artist limit (≤2 per artist)
     - Pass 2: Artist limit only
     - Pass 3: No constraints
   - Exploration phase randomly selects diverse tracks (prioritizes new artists/genres)
   - **Cross-playlist exclusions**: Excludes tracks from other playlists in last 7 days
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

**Standard Playlists (Time-based):**
```
HistoryEntry[] → AggregatedHistory[] → CandidateTrack[] → Selected[] → Plex Playlist
                                              ↓
                                     (fallback + sonic expansion if needed)
```

**Discovery Playlist (Weekly):**
```
All Library Tracks → Filter by Last Play > 90 days → Discovery Score → Selected[] → Plex Playlist
```

**Throwback Playlist (Weekly):**
```
History (2-5 years ago) → Aggregate by Track → Filter Recent Plays → Throwback Score → Selected[] → Plex Playlist
```

### Discovery Playlist Algorithm (`playlist/discovery.ts`)

The discovery playlist helps rediscover forgotten gems from your library:

**Strategy:**
- Scans entire music library (not just listening history)
- Filters tracks last played > 90 days ago OR never played
- Scores tracks using: `qualityScore × playCountPenalty × recencyPenalty`

**Scoring Components:**
1. **Quality Score** (0-1): Star rating weight OR play count proxy for unrated tracks
2. **Play Count Penalty** (0-1): `1 - min(playCount, saturation) / saturation` - rewards less-played tracks
3. **Recency Penalty** (0-1): `min(daysSincePlay / 365, 1)` - rewards longer-forgotten tracks

**Benefits:**
- Rediscover high-quality tracks you haven't heard in months
- Surface never-played tracks that might be hidden gems
- Balances quality (ratings) with novelty (forgotten tracks)

### Throwback Playlist Algorithm (`playlist/throwback.ts`)

The throwback playlist brings back nostalgic tracks from your past:

**Strategy:**
- Scans listening history from 2-5 years ago (configurable window)
- Excludes tracks played in last 90 days (maintains freshness)
- Scores tracks using: `nostalgiaWeight × playCountInWindow × qualityScore`

**Scoring Components:**
1. **Nostalgia Weight** (0-1): Older within window = higher score (linear scale)
2. **Play Count Weight** (0-1): Normalized by saturation - rewards frequently played tracks from that era
3. **Quality Score** (0-1): User rating OR play count proxy for unrated tracks

**Benefits:**
- Relive your musical past with tracks you loved years ago
- Automatically surfaces your "favorites from back then"
- Prevents recently played tracks from appearing (maintains novelty)

**Configuration:**
- `THROWBACK_LOOKBACK_START`: 730 days (2 years) - start of lookback window
- `THROWBACK_LOOKBACK_END`: 1825 days (5 years) - end of lookback window
- `THROWBACK_RECENT_EXCLUSION`: 90 days - exclude tracks played recently

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

**Discovery Playlist**:
- `DISCOVERY_CRON`: Cron schedule for weekly discovery playlist (default: `0 6 * * 1` - Monday 6am)
- Rediscovers forgotten gems from your entire library
- Runs weekly to surface tracks you haven't heard in 90+ days

**Throwback Playlist**:
- `THROWBACK_CRON`: Cron schedule for weekly throwback playlist (default: `0 6 * * 6` - Saturday 6am)
- Brings back nostalgic tracks from 2-5 years ago
- Runs weekly to surface tracks you loved in the past but haven't heard recently

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

**Playlist Behavior**:
- `EXPLORATION_RATE`: Percentage of playlist for exploration vs exploitation (default: 0.15 = 15%)
- `EXCLUSION_DAYS`: Days to exclude recently-recommended tracks from new playlists (default: 7)
- `DISCOVERY_DAYS`: Minimum days since last play for discovery playlist (default: 90)
- `THROWBACK_LOOKBACK_START`: Start of throwback window in days (default: 730 = 2 years)
- `THROWBACK_LOOKBACK_END`: End of throwback window in days (default: 1825 = 5 years)
- `THROWBACK_RECENT_EXCLUSION`: Exclude tracks played in last N days from throwback (default: 90)
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

---

## User Documentation

For user-facing documentation, refer users to:
- [README.md](README.md) - Landing page with path chooser
- [docs/docker-guide.md](docs/docker-guide.md) - Docker deployment guide
- [docs/cli-guide.md](docs/cli-guide.md) - CLI installation and usage
- [docs/configuration-reference.md](docs/configuration-reference.md) - All env vars
- [docs/algorithm-explained.md](docs/algorithm-explained.md) - User-friendly algorithm explanation
- [docs/troubleshooting.md](docs/troubleshooting.md) - Docker/CLI troubleshooting
- [docs/importing.md](docs/importing.md) - Rating import guide

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

## Background Job Queue System

### Architecture (queue/job-queue.ts)

**CLI-First Design Principle:**
- Core functions (`warmCache`, `createPlaylistRunner`) are pure and reusable
- CLI calls functions directly (synchronous, immediate execution)
- Web UI routes jobs through queue (asynchronous, concurrency-limited)
- **Same business logic, different routing**

### Job Queue Implementation

**In-Process Queue** (`p-queue`)
- Max concurrency: 2 simultaneous background jobs
- Prevents resource exhaustion during heavy operations
- FIFO ordering (can be extended with priorities later)

**Supported Job Types:**
```typescript
type JobType =
  | { type: 'playlist'; window: PlaylistWindow }
  | { type: 'cache-warm'; concurrency?: number }
  | { type: 'cache-albums'; concurrency?: number }
  | { type: 'custom-playlists' }
```

**Job Lifecycle:**
1. **Enqueue** - Web route calls `jobQueue.enqueue(job)`, returns job ID immediately
2. **Queue** - Job waits in queue until a worker slot is available
3. **Execute** - Worker calls the same core function used by CLI
4. **Track** - Progress updates via `progressTracker`, persisted to `job_runs` table
5. **Complete** - Job status updated to `success` or `failed`, worker slot freed

### Cancellation Support

**AbortSignal Integration:**
- `warmCache()` and `warmAlbumCache()` accept optional `signal?: AbortSignal`
- Checks `signal?.aborted` at strategic points:
  - Before fetching Plex data
  - Before enrichment operations
  - Before cache write operations
- Throws error immediately when cancelled

**Cancel Endpoints:**
- `POST /jobs/:jobId/cancel` - Cancel specific job by ID
- `POST /history/cancel-running` - Cancel all running jobs
- Returns immediately; actual cancellation happens asynchronously

**How It Works:**
```typescript
const abortController = new AbortController();
warmCache({
  concurrency: 2,
  jobId: 123,
  signal: abortController.signal  // Passed to core function
});

// Later, from web UI:
abortController.abort();  // Function checks signal and throws
```

### Queue Management

**Stats Endpoint** (`GET /queue/stats`):
```json
{
  "pending": 3,      // Jobs waiting in queue
  "size": 5,         // Total jobs (pending + active)
  "active": 2,       // Currently executing
  "concurrency": 2   // Max simultaneous jobs
}
```

**Active Job Tracking:**
- Queue maintains `Map<jobId, ActiveJob>` for running jobs
- Each ActiveJob has: `abortController`, `type`, `startedAt`
- Enables cancellation and status queries

### Progress Tracking Integration

**Real-Time Updates** (utils/progress-tracker.ts):
- In-memory progress state with EventEmitter
- SSE streaming to web clients via `/jobs/:jobId/stream`
- Rate-limited DB persistence (every 10% or 30 seconds)
- ETA calculation based on current rate

**Source Tracking** (cache warming only):
```json
{
  "sourceCounts": {
    "plex": 450,
    "lastfm": 320,
    "spotify": 50,
    "cached": 318
  }
}
```

### CLI vs Web Execution Paths

**CLI Path (Direct):**
```typescript
// src/cli.ts
await warmCache({ concurrency: 2, dryRun });
// Runs immediately, blocks until complete, outputs to stdout
```

**Web Path (Queued):**
```typescript
// src/web/routes/actions.ts
const jobId = await jobQueue.enqueue({ type: 'cache-warm', concurrency: 2 });
res.json({ jobId });  // Returns immediately
// Job runs asynchronously in background
// Client monitors progress via SSE: /jobs/:jobId/stream
```

**Scheduler Path (Direct):**
```typescript
// src/scheduler.ts
warmCache({ concurrency: 2, skipCached: true })
// Scheduled jobs run directly (not queued) since they're time-based
```

### Benefits of CLI-First + Queue

✅ **Zero duplication** - Business logic written once
✅ **Consistent behavior** - CLI and web use identical functions
✅ **Easy testing** - Pure functions, no HTTP/queue mocking needed
✅ **Performance** - CLI bypasses queue overhead
✅ **Resource control** - Web UI respects concurrency limits
✅ **Cancellation** - Works transparently via AbortSignal

### Future Extensions

**Retry Logic** (not yet implemented):
- Add retry count and exponential backoff to `JobQueue`
- Configurable max retries per job type
- Automatic retry on transient failures (network errors, rate limits)

**Job Priorities** (not yet implemented):
- Manual jobs > Scheduled jobs > Refresh jobs
- Weighted fair queuing to prevent starvation

**Distributed Queue** (not yet implemented):
- Replace `p-queue` with Redis/BullMQ for multi-instance deployments
- Core functions remain unchanged (CLI-first architecture preserved)
