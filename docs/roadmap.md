# Roadmap

This document outlines the vision, completed features, and planned improvements for Plex Playlist Enhancer.

## Vision

Build the ultimate self-hosted music playlist automation tool that rivals Spotify's algorithmic playlists while maintaining full ownership of your data and infrastructure.

---

## Completed ✅

### Core Features

- [x] **Time-windowed daily playlists** - Three daily playlists (morning, afternoon, evening) based on listening patterns
- [x] **Discovery playlist** - Weekly playlist surfacing forgotten gems from library (tracks not played in 90+ days)
- [x] **Throwback playlist** - Weekly nostalgia playlist from 2-5 years ago (configurable lookback window)
- [x] **Custom playlists** - Genre/mood combination playlists via web UI with database-backed configuration
- [x] **Cross-playlist deduplication** - Prevents duplicate tracks across daily playlists
- [x] **Sonic similarity expansion** - Uses Plex's audio analysis to expand playlists beyond listening history
- [x] **Epsilon-greedy selection** - Balanced 85% exploitation (favorites) + 15% exploration (variety) with configurable rate
- [x] **Multi-pass selection algorithm** - Progressive constraint relaxation (genre limits → artist limits → no constraints)
- [x] **Configurable playlist size and artist limits** - Via `PLAYLIST_TARGET_SIZE` and `MAX_PER_ARTIST`

### Metadata & Enrichment

- [x] **Rating import** - Import from Spotify (CSV via Exportify) and YouTube Music (JSON via Google Takeout)
- [x] **Multi-source genre/mood enrichment** - Intelligent merging from Plex + Last.fm + Spotify with source tracking
- [x] **Genre/mood caching** - 90-day TTL cache with pre-warming support and expiration refresh
- [x] **Mood discovery** - Automatic discovery of dominant moods from highly-rated tracks

### Web UI & User Experience

- [x] **Web UI dashboard** - Browser-based interface for setup and management
- [x] **Setup wizard** - First-time configuration flow for onboarding
- [x] **Configuration editor** - Edit environment variables via web UI
- [x] **Analytics dashboard** ("Nerd Lines") - Genre distribution, listening patterns, time-of-day heatmap, diversity metrics
- [x] **Real-time job monitoring** - Progress tracking for cache warming and playlist generation
- [x] **Custom playlist builder** - UI for creating genre/mood combination playlists

### Background Job System

- [x] **Background job queue** - In-process queue for non-blocking playlist generation and cache warming
  - Job queue with concurrency control (max 2 simultaneous background jobs)
  - Non-blocking enqueue (returns job ID immediately)
  - Real-time progress updates via Server-Sent Events (SSE)
  - Ability to cancel running jobs (individual or all)
  - Job history with filtering and pagination
  - Queue stats dashboard (pending, active, completed jobs)
  - AbortSignal integration for graceful cancellation
  - ETA calculation based on progress rate

### Developer Experience

- [x] **Comprehensive test coverage** - Unit tests for core business logic, integration tests for database and caching
- [x] **TypeScript with strict mode** - Full type safety across codebase
- [x] **Pre-commit hooks** - Automated linting, testing, and build checks via Husky
- [x] **Database migrations** - Automatic schema migrations with Drizzle ORM
- [x] **Docker support** - Full containerization with docker-compose
- [x] **Graceful shutdown** - Proper SIGTERM/SIGINT handling

### Playlist Features

- [x] **"Generate now" for custom playlists** - Trigger immediate playlist generation from web UI
- [x] **Dynamic playlist descriptions** - Automatic description updates showing track count, duration, genres/moods, and timestamp
- [x] **Playlist export** - Export playlists to M3U and CSV formats with full metadata

### UI/UX Features

- [x] **Toast notifications** - Success/error/warning/info notifications with auto-dismiss and HTMX integration
- [x] **Responsive mobile layout** - Mobile-friendly navigation, tables, and breakpoints for better mobile experience

---

## In Progress 🚧

Nothing currently in active development.

---

## Planned

### High Priority

#### UI/UX Improvements
- [ ] **Dark mode toggle** - User preference for light/dark themes
- [ ] **Playlist preview** - Preview tracks before committing to Plex
- [ ] **Drag-and-drop playlist reordering** - Manual track ordering in custom playlists
- [ ] **Bulk playlist operations** - Enable/disable/delete multiple playlists at once
- [ ] **Settings validation feedback** - Real-time validation in configuration editor
- [ ] **Loading states** - Better visual feedback during async operations

#### Background Job System Enhancements
- [ ] **Automatic retry mechanism** - Retry failed jobs with exponential backoff
  - Configurable max retries per job type
  - Automatic retry on transient failures (network errors, rate limits)
  - Manual retry from job history UI
- [ ] **Job priorities** - Priority queue for different job types
  - Manual jobs > Scheduled jobs > Refresh jobs
  - Weighted fair queuing to prevent starvation
- [ ] **Per-job-type concurrency limits** - Independent concurrency for playlist vs cache jobs
  - Allow playlists and cache warming to run simultaneously
  - Prevent one job type from monopolizing the queue

### Medium Priority

#### Genre Management
- [ ] **Genre ignore/blocklist** - Exclude specific genres from playlist generation
  - Global ignore list (applies to all playlists)
  - Per-playlist ignore list (custom playlist overrides)
  - UI for managing ignored genres
  - Persist in database alongside settings
  - Example use case: Exclude "Christmas" genre year-round

#### Playlist Features
- [ ] **Smart playlist templates** - Pre-configured playlist templates
  - "Deep Cuts" - Album tracks with low play counts
  - "Genre Explorer" - Expand into adjacent genres
  - "Seasonal Mixes" - Mood/energy shifts by season

#### Advanced Filtering
- [ ] **Advanced mood filtering** - Energy level and tempo-based filtering using Plex audio analysis
  - Filter by BPM range
  - Filter by energy/danceability scores
  - Filter by valence (musical positivity)
  - Combine with existing genre/mood filters
- [ ] **Date range filters** - Filter history by custom date ranges
  - "Tracks I listened to in 2023"
  - "Summer vibes" (June-August history)
- [ ] **Star rating filters** - Min/max star rating constraints for playlists
- [ ] **Play count filters** - Min/max play count constraints

### Low Priority

#### Multi-User Support
- [ ] **Per-user playlists and configuration** - Full multi-user support
  - User authentication system
  - Per-user playlist preferences
  - Per-user listening history isolation
  - Admin interface for user management
  - Shared vs. private playlists

#### Analytics & Insights
- [ ] **Listening trends over time** - Historical listening pattern visualization
  - Genre evolution charts
  - Mood shifts over time
  - Discovery rate (new vs. familiar tracks)
- [ ] **Recommendation engine insights** - Explain why tracks were selected
  - Show recency weight, fallback score, and final score per track
  - "You played this 5 times last week" explanations
  - Similar tracks analysis
- [ ] **Library health metrics** - Insights into library metadata quality
  - Tracks missing genres/moods
  - Low-rated tracks (potential for cleanup)
  - Duplicate detection

---

## Rejected / Out of Scope

These ideas have been considered but are not planned:

- **Streaming service integration** - Out of scope; Plex is the only supported backend
- **Mobile native apps** - Web UI is sufficient; responsive design preferred over native apps
- **Collaborative playlists** - Too complex for self-hosted use case
- **AI-powered recommendations** - Prefer algorithmic transparency over black-box ML models

---

## Contributing

Have an idea not listed here? Open an issue on GitHub to discuss! Contributions are welcome for any items on this roadmap.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.
