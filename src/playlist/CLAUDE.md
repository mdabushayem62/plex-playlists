# Playlist Generation - Development Patterns

**Development guidance for working with playlist generation code.**

See [root CLAUDE.md](../../CLAUDE.md) for project-wide rules.

---

## Core Pipeline (Read This First)

**Entry point:** `playlist-runner.ts` - `DailyPlaylistRunner` class

**Flow:**
```
History → Aggregate → Build Candidates → Select → Fallback/Expand → Create Plex Playlist → Save to DB
```

**Key files:**
- `history-service.ts` - Fetch Plex history by time window
- `aggregate.ts` - Group by track, compute play counts
- `candidate-builder.ts` - Score tracks for selection
- `selector.ts` - Epsilon-greedy selection with constraints
- `fallback.ts` - High-rated/frequent tracks if insufficient candidates
- `sonic-expander.ts` - Plex `sonicallySimilar` API for expansion

---

## Working with Scoring

**Location:** `../scoring/` directory

**To modify existing strategy:**
1. Find function in `strategies.ts` (e.g., `calculateBalancedScore`)
2. Adjust weight constants
3. Update tests in `__tests__/`
4. Run `npm test` to verify

**To add new strategy:**
1. Add type to `ScoringStrategy` union in `types.ts`
2. Implement function in `strategies.ts`
3. Add to `calculateScore()` switch statement
4. Add metadata to `STRATEGY_REGISTRY` in `config.ts`
5. Add tests

**Common pattern:**
```typescript
import { calculateScore } from './scoring/strategies.js';

const result = calculateScore('balanced', {
  userRating: 8,
  playCount: 15,
  lastPlayedAt: new Date('2025-10-01')
});
```

---

## Selection Constraints (Critical)

**Three-pass relaxation prevents deadlock** - See `selector.ts:selectPlaylistTracks()`

**Passes:**
1. Genre ≤40% AND artist ≤2 tracks
2. Artist ≤2 tracks only
3. No constraints (fallback)

**To modify constraints:**
- Edit `passes` array in `selectPlaylistTracks()`
- Update `selectWithConstraints()` logic
- Test with small candidate pools (edge case)

**Critical:** Pass 3 is required - without it, selection fails on small pools

---

## Epsilon-Greedy Selection

**Dynamic exploration rate:** Context-aware calculation (10-20%)

**Formula** (implemented in `calculateExplorationRate()`):
```typescript
Baseline: 15%
+3% if library >10,000 tracks (more to explore)
+3% if skip rate >30% (user wants variety)
-3% if has enabled discovery playlist (dedicated discovery exists)
Clamped to [10%, 20%]
```

**Possible rates:**
- Minimum: 10% (5 exploration tracks per 50-track playlist)
- Baseline: 15% (7-8 exploration tracks)
- Maximum: 20% (10 exploration tracks)

**Context factors:**
- **Library size:** Query `getTotalTrackCount()` from track_cache table
- **Skip rate:** Last 7 days from `adaptive_skip_events` (returns 0 if adaptive disabled)
- **Discovery playlist:** Checks `custom_playlists` for enabled discovery strategy

**Override:** Set `SelectionContext.explorationRate` to use fixed rate instead of dynamic

**Debugging:**
- Check logs for "calculated dynamic exploration rate" message
- Shows library size, skip rate, and final calculated rate
- Falls back to 15% baseline on any errors

**To tune:**
- Adjust thresholds in `calculateExplorationRate()` function
- Change library size threshold (currently 10,000)
- Change skip rate threshold (currently 0.30 = 30%)
- Change adjustment amounts (currently ±3%)

**Testing:** Run `npm test -- selector.test.ts` to verify formula logic

---

## Common Development Patterns

### Adding a New Playlist Type

1. Add window definition to `windows.ts`
2. Implement runner in `playlist-runner.ts` or separate file
3. Add CLI command in `cli.ts`
4. Add scoring strategy if needed (see "Working with Scoring")
5. Add tests for new logic

**Example:** Discovery and throwback have separate files (`discovery.ts`, `throwback.ts`)

### Debugging Selection Issues

**Check these in order:**
1. Candidate pool size (`logger` output in `candidate-builder.ts`)
2. Scoring distribution (add debug logs in `strategies.ts`)
3. Selection constraints (pass counts in `selector.ts`)
4. Cross-playlist exclusions (check `getRecentPlaylistTracks()` output)

**Common causes:**
- Candidate pool too small → fallback not triggered
- All candidates fail constraints → need Pass 3
- Scoring heavily skewed → check weight constants

### Working with History Windows

**Time windows:** Defined in `windows.ts`

**To add new window:**
1. Add to `DEFAULT_WINDOWS` object
2. Update CLI command parsing
3. Update cron schedules in `.env` if automated

**Gotcha:** Hour boundaries are inclusive on start, exclusive on end (6-11 means 6:00-11:59)

---

## Testing Patterns

**Unit tests:** Scoring logic, aggregation, time calculations
**Integration tests:** Database persistence, Plex API mocking
**Manual testing:** Run with real Plex server

**To test locally:**
```bash
npm run dev -- run morning        # Single playlist
npm run dev -- run-all            # All three daily
npm run dev -- cache warm         # Warm cache first
```

**Check output:**
- Candidate pool size (should be 100+)
- Final playlist size (target: 50)
- Selection pass distribution (mostly Pass 1, some Pass 2, rare Pass 3)

---

## File Organization

**Core logic:**
- `playlist-runner.ts` - Orchestration
- `candidate-builder.ts` - Scoring and candidate pool
- `selector.ts` - Selection with constraints
- `aggregate.ts` - History grouping

**Strategies:**
- `fallback.ts` - Insufficient candidate handling
- `sonic-expander.ts` - Plex API expansion
- `discovery.ts` - Discovery playlist (weekly, high-rated long-unplayed tracks)
- `throwback.ts` - Throwback playlist (weekly, nostalgia from 2-5 years ago)

**Scoring:**
- `../scoring/strategies.ts` - All scoring implementations
- `../scoring/weights.ts` - Component functions
- `../scoring/types.ts` - Type definitions

---

## When Working on This Code

**Refer to:**
- Existing tests for expected behavior
- `strategies.ts` for scoring examples
- `selector.ts` for constraint patterns

**Don't assume:**
- Scoring is optimal (requires production testing and tuning)
- Selection constraints are perfect (edge cases may exist)
- Documentation is always up to date (code is truth)
