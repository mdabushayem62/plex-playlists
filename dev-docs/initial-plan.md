# Plex Playlist Enhancer — Initial Plan

## Objectives
- Generate three Plex music playlists per day (morning, afternoon, evening), each with 50 tracks drawn from historical listening during the same time period.
- Enforce freshness, artist/genre balance, and smooth sonic transitions using Plex’s native `sonicallySimilar` endpoint.
- Persist playlist runs, selected tracks, and cached history in SQLite for observability and reuse.
- Deliver fast feedback via a testing pyramid: ~90 % unit coverage, ~9 % integration (SQLite + Plex mocks), ~1 % optional smoke against a staging Plex server.

## Feature Slice (Phase 1)
1. **Scheduler**
   - Cron-style runner (likely `node-cron`) triggering morning/afternoon/evening jobs.
   - Time windows use the container/system `TZ`; defaults: morning 06:00–11:59, afternoon 12:00–17:59, evening 18:00–23:59 (overridable via config).

2. **Plex Integration**
   - Adopt `@ctrl/plex` for authenticated access.
   - Required calls: library sections, listening history (`server.history`), metadata fetch, `Audio.sonicallySimilar`.
   - Extend or wrap playlist APIs to support audio playlists (potential upstream contribution).

3. **Selection Pipeline**
   - Retrieve 30 days of historical plays for the current window; expect healthy data volume.
   - Re-score candidates by recency using an exponential half-life curve: `recencyWeight = exp(-ln(2) * daysSincePlay / halfLifeDays)` with default half-life of 7 days (≈4 % weight at 30 days). Curve remains configurable.
   - Apply artist cap (≤2 per playlist) and genre cap of 40 % per single genre to avoid over-representation.
   - Backfill via `sonicallySimilar` anchored to seed tracks; widen `maxDistance` only if the playlist is short.
   - If the window has no history within 30 days, fall back to high star-rated and frequently played tracks.
   - Deduplicate across the day’s other playlists before finalizing.

4. **Persistence (SQLite)**
   - Tables: `playlists`, `playlist_tracks`, `history_cache`, `jobs`.
   - Use `better-sqlite3` for synchronous access; manage migrations with `drizzle-orm`/`drizzle-kit`.
   - Cache Plex history responses to reduce API load and store fallback scoring inputs (star ratings, play counts).
   - Fallback scoring baseline: `0.6 * normalizedStarRating + 0.4 * normalizedPlayCount`, where star ratings are scaled to `[0,1]` and play counts saturate at a configurable cap (default 25 plays).

5. **Playlist Delivery**
   - Replace the entire playlist for each window daily; store Plex `ratingKey` per window for reuse.
   - Attach summaries describing the generation window and last refresh time (custom artwork deferred).

6. **Configuration & Logging**
   - Single-user MVP: credentials supplied via env/config (reuse Overseerr-style login flow if expanded later).
   - Environment management with `dotenv` + `envalid` (or `zod` schemas).
   - Structured logging through `pino`, with child loggers per job execution.
7. **Deployment**
   - CLI entry point for manual runs and testing in a homelab environment.
   - Docker image for long-running service mode, respecting host `TZ` and minimal footprint.

## Library Choices
- Core HTTP/Plex: `@ctrl/plex` (plus upstream extension for audio playlists if needed).
- SQLite: `better-sqlite3` + `drizzle-orm`.
- Scheduling: `node-cron`.
- Config validation: `dotenv`, `envalid` (or `zod` reused for response guards).
- Logging: `pino` (+ `pino-pretty` for dev).
- Utilities: `date-fns`, `lru-cache`, `lodash-es`, `uuid`.
- Testing: `vitest` (unit focus), `msw`/`nock` for Plex stubs, in-memory SQLite or temporary files for integration tests.

## Testing Strategy
- **Unit (≈90 %)** — Pure logic around selection heuristics, playlist assembly, time-slot calculations. Use fixtures and deterministic RNG seeds.
- **Integration (≈9 %)** — Plex client wrapper + SQLite repository with HTTP mocks; ensure correct API paths, persistence, and playlist mutation workflows.
- **End-to-End (≈1 %)** — Optional manual smoke against a staging Plex instance before release.

## Open Questions / Next Discussions
- Confirm decay formula (linear vs. exponential) around the 50 % @ 7-day target.
- Define weighting between star rating and play count during fallback selection.
- Observability beyond console logs (alerts, metrics) for future phases.
