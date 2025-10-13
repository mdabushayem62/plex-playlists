# AudioMuse-AI Integration Guide

## Overview

AudioMuse-AI provides **local audio analysis** that replaces what Spotify's API used to offer (shut down Nov 2024). It extracts audio features using Librosa and ONNX, storing results in PostgreSQL.

**Current Status:**
- ✅ AudioMuse analyzing your library
- ✅ Database accessible via PostgreSQL
- ✅ Tracks analyzed with full audio features
- ✅ Integration complete with plex-playlists

---

## What AudioMuse Provides

### Available Audio Features

**Musical Attributes:**
- `tempo` (float): Beats per minute (range: 27.6-208.3 BPM, avg: 123.1)
- `key` (string): Musical key (C, D, E, F, G, A, B)
- `scale` (string): Major or minor
- `energy` (float 0-1): Track intensity (range: 0.6%-47.5%, avg: 19.8%)

**Mood Vector** (top 5 moods with confidence scores):
```
ambient:0.562, electronic:0.552, experimental:0.538, instrumental:0.532, rock:0.530
```

Available moods include: electronic (79%), rock (47%), ambient (44%), instrumental (34%), dance (34%), electronica (34%), and 29 others.

**Other Features** (0-1 scale):
- `danceable`: How suitable for dancing
- `aggressive`: Intensity/aggression level
- `happy`: Musical positivity (equivalent to Spotify's valence)
- `party`: Party suitability
- `relaxed`: Calm/chill level
- `sad`: Melancholic quality

**Embeddings:**
- 200-dimensional sonic fingerprint vectors
- Stored in `embedding` table for similarity matching
- Indexed with Voyager for fast nearest-neighbor search

### Database Schema

```sql
-- Score table (918 tracks)
CREATE TABLE score (
  item_id TEXT PRIMARY KEY,       -- Navidrome track ID
  title TEXT,                     -- Track title
  author TEXT,                    -- Artist name
  tempo REAL,                     -- BPM
  key TEXT,                       -- Musical key
  scale TEXT,                     -- major/minor
  mood_vector TEXT,               -- Comma-separated "mood:confidence" pairs
  energy REAL,                    -- 0-1 intensity
  other_features TEXT             -- Comma-separated "feature:value" pairs
);

-- Embedding table (918 tracks)
CREATE TABLE embedding (
  item_id TEXT PRIMARY KEY,       -- References score.item_id
  embedding BYTEA                 -- 200-dim vector as binary
);

-- Playlist table (generated playlists)
CREATE TABLE playlist (
  id INTEGER PRIMARY KEY,
  playlist_name TEXT,
  item_id TEXT,                   -- Track ID
  title TEXT,
  author TEXT
);
```

---

## Integration Architecture

### Challenge: Mapping AudioMuse → Plex

**Problem:** AudioMuse uses `item_id` from Navidrome, Plex uses `ratingKey`. We need to map between them.

### Solution 1: Via Navidrome API (Recommended)

**Strategy:**
1. Query Navidrome API with `item_id` to get file path
2. Match file path to Plex track using `Media[0].Part[0].file`

**Navidrome API:**
```typescript
// Navidrome REST API (Subsonic-compatible)
GET /rest/getSong.view?id={item_id}&u={username}&p={password}&v=1.16.1&c=plex-playlists&f=json

Response:
{
  "subsonic-response": {
    "song": {
      "id": "cO4ANOLQ0a8oj7mU8EFBoQ",
      "title": "Dark Universe Fanfare",
      "artist": "Danny Elfman",
      "path": "Danny Elfman/Dark Universe Fanfare/01 Dark Universe Fanfare.flac",
      "duration": 322,
      // ... other fields
    }
  }
}
```

**Implementation:**
```typescript
// src/audiomuse/navidrome-client.ts
export async function getTrackFilePath(itemId: string): Promise<string | null> {
  const response = await fetch(
    `${NAVIDROME_URL}/rest/getSong.view?` +
    `id=${itemId}&u=${NAVIDROME_USER}&p=${NAVIDROME_PASSWORD}&` +
    `v=1.16.1&c=plex-playlists&f=json`
  );
  const data = await response.json();
  return data['subsonic-response']?.song?.path || null;
}
```

### Solution 2: Direct Metadata Matching (Fallback)

**Strategy:**
Match by `title` + `author` when file path matching fails.

**Implementation:**
```typescript
// src/audiomuse/matcher.ts
export async function matchByMetadata(
  title: string,
  author: string
): Promise<string | null> {
  // Search Plex for track with matching title/artist
  // Return ratingKey if found
}
```

**Limitations:**
- Multiple versions (remixes, live versions) may exist
- Less reliable than file path matching
- Use only as fallback

---

## Integration Implementation Plan

### Phase 1: Database Schema Extension

Add `audio_features` table to store AudioMuse data:

```sql
-- Migration: Add audio_features table
CREATE TABLE audio_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rating_key TEXT NOT NULL UNIQUE,        -- Plex track ID
  audiomuse_item_id TEXT,                 -- AudioMuse/Navidrome ID
  file_path TEXT,                         -- For verification

  -- Musical attributes
  tempo REAL,
  key TEXT,
  scale TEXT,
  energy REAL,

  -- Mood vector (stored as JSON)
  mood_vector TEXT,

  -- Other features (stored as JSON)
  other_features TEXT,

  -- Metadata
  source TEXT DEFAULT 'audiomuse',
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rating_key) REFERENCES playlist_tracks(rating_key)
);

CREATE INDEX idx_audio_features_rating_key ON audio_features(rating_key);
CREATE INDEX idx_audio_features_audiomuse_id ON audio_features(audiomuse_item_id);
CREATE INDEX idx_audio_features_file_path ON audio_features(file_path);

-- Index for feature-based queries
CREATE INDEX idx_audio_features_energy ON audio_features(energy);
CREATE INDEX idx_audio_features_tempo ON audio_features(tempo);
```

### Phase 2: Navidrome Client

Implement client to fetch file paths from Navidrome:

```typescript
// src/audiomuse/navidrome-client.ts
import got from 'got';
import { APP_ENV } from '../config.js';

interface NavidromeSong {
  id: string;
  title: string;
  artist: string;
  path: string;
  duration: number;
}

export class NavidromeClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url;
    this.username = username;
    this.password = password;
  }

  async getSong(itemId: string): Promise<NavidromeSong | null> {
    try {
      const response = await got.get(`${this.baseUrl}/rest/getSong.view`, {
        searchParams: {
          id: itemId,
          u: this.username,
          p: this.password,
          v: '1.16.1',
          c: 'plex-playlists',
          f: 'json'
        },
        timeout: { request: 5000 }
      }).json<any>();

      return response['subsonic-response']?.song || null;
    } catch (error) {
      console.error(`Failed to fetch song ${itemId} from Navidrome:`, error);
      return null;
    }
  }
}

export function getNavidromeClient(): NavidromeClient {
  return new NavidromeClient(
    APP_ENV.NAVIDROME_URL,
    APP_ENV.NAVIDROME_USER,
    APP_ENV.NAVIDROME_PASSWORD
  );
}
```

### Phase 3: AudioMuse Client

Connect to AudioMuse PostgreSQL and fetch audio features:

```typescript
// src/audiomuse/client.ts
import postgres from 'postgres';
import { APP_ENV } from '../config.js';

export interface AudioMuseTrack {
  itemId: string;
  title: string;
  author: string;
  tempo: number | null;
  key: string | null;
  scale: string | null;
  energy: number | null;
  moodVector: Map<string, number>;  // mood -> confidence
  features: Map<string, number>;    // feature -> value
}

const sql = postgres({
  host: APP_ENV.AUDIOMUSE_DB_HOST,
  port: APP_ENV.AUDIOMUSE_DB_PORT,
  database: APP_ENV.AUDIOMUSE_DB_NAME,
  username: APP_ENV.AUDIOMUSE_DB_USER,
  password: APP_ENV.AUDIOMUSE_DB_PASSWORD
});

export async function getAudioFeatures(itemId: string): Promise<AudioMuseTrack | null> {
  const results = await sql`
    SELECT * FROM score WHERE item_id = ${itemId}
  `;

  if (results.length === 0) return null;

  const track = results[0];

  // Parse mood_vector: "ambient:0.562,electronic:0.552,..."
  const moodVector = new Map<string, number>();
  if (track.mood_vector) {
    track.mood_vector.split(',').forEach((pair: string) => {
      const [mood, confidence] = pair.split(':');
      moodVector.set(mood, parseFloat(confidence));
    });
  }

  // Parse other_features: "danceable:0.44,aggressive:0.11,..."
  const features = new Map<string, number>();
  if (track.other_features) {
    track.other_features.split(',').forEach((pair: string) => {
      const [feature, value] = pair.split(':');
      features.set(feature, parseFloat(value));
    });
  }

  return {
    itemId: track.item_id,
    title: track.title,
    author: track.author,
    tempo: track.tempo,
    key: track.key,
    scale: track.scale,
    energy: track.energy,
    moodVector,
    features
  };
}

export async function getAllAudioFeatures(): Promise<AudioMuseTrack[]> {
  const results = await sql`SELECT * FROM score`;
  return results.map(track => {
    // Same parsing logic as above
    // ...
  });
}
```

### Phase 4: Mapping Service

Create service to map AudioMuse tracks to Plex tracks:

```typescript
// src/audiomuse/mapping-service.ts
import { getPlexServer } from '../plex/client.js';
import { getNavidromeClient } from './navidrome-client.js';
import { getAudioFeatures } from './client.js';
import { db } from '../db/index.js';

export async function syncAudioFeatures(): Promise<void> {
  console.log('Starting AudioMuse → Plex sync...');

  const audioMuseTracks = await getAllAudioFeatures();
  const navidrome = getNavidromeClient();
  const plex = await getPlexServer();

  let mapped = 0;
  let failed = 0;

  for (const audioMuseTrack of audioMuseTracks) {
    try {
      // Get file path from Navidrome
      const navidromeSong = await navidrome.getSong(audioMuseTrack.itemId);
      if (!navidromeSong) {
        console.warn(`Could not fetch Navidrome song for ${audioMuseTrack.itemId}`);
        failed++;
        continue;
      }

      // Find matching Plex track by file path
      // This requires fetching all Plex tracks and comparing Media[0].Part[0].file
      const plexTrack = await findPlexTrackByFilePath(navidromeSong.path);

      if (!plexTrack) {
        console.warn(`No Plex match for ${navidromeSong.path}`);
        failed++;
        continue;
      }

      // Store in audio_features table
      await db.run(
        `INSERT OR REPLACE INTO audio_features (
          rating_key, audiomuse_item_id, file_path, tempo, key, scale, energy,
          mood_vector, other_features, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          plexTrack.ratingKey,
          audioMuseTrack.itemId,
          navidromeSong.path,
          audioMuseTrack.tempo,
          audioMuseTrack.key,
          audioMuseTrack.scale,
          audioMuseTrack.energy,
          JSON.stringify(Object.fromEntries(audioMuseTrack.moodVector)),
          JSON.stringify(Object.fromEntries(audioMuseTrack.features))
        ]
      );

      mapped++;
    } catch (error) {
      console.error(`Error syncing ${audioMuseTrack.itemId}:`, error);
      failed++;
    }
  }

  console.log(`Sync complete: ${mapped} mapped, ${failed} failed`);
}
```

### Phase 5: Enhanced Scoring Strategies

Extend scoring to use audio features:

```typescript
// src/scoring/strategies.ts

export function calculateMoodScore(
  input: ScoringInput,
  audioFeatures?: AudioMuseTrack,
  targetMood?: string
): ScoringResult {
  const baseScore = calculateQualityScore(input);

  if (!audioFeatures || !targetMood) return baseScore;

  // Boost tracks matching target mood
  const moodConfidence = audioFeatures.moodVector.get(targetMood) || 0;
  const moodBoost = 1 + (moodConfidence * 0.5); // Up to +50% boost

  return {
    finalScore: baseScore.finalScore * moodBoost,
    components: {
      ...baseScore.components,
      moodMatch: moodConfidence
    }
  };
}

export function calculateEnergyScore(
  input: ScoringInput,
  audioFeatures?: AudioMuseTrack,
  targetEnergy?: { min: number; max: number }
): ScoringResult {
  const baseScore = calculateQualityScore(input);

  if (!audioFeatures || !targetEnergy) return baseScore;

  const energy = audioFeatures.energy || 0.5;
  const inRange = energy >= targetEnergy.min && energy <= targetEnergy.max;
  const energyBoost = inRange ? 1.3 : 0.7; // 30% boost if in range, 30% penalty if not

  return {
    finalScore: baseScore.finalScore * energyBoost,
    components: {
      ...baseScore.components,
      energy: energy,
      energyMatch: inRange ? 1 : 0
    }
  };
}
```

### Phase 6: Mood-Based Playlists

Create new playlist types based on audio features:

```typescript
// src/playlist/mood-builder.ts

export interface MoodPlaylistConfig {
  mood: string;              // "electronic", "rock", "ambient", etc.
  energyRange?: [number, number];  // [0.2, 0.5] for chill, [0.7, 1.0] for intense
  tempoRange?: [number, number];   // [60, 90] for slow, [120, 180] for fast
  features?: Map<string, [number, number]>; // danceable: [0.7, 1.0], happy: [0.5, 1.0]
  targetSize: number;        // 50
}

export async function buildMoodPlaylist(
  config: MoodPlaylistConfig
): Promise<SelectedTrack[]> {
  // Fetch candidates from history with audio features
  const candidates = await getCandidatesWithAudioFeatures();

  // Filter by mood and feature criteria
  const filtered = candidates.filter(track => {
    if (!track.audioFeatures) return false;

    // Check mood match
    const moodConfidence = track.audioFeatures.moodVector.get(config.mood) || 0;
    if (moodConfidence < 0.5) return false;

    // Check energy range
    if (config.energyRange) {
      const energy = track.audioFeatures.energy || 0;
      if (energy < config.energyRange[0] || energy > config.energyRange[1]) return false;
    }

    // Check tempo range
    if (config.tempoRange) {
      const tempo = track.audioFeatures.tempo || 0;
      if (tempo < config.tempoRange[0] || tempo > config.tempoRange[1]) return false;
    }

    // Check other features
    if (config.features) {
      for (const [feature, [min, max]] of config.features) {
        const value = track.audioFeatures.features.get(feature) || 0;
        if (value < min || value > max) return false;
      }
    }

    return true;
  });

  // Score using mood-aware strategy
  const scored = filtered.map(track => ({
    ...track,
    score: calculateMoodScore(track, track.audioFeatures, config.mood).finalScore
  }));

  // Select top tracks
  return selectPlaylistTracks(scored, config.targetSize);
}
```

---

## Environment Variables

Add to `.env`:

```bash
# AudioMuse PostgreSQL
AUDIOMUSE_DB_HOST=localhost
AUDIOMUSE_DB_PORT=5432
AUDIOMUSE_DB_NAME=audiomuse
AUDIOMUSE_DB_USER=audiomuse
AUDIOMUSE_DB_PASSWORD=your_password_here

# Navidrome API (optional, not needed for direct metadata matching)
NAVIDROME_URL=http://localhost:4533
NAVIDROME_USER=your_username
NAVIDROME_PASSWORD=your_password
```

Add to `src/config.ts`:

```typescript
export const APP_ENV = cleanEnv(process.env, {
  // ... existing config ...

  // AudioMuse integration
  AUDIOMUSE_DB_HOST: str({ default: 'localhost' }),
  AUDIOMUSE_DB_PORT: port({ default: 5432 }),
  AUDIOMUSE_DB_NAME: str({ default: 'audiomuse' }),
  AUDIOMUSE_DB_USER: str({ default: 'audiomuse' }),
  AUDIOMUSE_DB_PASSWORD: str({ default: '' }),

  // Navidrome API
  NAVIDROME_URL: url({ default: 'http://localhost:4533' }),
  NAVIDROME_USER: str({ default: '' }),
  NAVIDROME_PASSWORD: str({ default: '' })
});
```

---

## CLI Commands

Add new commands for AudioMuse integration:

```bash
# Sync AudioMuse features to Plex database
plex-playlists audiomuse sync [--dry-run]

# Show AudioMuse sync statistics
plex-playlists audiomuse stats

# Generate mood-based playlist
plex-playlists run mood --mood=electronic --energy=0.7-1.0

# Generate energy-based workout playlist
plex-playlists run workout --energy=0.8-1.0 --tempo=140-180
```

---

## Use Cases

### 1. High-Energy Workout Playlist
```typescript
await buildMoodPlaylist({
  mood: 'electronic',
  energyRange: [0.8, 1.0],
  tempoRange: [140, 180],
  features: new Map([
    ['danceable', [0.7, 1.0]],
    ['aggressive', [0.5, 1.0]]
  ]),
  targetSize: 50
});
```

### 2. Chill Evening Playlist
```typescript
await buildMoodPlaylist({
  mood: 'ambient',
  energyRange: [0.0, 0.3],
  tempoRange: [60, 90],
  features: new Map([
    ['relaxed', [0.7, 1.0]],
    ['happy', [0.4, 0.8]]
  ]),
  targetSize: 50
});
```

### 3. Party Playlist
```typescript
await buildMoodPlaylist({
  mood: 'electronic',
  energyRange: [0.6, 1.0],
  features: new Map([
    ['danceable', [0.8, 1.0]],
    ['party', [0.7, 1.0]],
    ['happy', [0.6, 1.0]]
  ]),
  targetSize: 50
});
```

### 4. Focus/Study Playlist
```typescript
await buildMoodPlaylist({
  mood: 'instrumental',
  energyRange: [0.2, 0.5],
  tempoRange: [80, 110],
  features: new Map([
    ['relaxed', [0.6, 1.0]],
    ['aggressive', [0.0, 0.2]]
  ]),
  targetSize: 50
});
```

---

## Next Steps

1. **Validate Navidrome Setup**
   - Confirm Navidrome URL and credentials
   - Test Navidrome API access
   - Verify file path format matches Plex

2. **Implement Navidrome Client**
   - Create `src/audiomuse/navidrome-client.ts`
   - Test fetching song data by item_id

3. **Create Mapping Service**
   - Implement `src/audiomuse/mapping-service.ts`
   - Build file path → Plex ratingKey lookup
   - Run initial sync of 918 tracks

4. **Extend Scoring System**
   - Add mood-based scoring strategies
   - Add energy/tempo filtering
   - Test with existing playlists

5. **Add Mood Playlist Commands**
   - Implement CLI commands for mood playlists
   - Add web UI controls for mood selection
   - Generate initial mood-based playlists

---

## Summary

AudioMuse provides **all the audio features Spotify used to offer**, locally analyzed with no API limits. The integration requires:

1. ✅ **Database connection** - Already working (PostgreSQL accessible)
2. 🔄 **Navidrome API client** - To map item_id → file path
3. 🔄 **File path matching** - To map file path → Plex ratingKey
4. 🔄 **Feature storage** - Cache features in plex-playlists database
5. 🔄 **Enhanced scoring** - Use audio features in playlist generation

Once complete, you'll have:
- Mood-based playlists (electronic, rock, ambient, etc.)
- Energy-based playlists (workout, chill, party)
- Tempo-based playlists (running, studying, sleeping)
- Feature-based playlists (danceable, happy, relaxed)

All powered by **local analysis** with **no external API dependencies**.
