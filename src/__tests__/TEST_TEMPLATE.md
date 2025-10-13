# Test Template Guide

This guide shows how to write tests using the centralized test infrastructure.

## Quick Start

### 1. Basic Setup (all test files)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHistoryPlayedDaysAgo,
  mockPlexServer,
  createMockTrack,
  createTrackMap
} from '../../__tests__/helpers/index.js';

// Mock dependencies at file level (required by vitest hoisting)
vi.mock('../../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../config.js', () => ({ APP_ENV: { /* config */ } }));
vi.mock('../../plex/client.js');
vi.mock('../../plex/tracks.js');
vi.mock('../../db/index.js');
vi.mock('../../scoring/strategies.js');

import { getPlexServer } from '../../plex/client.js';
import { fetchTracksByRatingKeys } from '../../plex/tracks.js';
// ... import other mocked modules

describe('Your Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mocks
  });

  it('does something', async () => {
    // Arrange
    const history = [createHistoryPlayedDaysAgo('1', 100, { userRating: 4 })];
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '1', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    // Act
    const result = await yourFunction();

    // Assert
    expect(result).toHaveLength(1);
  });
});
```

## Available Helpers

### History Factories

```typescript
// Single play N days ago
createHistoryPlayedDaysAgo('ratingKey', daysAgo, options);

// Multiple plays of same track
createMultiplePlayHistory('ratingKey', [100, 120, 150], options);

// Batch of unique tracks
createHistoryBatch(count, daysAgo, options);

// Throwback history with lastViewedAt
createThrowbackHistory('ratingKey', playedInWindowDaysAgo, mostRecentPlayDaysAgo, options);
```

### Track Factories

```typescript
// Basic track
createMockTrack({ ratingKey: '1', userRating: 8 });

// High-rated track
createHighRatedTrack({ ratingKey: '1' });

// Unplayed track
createUnplayedTrack({ ratingKey: '1' });

// Track with specific genres
createTrackWithGenres(['Rock', 'Alternative'], { ratingKey: '1' });
```

### Server Mocking

```typescript
// Fluent builder
const server = mockPlexServer()
  .withHistory(history)
  .withPaginatedHistory([page1, page2])
  .withNoMusicSection()
  .build();

// Manual mock (for complex scenarios)
const server = {
  history: vi.fn()
    .mockResolvedValueOnce(page1)
    .mockResolvedValue([])
};
```

### Database Mocking

```typescript
// Simple cache update mock
vi.mocked(getDb).mockReturnValue(createMockDatabaseWithCacheUpdate() as any);

// Fluent builder (for complex queries)
const db = mockDatabase()
  .withSelectResults([{ id: 1, name: 'Test' }])
  .build();
```

### Track Map

```typescript
// Convert array of tracks to Map for fetchTracksByRatingKeys mock
const tracks = [createMockTrack({ ratingKey: '1' })];
vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap(tracks));
```

## Common Patterns

### Test Pagination

```typescript
const page1 = createHistoryBatch(500, 100, { userRating: 4 });
const page2 = createHistoryBatch(100, 100, { userRating: 4 });

const server = {
  history: vi.fn()
    .mockResolvedValueOnce(page1)
    .mockResolvedValueOnce(page2)
    .mockResolvedValue([])
};
```

### Test Scoring

```typescript
vi.mocked(calculateScore).mockReturnValue({
  finalScore: 0.8,
  components: {
    metadata: {
      recencyPenalty: 0.8,
      qualityScore: 0.9
    }
  }
} as any);
```

### Test Error Cases

```typescript
await expect(yourFunction()).rejects.toThrow(/Expected error message/);
```

### Test Filtering

```typescript
// Test should throw when all items filtered
await expect(yourFunction()).rejects.toThrow(/Insufficient tracks/);
```

## File-Specific Setup

### Discovery/Throwback Tests

```typescript
vi.mock('../../config.js', () => ({
  APP_ENV: {
    PLAYLIST_TARGET_SIZE: 50,
    DISCOVERY_DAYS: 90,
    THROWBACK_LOOKBACK_START: 730,
    THROWBACK_LOOKBACK_END: 1825,
    THROWBACK_RECENT_EXCLUSION: 90
  }
}));
```

### Recommendation Tests

```typescript
vi.mock('../../db/settings-service.js');
vi.mock('../../metadata/genre-service.js');

// Additional setup
vi.mocked(getEffectiveConfig).mockResolvedValue({
  genreIgnoreList: ['pop', 'rock']
});
```

### Custom Playlist Tests

```typescript
vi.mock('../../history/history-service.js');
vi.mock('../candidate-builder.js');
vi.mock('../selector.js');
vi.mock('../../plex/playlists.js');

// Mock the full pipeline
vi.mocked(fetchHistoryForWindow).mockResolvedValue(history);
vi.mocked(buildCandidateTracks).mockResolvedValue(candidates);
vi.mocked(selectPlaylistTracks).mockReturnValue({ selected, rejected });
```

## Tips

1. **Use factories over manual object construction** - More maintainable
2. **Fluent builders for complex scenarios** - More readable
3. **Test one thing per test** - Better isolation
4. **Use descriptive test names** - Self-documenting
5. **Mock at the right level** - Not too high, not too low
6. **Keep tests focused** - 3-10 lines per test is ideal

## Example: Full Test File Structure

See `src/playlist/__tests__/discovery.test.ts` for a complete working example.
