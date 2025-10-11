# Algorithm Explained

Deep dive into how playlists are generated, scored, and selected.

---

## Overview

Plex Playlist Enhancer uses a sophisticated multi-stage pipeline to generate playlists that balance your preferences with discovery:

1. **History Analysis** - Analyze listening patterns by time window
2. **Candidate Scoring** - Score tracks using recency, ratings, and play counts
3. **Epsilon-Greedy Selection** - Balance exploitation (favorites) and exploration (variety)
4. **Sonic Expansion** - Fill gaps with similar tracks using Plex audio analysis
5. **Cross-Playlist Deduplication** - Prevent repetition across playlists

---

## Playlist Types

### Time-Based Daily Playlists

**Morning (6-11am), Afternoon (12-5pm), Evening (6-11pm)**

- Analyzes last 30 days of listening history
- Filters by time window to match your listening habits
- Uses epsilon-greedy selection (85% exploitation, 15% exploration)
- Cross-playlist deduplication for 7 days

**Philosophy:** If you always listen to upbeat music in the morning, the algorithm learns and adapts.

### Discovery Playlist (Weekly)

**Surfaces forgotten gems from your library**

- Scans entire library (not just history)
- Filters tracks last played >90 days ago (or never played)
- Scores by quality (ratings) balanced with novelty (time since play)
- No epsilon-greedy (pure quality-based selection)

**Philosophy:** Rediscover high-quality tracks buried in your library.

### Throwback Playlist (Weekly)

**Nostalgic tracks from 2-5 years ago**

- Analyzes listening history from 2-5 years ago window
- Excludes tracks played in last 90 days (maintains freshness)
- Scores using nostalgia × play frequency × quality
- No epsilon-greedy (pure nostalgia-optimized selection)

**Philosophy:** Relive your "favorites from back then" that you haven't heard recently.

---

## Scoring System

### Time-Based Playlists

Each candidate track gets a **Final Score**:

```
Final Score = (0.7 × Recency Weight) + (0.3 × Fallback Score)
```

#### Recency Weight (70% of score)

Exponential decay favoring recently played tracks:

```
Recency Weight = exp(-ln(2) × days_since_play / HALF_LIFE_DAYS)
```

**Configurable:** `HALF_LIFE_DAYS` (default: 7)

**Examples (7-day half-life):**
- Played today: 100% weight
- Played 7 days ago: 50% weight
- Played 14 days ago: 25% weight
- Played 30 days ago: ~4% weight

**Why exponential?** Your music taste changes gradually. Recent plays are strong signals.

#### Fallback Score (30% of score)

Quality signal from ratings and play counts:

```
Fallback Score = (0.6 × normalized_star_rating) + (0.4 × normalized_play_count)
```

- **Star ratings:** 0-5 scale normalized to [0, 1]
- **Play counts:** Saturated at `PLAY_COUNT_SATURATION` (default: 25) to prevent over-played dominance

**Why fallback?** Ensures high-quality tracks with sparse listening history aren't ignored.

---

### Discovery Playlist

Different scoring optimized for rediscovery:

```
Discovery Score = quality_score × play_count_penalty × recency_penalty
```

#### Quality Score (0-1)
- Primary: Star rating weight (if rated)
- Fallback: Play count proxy for unrated tracks

#### Play Count Penalty (0-1)
```
Play Count Penalty = 1 - min(play_count, saturation) / saturation
```
Rewards less-played tracks.

#### Recency Penalty (0-1)
```
Recency Penalty = min(days_since_play / 365, 1)
```
Rewards tracks you haven't heard in ages.

**Result:** High-quality forgotten tracks bubble to the top.

### Throwback Playlist

Different scoring optimized for nostalgia:

```
Throwback Score = nostalgia_weight × play_count_weight × quality_score
```

#### Nostalgia Weight (0-1)
Linear scale within the lookback window (older = higher score):
```
Nostalgia Weight = (days_since_play - LOOKBACK_START) / (LOOKBACK_END - LOOKBACK_START)
```
**Example:** Track played 3 years ago scores higher than one from 2 years ago.

#### Play Count Weight (0-1)
Normalized play count in the throwback window:
```
Play Count Weight = min(play_count_in_window / saturation, 1.0)
```
Rewards tracks you listened to frequently "back then."

#### Quality Score (0-1)
- Primary: Star rating weight (if rated)
- Fallback: Play count proxy for unrated tracks (capped at 0.6)

**Configurable:**
- `THROWBACK_LOOKBACK_START`: 730 days (2 years)
- `THROWBACK_LOOKBACK_END`: 1825 days (5 years)
- `THROWBACK_RECENT_EXCLUSION`: 90 days

**Result:** Your favorites from 2-5 years ago that you haven't played recently.

---

## Selection Algorithm

### Epsilon-Greedy Strategy (Time-Based Only)

Balances **exploitation** (known good tracks) and **exploration** (variety):

```
85% exploitation: Top-scored tracks
15% exploration: Random diverse tracks
```

**Configurable:** `EXPLORATION_RATE` (default: 0.15)

#### Exploitation Phase (85%)

Three-pass selection with progressive constraint relaxation:

**Pass 1: Both Constraints**
- Genre limit: ≤40% per genre (`MAX_GENRE_SHARE`)
- Artist limit: ≤2 tracks per artist (`MAX_PER_ARTIST`)

**Pass 2: Artist Limit Only**
- If pass 1 didn't hit target, relax genre constraint
- Still respect artist limit

**Pass 3: No Constraints**
- If still under target, add top-scored tracks without limits

**Why multi-pass?** Ensures variety when possible, quality when necessary.

#### Exploration Phase (15%)

Randomly selects diverse tracks:
- Prioritizes new artists (not yet in playlist)
- Prioritizes under-represented genres
- Random selection from remaining candidates

**Why exploration?** Prevents playlists from becoming too predictable. Surfaces hidden gems.

### Special Playlists (No Epsilon-Greedy)

**Discovery and Throwback playlists use pure scoring:**
- Top-scored candidates only
- Artist/genre constraints applied
- No randomization (want best quality/nostalgia matches)

**Why no epsilon-greedy?** These playlists already focus on discovery/variety, so exploration phase is unnecessary.

---

## Fallback Strategy

If insufficient candidates from listening history:

1. Fetch high-rated tracks from Plex library (4+ stars)
2. Fetch frequently-played tracks (>10 plays)
3. Merge with primary candidates (deduplicate by `ratingKey`)
4. Score using fallback formula

**Limit:** `FALLBACK_LIMIT` (default: 200) to prevent Plex API timeouts

**Why needed?** New users or sparse listening history need baseline tracks.

---

## Sonic Expansion

If playlist still under target size after selection:

1. Select seed tracks from current playlist (top-scored)
2. Query Plex `sonicallySimilar` API with seeds
3. Filter out:
   - Already selected tracks
   - Excluded tracks (from other playlists)
4. Add similar tracks until target reached

**Target:** `PLAYLIST_TARGET_SIZE` (default: 50)

**Why Plex sonic?** Uses acoustic analysis (tempo, key, timbre) for musically coherent expansion.

---

## Cross-Playlist Deduplication

Prevents repetition across daily playlists:

1. Track all playlists generated in last `EXCLUSION_DAYS` (default: 7)
2. Exclude tracks from other playlists during selection
3. Ensures morning, afternoon, evening have unique tracks

**Configurable:** `EXCLUSION_DAYS` (default: 7)

**Example:** Track in Monday morning playlist won't appear in Monday afternoon/evening or Tuesday playlists for 7 days.

---

## Genre Enrichment

Multi-source strategy for rich metadata:

### Priority Order

1. **Cache** - Check 90-day TTL cache
2. **Plex Metadata** - Genre, Style, Mood tags from Plex
3. **Last.fm** - Community-tagged genres (always attempted if API key provided)
4. **Spotify** - Fallback if Plex + Last.fm return nothing

### Merging Strategy

Genres and moods **merged** from all successful sources:
- Plex: `["rock", "alternative"]` + Moods: `["energetic"]`
- Last.fm: `["indie rock", "post-punk"]`
- **Result:** `["rock", "alternative", "indie rock", "post-punk"]` + `["energetic"]`

**Deduplication:** Removes exact duplicates, preserves variations

**Source tracking:** `source: "plex,lastfm"` for transparency

**Why multi-source?** Maximizes genre coverage. Plex metadata often sparse, APIs fill gaps.

---

## Constraints

### Genre Limit

**Maximum percentage of playlist from single genre**

- Default: 40% (`MAX_GENRE_SHARE=0.4`)
- Example: 50-track playlist → max 20 tracks of "rock"
- Applied in exploitation phase, pass 1

**Why?** Prevents genre dominance, ensures diversity.

### Artist Limit

**Maximum tracks per artist**

- Default: 2 (`MAX_PER_ARTIST=2`)
- Applied in exploitation phases (passes 1-2)

**Why?** Avoids "greatest hits of one artist" playlists.

### Exclusion Window

**Days to exclude tracks from other playlists**

- Default: 7 days (`EXCLUSION_DAYS=7`)
- Tracks in recent playlists filtered out during selection

**Why?** Freshness. No one wants to hear the same 50 songs daily.

---

## Tuning Guide

### More Variety

```bash
MAX_GENRE_SHARE=0.3         # Lower genre limit (30%)
MAX_PER_ARTIST=1            # One track per artist
EXPLORATION_RATE=0.25       # More exploration (25%)
```

### Favor Recent Plays

```bash
HALF_LIFE_DAYS=3            # Faster recency decay
EXPLORATION_RATE=0.10       # Less exploration
```

### Favor Ratings

```bash
HALF_LIFE_DAYS=14           # Slower recency decay
PLAY_COUNT_SATURATION=50    # Higher play count cap
```

### More Discovery

```bash
DISCOVERY_DAYS=60           # Shorter threshold (60 days)
EXCLUSION_DAYS=14           # Longer exclusion window
```

### Longer Throwback Window

```bash
THROWBACK_LOOKBACK_START=1095   # 3 years ago
THROWBACK_LOOKBACK_END=2555     # 7 years ago
THROWBACK_RECENT_EXCLUSION=180  # Exclude last 6 months
```

---

## Example Walkthrough

**Scenario:** Generating morning playlist (6-11am)

**Step 1: History Analysis**
- Fetch 30 days of listening history
- Filter: Only plays between 6-11am
- Result: 342 history entries, 215 unique tracks

**Step 2: Candidate Scoring**
- Track A: Last played 2 days ago, 5 stars, 15 plays
  - Recency: `exp(-ln(2) × 2/7) = 0.81` (81%)
  - Fallback: `(0.6 × 1.0) + (0.4 × 0.6) = 0.84` (84%)
  - **Final: `(0.7 × 0.81) + (0.3 × 0.84) = 0.82`**

- Track B: Last played 20 days ago, 4 stars, 30 plays
  - Recency: `exp(-ln(2) × 20/7) = 0.14` (14%)
  - Fallback: `(0.6 × 0.8) + (0.4 × 1.0) = 0.88` (88%)
  - **Final: `(0.7 × 0.14) + (0.3 × 0.88) = 0.36`**

**Step 3: Selection (Epsilon-Greedy)**
- **Exploitation (42 tracks):** Top-scored with genre/artist constraints
- **Exploration (8 tracks):** Random diverse tracks
- Total: 50 tracks

**Step 4: Sonic Expansion**
- Target met, skip expansion

**Step 5: Playlist Creation**
- Delete old "🌅 Daily Morning Mix" playlist
- Create new playlist with 50 tracks
- Summary: "Morning 06:00-11:59 • Generated 2025-10-11 08:30"
- Persist to database with track scores

**Step 6: Cross-Playlist Tracking**
- Save track IDs to exclude from afternoon/evening playlists
- Exclusion expires in 7 days

---

## Related Configuration

See [Configuration Reference](configuration-reference.md) for all tuning parameters:
- Scoring: `HALF_LIFE_DAYS`, `PLAY_COUNT_SATURATION`
- Selection: `EXPLORATION_RATE`, `MAX_GENRE_SHARE`, `MAX_PER_ARTIST`
- Discovery: `DISCOVERY_DAYS`
- Throwback: `THROWBACK_LOOKBACK_START`, `THROWBACK_LOOKBACK_END`, `THROWBACK_RECENT_EXCLUSION`
- Behavior: `EXCLUSION_DAYS`, `PLAYLIST_TARGET_SIZE`
