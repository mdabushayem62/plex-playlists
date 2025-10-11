# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-10-11

### Major Features

#### 🎵 Discovery & Throwback Playlists
- **Discovery Playlist**: Weekly playlist that surfaces tracks you haven't heard in 90+ days
  - Scans entire library history to find forgotten gems
  - Scores based on quality (ratings) balanced with novelty (time since last play)
  - Configurable via `DISCOVERY_DAYS` and `DISCOVERY_CRON` environment variables
  - See src/playlist/discovery.ts:34-205
- **Throwback Playlist**: Weekly playlist featuring nostalgic tracks from 2-5 years ago
  - Analyzes listening history from 2-5 years ago window
  - Excludes recently played tracks to maintain freshness
  - Scores using nostalgia weight × play count × quality
  - Configurable via `THROWBACK_LOOKBACK_START/END` and `THROWBACK_RECENT_EXCLUSION`
  - See src/playlist/throwback.ts:34-231

#### 🎨 Custom Playlists (Genre/Mood Combinations)
- **Playlist Builder UI**: Web interface for creating custom genre/mood playlists
  - Create playlists with 0-2 genres AND 0-2 moods (e.g., "Chill Electronic", "Dark Synthwave")
  - Visual mood/genre selector with emoji support
  - Custom scheduling (weekly/daily) or on-demand generation
  - Stored in database with full CRUD operations
  - See src/web/views/playlists/builder.tsx:1-379

#### 🤖 Playlist Recommendations
- **Smart Recommendations Engine**: Analyzes listening history to suggest custom playlists
  - Identifies your favorite genres based on play patterns and ratings
  - Recommends mood-based playlists from your library
  - Finds complementary genre combinations you enjoy
  - Surfaces underexplored genres for discovery
  - See src/playlist/recommendations.ts:61-517

#### 📊 Analytics Dashboard
- **Library Statistics**: Visualize your music collection
  - Genre distribution with interactive charts
  - Mood distribution from Plex metadata
  - Top artists by play count
  - Recent listening activity
  - See src/web/views/dashboard.tsx:1-343

#### 🎯 Mood-Based Filtering
- **Mood Support**: First-class mood support throughout the codebase
  - Moods extracted from Plex metadata (separate from genres)
  - Stored in genre cache alongside genres
  - Used in custom playlists and candidate filtering
  - See src/db/schema.ts:56 (moods field added to genre cache)

#### ⚡ Background Job Queue
- **Job Queue System**: Asynchronous job processing for long-running tasks
  - In-process queue using `p-queue` (max concurrency: 2)
  - Job types: playlist generation, cache warming, album caching
  - Progress tracking with real-time updates
  - Cancellation support via AbortSignal
  - CLI-first architecture (same functions, different routing)
  - See src/queue/job-queue.ts:1-183

### Enhancements

#### Selection Algorithm Improvements
- **Epsilon-Greedy Selection**: Balanced exploration vs exploitation
  - 85% exploitation (top-scored tracks) + 15% exploration (diverse random selection)
  - Configurable via `EXPLORATION_RATE` environment variable
  - Exploration phase prioritizes diversity (new artists/genres)
  - See src/playlist/selector.ts:137-237

#### Playlist Metadata
- **Enhanced Playlist Descriptions**: Rich metadata in Plex playlist summaries
  - Total duration in hours:minutes format
  - Track count and date generated
  - Discovery stats (days since play averages)
  - Throwback stats (nostalgia window info)
  - See src/plex/playlists.ts:19-67

#### Cache Management
- **Cache Utilities Module**: Centralized cache TTL and refresh strategies
  - Jittered TTL to prevent thundering herd (90 days ±10%)
  - Usage-based refresh prioritization (hot/warm/cold tiers)
  - Batch refresh limits (daily: 250, hourly: 10)
  - See src/cache/cache-utils.ts:1-110

#### Progress Tracking
- **Real-Time Progress Updates**: Track long-running operations
  - Progress stored in database (`job_runs` table)
  - Server-Sent Events (SSE) streaming to web UI
  - ETA calculations based on current rate
  - Source tracking for cache warming (plex/lastfm/spotify/cached counts)
  - See src/utils/progress-tracker.ts:1-263

### Architecture Changes

#### Window System Refactor
- **Special Windows Type**: Separate type for discovery/throwback playlists
  - `TimeWindow` for daily time-based playlists (morning/afternoon/evening)
  - `SpecialWindow` for weekly special playlists (discovery/throwback)
  - `CacheWindow` for maintenance jobs
  - Custom playlists now stored in database (not in window definitions)
  - Deprecated `GenreWindow` type removed
  - See src/windows.ts:1-80

#### Database Schema Updates
- **New Tables**:
  - `custom_playlists`: User-defined genre/mood playlists with scheduling
  - Includes: name, genres[], moods[], enabled, cron, targetSize, description
- **Schema Enhancements**:
  - Added `moods` field to `genre_cache` table (JSON array)
  - Added `moods` field to `album_genre_cache` table
  - Added `lastUsedAt` timestamp to both cache tables (for usage-based refresh)
  - See drizzle/0012_fancy_unicorn.sql

#### Utility Functions
- **Duration Formatting**: Human-readable duration display
  - `formatDuration()`: Convert milliseconds to "Xh Ym" format
  - `calculateTotalDuration()`: Sum track durations from Plex Track[] array
  - See src/utils/format-duration.ts:1-34

### Documentation

#### New Documentation
- **[Algorithm Explained](docs/algorithm-explained.md)**: User-friendly explanation of scoring and selection
- **[CLI Guide](docs/cli-guide.md)**: Comprehensive CLI setup and usage
- **[Docker Guide](docs/docker-guide.md)**: Docker deployment with web UI
- **[Configuration Reference](docs/configuration-reference.md)**: All environment variables documented
- **API Setup Guides**: Moved Last.fm and Spotify guides to `docs/api-setup/` directory

#### Updated Documentation
- **README.md**: Complete rewrite with feature matrix and path chooser
- **Troubleshooting.md**: Streamlined common issues and solutions
- **Importing.md**: Updated rating import guide with clearer instructions

### Configuration

#### New Environment Variables
- `DISCOVERY_CRON`: Schedule for discovery playlist (default: `0 6 * * 1` - Monday 6am)
- `DISCOVERY_DAYS`: Minimum days since last play for discovery (default: 90)
- `THROWBACK_CRON`: Schedule for throwback playlist (default: `0 6 * * 6` - Saturday 6am)
- `THROWBACK_LOOKBACK_START`: Start of throwback window in days (default: 730 = 2 years)
- `THROWBACK_LOOKBACK_END`: End of throwback window in days (default: 1825 = 5 years)
- `THROWBACK_RECENT_EXCLUSION`: Exclude tracks played recently (default: 90 days)
- `EXPLORATION_RATE`: Percentage for exploration vs exploitation (default: 0.15 = 15%)

#### Removed Configuration
- **playlists.config.json**: Deprecated in favor of database-driven custom playlists
- **playlists.config.schema.json**: Removed with config file deprecation
- File-based genre playlist configuration replaced by web UI

### Dependencies

#### New Dependencies
- `p-queue@9.0.0`: Background job queue for async task processing
- `chart.js@4.5.0`: Analytics dashboard charting
- `uuid@11.0.3`: Job ID generation

### Web UI Improvements

#### Playlists Page
- Added custom playlist management UI
- Playlist builder with genre/mood selection
- Schedule configuration per playlist
- Enable/disable toggles for playlists

#### Dashboard Page
- Added analytics charts (genre/mood distribution)
- Top artists display
- Recent listening activity
- Library statistics overview

#### Configuration Page
- Removed deprecated file-based playlist config section
- Streamlined settings management
- Better error handling and validation

### Code Quality

#### Type Safety
- Fixed 11 ESLint errors (removed `any` types)
- Added proper Track types from `@ctrl/plex`
- Added DatabaseClient and schema types to cache utilities
- All tests passing (146/146)

#### Testing
- Added job queue tests (cancellation, progress tracking)
- Added format-duration utility tests
- Updated history service tests for new window types
- 100% passing test suite maintained

### Developer Experience

#### CLAUDE.md Updates
- Added comprehensive queue system documentation
- Documented CLI-first architecture pattern
- Added mood-based filtering patterns
- Updated job queue usage examples
- Added progress tracking integration guide

### Bug Fixes
- Fixed drizzle-orm imports (removed unused `isNotNull`, `gt`, `lte`)
- Fixed where clause in cache-utils to use `eq()` helper
- Fixed history type mismatches in discovery/throwback/recommendations
- Fixed track metadata type in discovery and throwback trackMaps

### Breaking Changes

⚠️ **Configuration File Removal**
- `playlists.config.json` and `playlists.config.schema.json` removed
- Existing genre playlists must be recreated via web UI as custom playlists
- Migration: Use web UI playlist builder to recreate any file-based genre playlists

⚠️ **GenreWindow Type Deprecated**
- `GenreWindow` type removed from codebase
- `getGenreWindows()` now returns empty array
- Custom playlists are stored in database, not returned by window functions

### Performance

#### Cache Warming
- Album cache warming now uses progress tracking (2-phase: metadata fetch + cache write)
- Optimized metadata fetching with 100 concurrent requests
- Better memory management (clear Plex genre/mood maps after use)

#### Playlist Generation
- Discovery playlist uses history API (no full library scan)
- Throwback playlist uses history API with date filtering
- Reduced redundant track fetching via metadata extraction from history

---

## [0.1.0] - 2025-10-08

### Initial Release
- Time-based daily playlists (morning, afternoon, evening)
- Exponential recency weighting with configurable half-life
- Star rating and play count scoring
- Epsilon-greedy selection algorithm
- Cross-playlist deduplication (7-day window)
- Sonic similarity expansion
- Multi-source genre enrichment (Plex, Last.fm, Spotify)
- SQLite database with Drizzle ORM
- Web UI with setup wizard
- Docker support with docker-compose
- Rating import from Spotify and YouTube Music CSV exports
- Automatic cache warming and refresh
- Job execution tracking
- Settings management via web UI

---

## Links
- [Repository](https://github.com/aceofaces/plex-playlists)
- [Documentation](docs/)
- [Issues](https://github.com/aceofaces/plex-playlists/issues)
