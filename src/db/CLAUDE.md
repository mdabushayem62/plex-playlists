# Database Architecture

**For development guidance on schema, migrations, and database patterns.**

See [root CLAUDE.md](../../CLAUDE.md) for project overview.

---

## Schema Overview (schema.ts)

SQLite database with Drizzle ORM for type-safe queries and migrations.

### Tables

#### Playlists & Tracks

**`playlists`**
- Window-unique playlists with Plex rating key
- Columns: `id`, `window`, `plexRatingKey`, `title`, `description`, `generatedAt`, `trackCount`
- Unique index on `window` (only one playlist per window)

**`playlist_tracks`**
- Tracks belonging to playlists with position and scores
- Columns: `id`, `playlistId`, `plexRatingKey`, `title`, `artist`, `album`, `genres`, `position`, `score`, `recencyWeight`, `fallbackScore`
- Foreign key to `playlists` with cascade delete

#### Cache Tables

**`artist_cache`**
- Cached artist metadata (genres, moods)
- **Primary sources**: Last.fm (aggressive, 5 concurrent), Spotify (slow backfill, 2 concurrent), Plex (always included)
- **TTL**: 180 days with ±10% jitter
- Columns: `id`, `artistName`, `spotifyArtistId`, `popularity`, `genres` (JSON), `moods` (JSON), `source`, `cachedAt`, `expiresAt`, `lastUsedAt`
- Unique index on `artistName`
- Index on `spotifyArtistId` for future Spotify lookups

**`album_cache`**
- Cached album metadata (genres, moods)
- **Primary sources**: Last.fm (aggressive, album-specific, best accuracy), Plex (always included)
- **Note**: Spotify explicitly skipped for albums (provides artist-level only)
- **TTL**: 90 days with ±10% jitter
- Columns: `id`, `artistName`, `albumName`, `genres` (JSON), `moods` (JSON), `source`, `cachedAt`, `expiresAt`, `lastUsedAt`
- Unique index on `(artistName, albumName)` composite key

**`track_cache`**
- Cached track metadata from Plex library
- **Source**: All data from Plex (not Spotify) - genres/moods from Plex tags, ISRC from Plex embedded metadata
- **Tiered TTL**:
  - Tier 1 (Static): 90 days - title, artist, album, duration, year, genres, moods
  - Tier 2 (Stats): 24 hours - rating, viewCount, skipCount, lastViewedAt
- Columns: `ratingKey` (PK), `title`, `artistName`, `albumName`, `duration`, `year`, `trackIndex`, `isrc`, `parentRatingKey`, `grandparentRatingKey`, `genres` (JSON), `moods` (JSON), `staticCachedAt`, `staticExpiresAt`, `userRating`, `viewCount`, `skipCount`, `lastViewedAt`, `statsCachedAt`, `statsExpiresAt`, `qualityScore`, `isHighRated`, `isUnplayed`, `isUnrated`, `lastUsedAt`
- Multiple indexes for fast queries: artist, album, rating, quality, lastViewed, highRated, unplayed, expires

**`audio_features`**
- Cached audio features (tempo, energy, mood vectors)
- **Source**: AudioMuse PostgreSQL database (external), mapped via title/artist matching
- Columns: `id`, `ratingKey`, `audiomuseItemId`, `title`, `artist`, `tempo`, `key`, `scale`, `energy`, `moodVector` (JSON), `otherFeatures` (JSON), `matchConfidence`, `source`, `cachedAt`
- Unique index on `ratingKey`
- Indexes on `audiomuseItemId`, `energy`, `tempo`, `artist` for feature-based queries

#### Job Tracking

**`job_runs`**
- Job execution history (start, finish, status, errors)
- Columns: `id`, `window`, `startedAt`, `finishedAt`, `status`, `error`, `progressCurrent`, `progressTotal`, `progressMessage`
- Used for observability and progress tracking

#### Web UI Configuration

**`setup_state`**
- Tracks setup wizard progress
- Columns: `id`, `currentStep`, `completed`, `stepData` (JSON), `createdAt`, `updatedAt`

**`settings`**
- Web UI configuration overrides (takes precedence over env vars)
- Columns: `id`, `key`, `value`, `updatedAt`
- Unique index on `key`

**`settings_history`**
- Audit trail for settings changes
- Columns: `id`, `settingKey`, `oldValue`, `newValue`, `changedBy`, `changedAt`
- Indexes on `settingKey` and `changedAt`

**`custom_playlists`**
- User-defined genre/mood playlist configurations
- Columns: `id`, `name`, `genres` (JSON), `moods` (JSON), `enabled`, `cron`, `targetSize`, `description`, `scoringStrategy`, `createdAt`, `updatedAt`
- Unique index on `name`

---

## Migrations

### Workflow

1. **Modify schema**: Edit `schema.ts`
2. **Generate migration**: `npx drizzle-kit generate`
3. **Review SQL**: Check `drizzle/00XX_name.sql`
4. **Commit migration**: Migration runs automatically on app startup

**Auto-run**: Migrations execute automatically on first database connection via `db/index.ts:runMigrations()`

### Migration Files

Located in `drizzle/` directory:
- `0000_initial.sql` - Initial schema
- `0001_add_cache_ttl.sql` - Add TTL columns to cache tables
- `0002_drop_history_cache.sql` - Remove old history cache
- ...
- `00XX_latest.sql` - Most recent migration

### Testing Migrations

Integration tests verify migrations in `__tests__/integration/database-migrations.test.ts`:
- Table existence
- Index creation
- Foreign key constraints
- Cascade delete behavior

---

## Repository Patterns (repository.ts)

### Common CRUD Operations

**Save Playlist:**
```typescript
await savePlaylist(db, {
  window: 'morning',
  plexRatingKey: '12345',
  title: 'Morning Mix',
  description: 'Morning 06:00-11:59 • Generated 2025-10-08',
  generatedAt: new Date(),
  trackCount: 50
});
```

**Query Recent Playlists:**
```typescript
const recent = await db
  .select()
  .from(playlists)
  .orderBy(desc(playlists.generatedAt))
  .limit(10);
```

**Cache Lookup:**
```typescript
const cached = await db
  .select()
  .from(artistCache)
  .where(eq(artistCache.artistName, 'Radiohead'))
  .get();
```

### Transaction Handling

```typescript
await db.transaction(async (tx) => {
  // Insert playlist
  const [playlist] = await tx
    .insert(playlists)
    .values({ ... })
    .returning();

  // Insert tracks
  await tx.insert(playlistTracks).values(tracks.map(t => ({
    playlistId: playlist.id,
    ...t
  })));
});
```

---

## Observability

### Job History Queries

**Recent jobs:**
```sql
SELECT window, status, datetime(started_at/1000, 'unixepoch') as started,
       datetime(finished_at/1000, 'unixepoch') as finished
FROM job_runs
ORDER BY started_at DESC
LIMIT 10;
```

**Failed jobs:**
```sql
SELECT window, error, datetime(started_at/1000, 'unixepoch') as started
FROM job_runs
WHERE status = 'failed'
ORDER BY started_at DESC;
```

### Cache Statistics

**Entry count by source:**
```sql
SELECT source, COUNT(*) as count
FROM artist_cache
GROUP BY source;
```

**Expiring entries:**
```sql
SELECT COUNT(*) as expiring_soon
FROM artist_cache
WHERE expires_at < datetime('now', '+7 days');
```

**Oldest and newest:**
```sql
SELECT
  MIN(cached_at) as oldest,
  MAX(cached_at) as newest
FROM artist_cache;
```

---

## Common Development Patterns

### Adding a New Table

1. Define schema in `schema.ts`:
```typescript
export const myTable = sqliteTable('my_table', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s','now')*1000)`)
});
```

2. Generate migration: `npx drizzle-kit generate`
3. Export type: `export type MyRecord = typeof myTable.$inferSelect;`
4. Add to repository if needed: `repository.ts`

### Modifying Existing Table

1. Update schema in `schema.ts`
2. Generate migration: `npx drizzle-kit generate`
3. Review generated SQL in `drizzle/00XX_name.sql`
4. Test migration with fresh database
5. Update types and queries accordingly

### Adding Indexes

For performance optimization:
```typescript
export const myTable = sqliteTable(
  'my_table',
  {
    id: integer('id').primaryKey(),
    userId: text('user_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    userIdx: index('my_table_user_idx').on(table.userId),
    createdIdx: index('my_table_created_idx').on(table.createdAt),
    userCreatedIdx: index('my_table_user_created_idx').on(table.userId, table.createdAt) // Composite
  })
);
```

### Querying JSON Columns

Genres and moods are stored as JSON arrays:
```typescript
// In code (TypeScript)
const genres = JSON.parse(cached.genres) as string[];

// In SQL (for manual queries)
SELECT json_extract(genres, '$[0]') as first_genre
FROM artist_cache;
```

---

## Database Tools

### Drizzle Studio

Visual database browser:
```bash
npx drizzle-kit studio
# Opens http://localhost:4983
```

### SQLite CLI

Direct database access:
```bash
sqlite3 ./data/plex-playlists.db

# Useful commands:
.tables                    # List all tables
.schema playlists          # Show table schema
.mode column               # Pretty output
.headers on                # Show column names
```

### Backup & Restore

**Backup:**
```bash
sqlite3 ./data/plex-playlists.db ".backup ./backup.db"
```

**Restore:**
```bash
cp ./backup.db ./data/plex-playlists.db
```

---

## Performance Considerations

### Indexing Strategy

- **Primary keys**: Auto-indexed
- **Foreign keys**: Not auto-indexed in SQLite, add manually if needed
- **Frequently queried columns**: Add indexes (artist, album, rating, etc.)
- **Composite indexes**: For multi-column WHERE clauses

### Query Optimization

- Use `EXPLAIN QUERY PLAN` to analyze slow queries
- Limit result sets with `.limit()`
- Use `.get()` for single-row queries (throws if multiple)
- Batch inserts with `.values([...])` instead of individual inserts

### Database Size

**Current estimates:**
- 95k tracks: ~10-15 MB (track_cache)
- 5k artists: ~1-2 MB (artist_cache)
- 10k albums: ~2-3 MB (album_cache)
- 100 playlists: ~500 KB (playlists + tracks)
- **Total**: ~20-30 MB for large library

**Vacuum periodically** to reclaim space:
```bash
sqlite3 ./data/plex-playlists.db "VACUUM;"
```
