# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Brevity is the soul of wit.**

## Project Overview

A TypeScript-based automated Plex playlist generator that creates time-based daily playlists, weekly discovery/throwback playlists, and custom genre/mood playlists using exponential recency weighting, epsilon-greedy selection, and sonic similarity expansion.

**For user-facing documentation:** See [docs/](docs/) directory.

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
                                  # Warm artist cache for all Plex artists
                                  # Default concurrency: 2 (very conservative to avoid rate limits)
                                  # Skips already-cached artists (incremental)
                                  # Tracked in job_runs table
plex-playlists cache stats        # Show cache statistics (total, by source, expiring)
plex-playlists cache clear [--all]# Clear expired (or all) cache entries
```

---

## Architecture Guide

Domain-specific documentation for deep dives:

### [Playlist Generation](src/playlist/CLAUDE.md)
- Core pipeline (history → candidates → selection → Plex)
- Scoring strategies (balanced, quality, discovery, throwback)
- Discovery & throwback algorithms
- Epsilon-greedy selection with constraints
- Sonic expansion & fallback strategies

### [Cache System](src/cache/CLAUDE.md)
- Cache warming (artist, album, track)
- Multi-source merging (Plex + Last.fm + Spotify)
- TTL & jitter management
- Incremental warming & auto-refresh
- CLI vs Web vs Scheduler execution paths

### [Database](src/db/CLAUDE.md)
- Schema overview (playlists, caches, jobs, settings)
- Migrations workflow
- Repository patterns
- Query examples
- Performance optimization

### [Job Queue](src/queue/CLAUDE.md)
- CLI-first design principle
- Background job queueing (p-queue, max 2 concurrent)
- Progress tracking & SSE streaming
- Cancellation via AbortSignal
- Future extensions (retry, priorities, distributed)

### [Metadata Providers](src/metadata/CLAUDE.md)
- Provider hierarchy (Cache → Plex → Last.fm → Spotify)
- Rate limiting strategies per provider
- Multi-source merging details
- Artist vs album enrichment
- Concurrency configuration

### [Web UI](src/web/CLAUDE.md)
- Routes structure (dashboard, actions, playlists, config, analytics)
- Views architecture (Kitajs/html TSX)
- SSE for real-time progress
- Form handling & progressive enhancement
- Pico CSS styling patterns

---

## Configuration

All config via environment variables (validated with `envalid` in `config.ts`):

**Required:**
- `PLEX_BASE_URL`: Plex server URL
- `PLEX_AUTH_TOKEN`: Plex X-Plex-Token

**Optional:**
- `DATABASE_PATH`: SQLite file path (default: `./data/plex-playlists.db`)
- `LASTFM_API_KEY`: Last.fm API key (for genre enrichment)
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: Spotify API (for genre enrichment)
- `AUDIOMUSE_DB_HOST`: AudioMuse PostgreSQL host (for audio features)

**Full reference:** [docs/configuration-reference.md](docs/configuration-reference.md)

---

## Import Patterns

Uses ES modules with `.js` extensions in import paths (required for Node ESM):

```typescript
import { logger } from './logger.js';
import type { PlaylistWindow } from './windows.js';
```

TypeScript compiles `.ts` → `.js`, but imports must reference `.js`.

---

## Testing

Uses Vitest following testing pyramid principles:
- **Unit tests (~90%)**: Selection logic, scoring algorithms, time calculations, aggregation
- **Integration tests (~9%)**: Database migrations, Plex client interactions, caching, job tracking
- **E2E (~1%)**: Optional staging Plex smoke tests

All tests run automatically on commit via Husky pre-commit hooks (lint → test → build)

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

---

## Common Development Patterns

### Plex API Interactions
- Client singleton: `getPlexServer()` in `plex/client.ts` (uses LRU cache)
- Extend `@ctrl/plex` types as needed (e.g., audio playlist support)
- Always use `ratingKey` as primary identifier (string format)

### Graceful Shutdown
- SIGTERM/SIGINT handlers in `cli.ts:14-21`
- Cleanly closes database and Plex connections
- Safe for Docker stop/restart

### Observability
- **Structured Logging**: Playlist runner logs detailed metrics at each stage
- **Job Tracking**: All runs recorded in `job_runs` table with start/finish times and status
- **Query History**: `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 10`
