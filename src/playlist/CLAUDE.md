# Playlist Generation Architecture

**For development guidance on playlist generation, scoring, and selection strategies.**

See [root CLAUDE.md](../../CLAUDE.md) for project overview and setup.

---

## Core Pipeline (playlist-runner.ts)

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

7. **Playlist Creation** (`../plex/playlists.ts`)
   - Deletes existing playlist for window (if exists)
   - Creates new Plex audio playlist with formatted title and summary
   - Summary format: `"Morning 06:00-11:59 • Generated 2025-10-08 17:30"`

8. **Persistence** (`../db/repository.ts`)
   - Saves playlist metadata, tracks, and job status to SQLite
   - Tracks job history for observability

---

## Key Data Flow

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

**Custom Playlists (Genre/Mood):**
```
Recent History (30d) → Quality-First Score → Genre/Mood Filter → Selected[]
                                    ↓ (if insufficient)
                 Library History (10y) → Quality-First Score → Genre/Mood Filter → Selected[] → Plex Playlist
```

---

## Discovery Playlist Algorithm (discovery.ts)

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

---

## Throwback Playlist Algorithm (throwback.ts)

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

---

## Scoring System (../scoring/)

**Architecture:**

All scoring strategies are centralized in the `scoring/` directory:
- `types.ts`: Type definitions for strategies and scoring components
- `strategies.ts`: Implementations of all 4 scoring algorithms
- `config.ts`: Strategy registry, metadata, and default weights
- `weights.ts`: Base component functions (recency, rating, playCount)

**Available Strategies:**

1. **Balanced** (`'balanced'`) - Default for daily playlists
   - User-friendly name: "Recent Favorites"
   - Formula: `0.7 × recency + 0.3 × (0.6 × rating + 0.4 × playCount)`
   - Prioritizes recently played tracks with quality consideration
   - Configured via `HALF_LIFE_DAYS` (default: 7 days)

2. **Quality** (`'quality'`) - Default for custom playlists
   - User-friendly name: "Top Rated"
   - Formula: `0.6 × rating + 0.3 × playCount + 0.1 × recency`
   - Prioritizes track quality (ratings + plays) over recency
   - Best for genre/mood playlists where quality matters most

3. **Discovery** (`'discovery'`) - Weekly discovery playlist
   - User-friendly name: "Rediscovery"
   - Formula: `qualityScore × playCountPenalty × recencyPenalty`
   - Surfaces forgotten gems (high-rated, low-played, long-unplayed)
   - Configured via `DISCOVERY_DAYS` (default: 90 days minimum)

4. **Throwback** (`'throwback'`) - Weekly nostalgia playlist
   - User-friendly name: "Nostalgia"
   - Formula: `nostalgiaWeight × playCountWeight × qualityScore`
   - Brings back tracks from 2-5 years ago that you loved back then
   - Configured via `THROWBACK_LOOKBACK_START/END` (default: 2-5 years)

**Usage:**
```typescript
import { calculateScore } from './scoring/strategies.js';

const result = calculateScore('balanced', {
  userRating: 8,      // 0-10 scale
  playCount: 15,
  lastPlayedAt: new Date('2025-10-01')
});

console.log(result.finalScore);        // 0.85
console.log(result.components.recencyWeight);  // 0.92
```

**Strategy Selection:**
- Daily playlists (morning/afternoon/evening): `'balanced'`
- Custom playlists (genre/mood): `'quality'`
- Discovery playlist: `'discovery'`
- Throwback playlist: `'throwback'`
- Can be configured per-playlist in Phase 2 (database-driven)

---

## Common Development Patterns

### Working with Scoring Strategies

**Adding a New Strategy:**
1. Add strategy type to `ScoringStrategy` union in `../scoring/types.ts`
2. Implement calculation function in `../scoring/strategies.ts`
3. Add metadata to `STRATEGY_REGISTRY` in `../scoring/config.ts`
4. Add user-friendly name to `ScoringStrategyNames` mapping
5. Update `calculateScore()` switch statement

**Modifying Existing Strategy:**
1. Locate strategy function in `../scoring/strategies.ts` (e.g., `calculateBalancedScore`)
2. Adjust weight constants or formula
3. Update metadata in `../scoring/config.ts` if formula changed
4. Update documentation if user-facing changes

**Adding New Scoring Components:**
1. Add base component function to `../scoring/weights.ts` (e.g., `normalizePopularity`)
2. Update `ScoringComponents` interface in `../scoring/types.ts` if needed
3. Use component in strategy functions as needed

**Note:** All scoring is now centralized. Avoid duplicating scoring logic in playlist-specific files.

### Modifying Selection Constraints

- Artist/genre limits: See `selectWithConstraints()` in `selector.ts`
- Pass configuration: Modify `passes` array in `selectPlaylistTracks()`

### Changing Time Windows

- Update `DEFAULT_WINDOWS` in `windows.ts`
- Ensure cron schedules align with new windows in `.env`

---

## Observability

### Structured Logging

The playlist runner logs detailed metrics at each stage:
- History retrieval: entry count, unique tracks
- Candidate pool: total candidates, sources (history vs fallback)
- Selection: initial selection size, sonic expansion usage
- Final metrics: playlist size, candidate sources, cross-playlist exclusions
- Batch mode: logs results for all three playlists (successful/failed counts)

### Job Tracking

- All runs recorded in `job_runs` table with start/finish times and status
- Failed runs include error messages for debugging
- Query job history: `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 10`
