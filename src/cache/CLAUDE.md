# Cache System Architecture

**For development guidance on cache warming, TTL management, and metadata enrichment.**

See [root CLAUDE.md](../../CLAUDE.md) for project overview and [metadata/CLAUDE.md](../metadata/CLAUDE.md) for provider details.

---

## Overview

The cache system stores artist and album metadata with TTL-based expiration to minimize API calls to Last.fm and Spotify during playlist generation.

**Cache Types:**
- **Artist Cache** (`artist_cache` table) - 180 day TTL with jitter
- **Album Cache** (`album_cache` table) - 90 day TTL with jitter
- **Track Cache** (`track_cache` table) - Tiered: 90 days static, 24 hours stats
- **Audio Features** (`audio_features` table) - From AudioMuse integration

---

## Cache Warming System (cache-cli.ts)

### Incremental Warming (`warmCache`)

Warms artist cache for all artists in Plex library:

**Process:**
1. Fetch all artists from Plex library
2. Filter out already-cached artists (skip_cached: true by default)
3. For each uncached artist:
   - Check cache first (may have been cached since query)
   - Fetch metadata from multiple sources (see Multi-Source Strategy below)
   - Merge results from Plex + Last.fm + Spotify
   - Write to `artist_cache` with TTL
4. Track progress in `job_runs` table with real-time updates

**Features:**
- **Incremental**: Only processes uncached artists
- **Idempotent**: Safe to run multiple times
- **Resumable**: Can be cancelled and resumed later
- **Observable**: Real-time progress via SSE (web UI) or stdout (CLI)
- **Source tracking**: Records which providers were used per artist

**Concurrency:**
- Default: 2 concurrent requests (very conservative)
- Configurable via `CACHE_WARM_CONCURRENCY` env var
- See [metadata/CLAUDE.md](../metadata/CLAUDE.md) for rate limiting details

### Album Cache Warming (`warmAlbumCache`)

Warms album cache for all albums in Plex library:

**Process:**
1. Enumerate all albums via track scanning (Plex doesn't expose album endpoint directly)
2. Deduplicate by artist + album name
3. For each album:
   - Check cache first
   - Fetch from Plex metadata (genres, moods from tags)
   - Fetch from Last.fm (album-specific genres - best source for albums)
   - Merge results (Plex + Last.fm only, Spotify skipped for albums)
   - Write to `album_cache` with 90-day TTL

**Note:** Spotify is explicitly skipped for album enrichment (usually empty, only provides artist-level genres).

### Auto-Refresh (`refreshExpiringCache`)

Proactively refreshes cache entries expiring soon:

**Process:**
1. Query entries expiring within 7 days (`REFRESH_LOOKAHEAD_DAYS`)
2. Limit to `HOURLY_REFRESH_LIMIT` or `DAILY_REFRESH_LIMIT` entries
3. Re-fetch metadata from providers
4. Update cache with new TTL

**Benefits:**
- Prevents cold-start delays during playlist generation
- Distributes API load throughout the day (hourly micro-refreshes)
- Ensures frequently-used entries stay fresh

---

## Multi-Source Strategy (../genre-enrichment.ts)

The genre enrichment service implements **intelligent multi-source merging** to maximize metadata coverage:

**Enrichment Priority:**
1. **Cache** - Check for existing cached genres (90-180 day TTL depending on type)
2. **Plex Metadata** - Local metadata (Genre + Style tags for semantic categories, Mood tags for emotional attributes)
3. **Last.fm** - Community-tagged genres (always attempted, even if Plex has data)
4. **Spotify** - Fallback only if both Plex and Last.fm return nothing (conserves harsh rate limits)

**Merging Behavior:**
- Genres and moods are **merged** from all successful sources
- Deduplication ensures no repeated genres
- Source tracking uses comma-separated format: `"plex,lastfm"` or `"plex,spotify"`
- Combined results cached for 90-180 days with all sources noted

**Examples:**
- Artist with both Plex and Last.fm: `source: "plex,lastfm"` with merged genres
- Artist with only Last.fm: `source: "lastfm"`
- Artist with no external data: `source: "plex"` (uses Spotify as fallback only if Plex also empty)

**Benefits:**
- **Better coverage**: Plex may have 3 genres, Last.fm adds 5 more → 8 total after dedup
- **Mood preservation**: Only Plex provides moods, always included when available
- **Rate limit friendly**: Spotify only called when Plex + Last.fm both fail

**Album Enrichment:**
- Primary source: Last.fm (album-specific genres, best accuracy)
- Secondary source: Plex album metadata
- Tertiary fallback: Artist genres (from artist cache, which may be multi-source)
- Spotify explicitly skipped (provides artist-level only, causes API thrashing)

---

## TTL & Jitter Management (cache-utils.ts)

### Jittered TTL Calculation

To prevent **thundering herd problem** (all cache entries expiring simultaneously), TTL is randomized:

```typescript
// 90 days ± 10% = 81-99 days randomly
const ttl = getJitteredTTL(90, 0.10);
```

**Configuration:**
- `BASE_TTL_DAYS`: 90 days for albums, 180 for artists
- `TTL_JITTER_PERCENT`: 10% variance (±10%)
- Calculated at cache write time, stored in `expires_at` column

### Refresh Strategies

**Lookahead Window:**
- Entries expiring within 7 days are candidates for refresh
- Prevents last-minute API calls during playlist generation

**Usage-Based Prioritization** (Phase 3, not yet implemented):
- Track `last_used_at` timestamp per cache entry
- Prioritize frequently-used entries for refresh
- Three tiers: Hot (30d), Warm (180d), Cold (365d+)

---

## Scheduled Jobs (../scheduler.ts)

**Weekly Full Warming:**
- Cron: `CACHE_WARM_CRON` (default: Sunday 3am)
- Job: `warmCache({ skipCached: true, concurrency: 2 })`
- Incrementally processes only uncached artists
- Tracked in `job_runs` with success/failure status

**Hourly Micro-Refresh:**
- Cron: `CACHE_REFRESH_CRON` (default: every hour)
- Job: `refreshExpiringCache({ limit: 10 })`
- Refreshes 10 entries expiring soonest
- Distributes API load throughout day

**Daily Track Cache Refresh:**
- Cron: `TRACK_CACHE_REFRESH_CRON` (default: 2am)
- Job: Refresh stats tier (24-hour TTL: ratings, play counts)
- Static tier (90-day TTL) only refreshed weekly

---

## CLI vs Web Execution

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
warmCache({ concurrency: 2, skipCached: true });
// Scheduled jobs run directly (not queued) since they're time-based
```

**See:** [queue/CLAUDE.md](../queue/CLAUDE.md) for job queue architecture.

---

## Common Development Patterns

### Adding Cache Statistics

To add new cache metrics to `cache stats` output:

1. Query relevant table in `cache-cli.ts:getStats()`
2. Add metric to returned object
3. Update CLI output formatting in `cli.ts` (cache stats command)
4. Update web UI in `web/views/actions/cache.tsx` (StatsCard component)

### Modifying TTL Duration

1. Update `BASE_TTL_DAYS` in `cache-utils.ts:CACHE_REFRESH_CONFIG`
2. Consider impact on API usage and freshness
3. Adjust `REFRESH_LOOKAHEAD_DAYS` if needed (7 days default)

### Changing Concurrency Limits

**Artist Cache:**
- Edit `CACHE_WARM_CONCURRENCY` in `.env` (default: 2)
- Very conservative due to Spotify rate limits

**Album Cache:**
- Hardcoded to 3 in `warmAlbumCache()` (slightly higher since Last.fm is more permissive)
- Edit directly in `cache-cli.ts` if needed

### Cancellation Support

All cache warming functions accept `signal?: AbortSignal`:

```typescript
const abortController = new AbortController();
warmCache({ concurrency: 2, signal: abortController.signal });

// Later:
abortController.abort(); // Gracefully stops at next check point
```

**Check points:**
- Before fetching Plex data
- Before each enrichment operation
- Before cache write operations

---

## Observability

### Progress Tracking

Real-time progress via `ProgressTracker`:
- In-memory state with EventEmitter
- SSE streaming to web clients
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

### Job History

Query recent cache warming jobs:
```sql
SELECT window, status, started_at, finished_at, progress_current, progress_total
FROM job_runs
WHERE window LIKE 'cache-%'
ORDER BY started_at DESC
LIMIT 10;
```

### Cache Hit Rate

To monitor cache effectiveness:
```sql
-- Total entries by source
SELECT source, COUNT(*) as count
FROM artist_cache
GROUP BY source;

-- Expiring soon (need refresh)
SELECT COUNT(*) as expiring_soon
FROM artist_cache
WHERE expires_at < datetime('now', '+7 days');
```
