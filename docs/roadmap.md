# Roadmap

This document outlines the vision, completed features, and planned improvements for Plex Playlist Enhancer.

## Vision

Build the ultimate self-hosted music playlist automation tool that rivals Spotify's algorithmic playlists while maintaining full ownership of your data and infrastructure.

---

## Completed ✅

### Core Features

- [x] **Time-windowed daily playlists** - Three daily playlists (morning, afternoon, evening) based on listening patterns
- [x] **Custom playlists** - Genre/mood combination playlists via web UI with database-backed configuration
- [x] **Cross-playlist deduplication** - Prevents duplicate tracks across daily playlists
- [x] **Sonic similarity expansion** - Uses Plex's audio analysis to expand playlists beyond listening history
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

### Developer Experience

- [x] **Comprehensive test coverage** - Unit tests for core business logic, integration tests for database and caching
- [x] **TypeScript with strict mode** - Full type safety across codebase
- [x] **Pre-commit hooks** - Automated linting, testing, and build checks via Husky
- [x] **Database migrations** - Automatic schema migrations with Drizzle ORM
- [x] **Docker support** - Full containerization with docker-compose
- [x] **Graceful shutdown** - Proper SIGTERM/SIGINT handling

---

## In Progress 🚧

Nothing currently in active development.

---

## Planned

### High Priority

#### UI/UX Improvements
- [ ] **Fix "Generate now" for custom playlists** - "Generate now" button does not trigger playlist creation
- [ ] **Prominent post-creation playlist generation** - Make "Generate now" more prominent/default action after creating a new custom playlist
- [ ] **Dark mode toggle** - User preference for light/dark themes
- [ ] **Responsive mobile layout** - Better mobile experience for playlist management
- [ ] **Playlist preview** - Preview tracks before committing to Plex
- [ ] **Drag-and-drop playlist reordering** - Manual track ordering in custom playlists
- [ ] **Bulk playlist operations** - Enable/disable/delete multiple playlists at once
- [ ] **Settings validation feedback** - Real-time validation in configuration editor
- [ ] **Toast notifications** - Success/error notifications for user actions
- [ ] **Loading states** - Better visual feedback during async operations

#### Playlist Description Updates
- [ ] **Dynamic playlist descriptions** - Update Plex playlist descriptions when regenerating
  - Show last updated timestamp
  - Show generation parameters (genres, moods, time window)
  - Show track count and duration
  - Example: `"🎨 Chill Electronic • 50 tracks • Updated 2025-10-10 17:30 • Genres: electronic, ambient • Moods: chill, mellow"`

#### Background Job System
- [ ] **Move playlist generation to background workers** - Non-blocking playlist generation
  - Replace synchronous generation with job queue
  - Real-time progress updates via WebSocket or SSE
  - Ability to cancel running jobs
  - Job history and retry mechanism
  - Multiple concurrent playlist generation
- [ ] **Job queue dashboard** - View pending/running/completed jobs with cancel/retry actions

### Medium Priority

#### Genre Management
- [ ] **Genre ignore/blocklist** - Exclude specific genres from playlist generation
  - Global ignore list (applies to all playlists)
  - Per-playlist ignore list (custom playlist overrides)
  - UI for managing ignored genres
  - Persist in database alongside settings
  - Example use case: Exclude "Christmas" genre year-round

#### Playlist Features
- [ ] **Custom playlist artwork** - Generate cover art from album covers or genre themes
  - Mosaic of album covers from playlist tracks
  - Genre-themed color gradients
  - Upload custom artwork
- [ ] **Playlist export** - Export playlists to standard formats
  - M3U/M3U8 export with file paths
  - Spotify playlist export (reverse sync)
  - CSV export with metadata
- [ ] **Smart playlist templates** - Pre-configured playlist templates
  - "Discover Weekly" - High-rated but rarely played tracks
  - "Throwback" - Older tracks from listening history
  - "Deep Cuts" - Album tracks with low play counts
  - "Genre Explorer" - Expand into adjacent genres

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

#### Integrations
- [ ] **Last.fm scrobbling** - Submit plays to Last.fm as playlists are generated
- [ ] **Playlist.com integration** - Cross-platform playlist sharing
- [ ] **Webhooks** - Trigger external actions on playlist generation
  - Discord/Slack notifications
  - IFTTT integration
  - Home Assistant notifications

#### Developer Experience
- [ ] **E2E test suite** - Playwright tests for web UI
- [ ] **Performance profiling** - Identify and optimize bottlenecks in selection algorithm
- [ ] **CLI progress bars** - Better visual feedback for long-running operations
- [ ] **Plugin system** - Allow custom scoring algorithms and filters

---

## Upstream Library Issues (@ctrl/plex)

These are limitations in the `@ctrl/plex` library that we're working around. Consider contributing PRs upstream:

### Critical Bugs
- [ ] **server.history() ignores librarySectionId parameter** - [Issue to be created]
  - **Impact**: History queries return ALL media types (movies, TV, music) instead of filtering to requested library section
  - **Workaround**: Direct API query to `/status/sessions/history/all?librarySectionID=X` (src/history/history-service.ts:103-135)
  - **Evidence**: Raw API works correctly when passing `librarySectionID` parameter
  - **Upstream PR**: Should fix parameter passing in PlexServer.history() method

### Missing Features
- [ ] **No audio playlist creation support** - [Issue to be created]
  - **Impact**: Cannot use library methods to create/manage audio playlists
  - **Workaround**: Direct API POST to `/playlists?type=audio&...` (src/plex/playlists.ts:21-51)
  - **Upstream PR**: Add AudioPlaylist class and createAudioPlaylist() method to PlexServer

- [ ] **No playlist update/summary methods** - [Issue to be created]
  - **Impact**: Cannot update playlist title, description, or other metadata
  - **Workaround**: Direct API PUT to `/playlists/{ratingKey}?title=...&summary=...` (src/plex/playlists.ts:53-71)
  - **Upstream PR**: Add updatePlaylist() method to Playlist class

### Performance Issues
- [ ] **Default timeout too short for large libraries** - [Issue to be created]
  - **Impact**: Requests timeout when fetching thousands of tracks from large music libraries
  - **Workaround**: Override timeout to 120000ms (2 minutes) in PlexServer constructor (src/plex/client.ts:21)
  - **Default**: 30000ms (30 seconds)
  - **Upstream PR**: Increase default timeout to 60-120 seconds, or add per-method timeout overrides

### Documentation Gaps
- [ ] **History API pagination behavior undocumented**
  - Container-based pagination (`X-Plex-Container-Size`, `X-Plex-Container-Start`) not explained
  - MediaContainer response structure not typed

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
