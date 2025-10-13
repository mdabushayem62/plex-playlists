# Metadata Enrichment

**For development guidance on metadata providers, rate limiting, and multi-source merging.**

See [root CLAUDE.md](../../CLAUDE.md) for project overview and [cache/CLAUDE.md](../cache/CLAUDE.md) for cache system details.

---

## Provider Hierarchy

Metadata is fetched from multiple sources with intelligent merging to maximize coverage while respecting rate limits:

1. **Cache** - Check cache first (90-180 day TTL depending on type)
2. **Plex** - Always fetch local metadata (genres, styles, moods from tags)
3. **Last.fm** - Always attempt (aggressive, 5 concurrent for artists/albums)
4. **Spotify** - Fallback only if Plex + Last.fm both empty (conservative, 2 concurrent)

---

## Providers

### Plex (Always Included)

**Source**: Local Plex metadata tags
**Location**: `../plex/client.ts`

**Artist Metadata:**
- Genres: From `Genre` tags
- Styles: From `Style` tags (semantic subcategories)
- Moods: From `Mood` tags (emotional attributes)

**Album Metadata:**
- Genres: From album `Genre` tags
- Moods: From album `Mood` tags

**Track Metadata:**
- Genres: From track `Genre` tags
- Moods: From track `Mood` tags
- ISRC: From embedded file metadata
- Ratings: User star ratings (0-10)
- Play stats: View count, skip count, last played

**Rate Limits:** None (local server)

**Benefits:**
- Zero API calls
- No rate limits
- Includes moods (unique to Plex)
- User-curated tags available

**Limitations:**
- May have sparse metadata
- Quality depends on music file tags
- No community consensus

---

### Last.fm (Primary External Source)

**Source**: Community-tagged metadata
**Location**: `providers/lastfm.ts`

**Artist Metadata:**
- Genres: Top tags from artist.getInfo API
- Bio: Artist biography (not currently used)
- Similar artists: (not currently used)

**Album Metadata:**
- Genres: Album-specific tags from album.getInfo API
- **Best source for album-level genres** (most accurate)

**Rate Limits:**
- **Very generous**: ~5 requests/second sustained
- Concurrency: 5 concurrent for artists, 5 for albums
- Exponential backoff on 429 errors
- No strict retry-after headers (rarely hit limits)

**API Configuration:**
- Requires `LASTFM_API_KEY` env var
- Free API key: https://www.last.fm/api/account/create

**Usage:**
```typescript
const metadata = await fetchLastFmMetadata('Radiohead', 'OK Computer');
// Returns: { genres: ['alternative rock', 'experimental', 'art rock'] }
```

---

### Spotify (Conservative Fallback)

**Source**: Spotify Web API
**Location**: `providers/spotify.ts`

**Artist Metadata:**
- Genres: From artist object (e.g., "indie rock", "chamber pop")
- Popularity: 0-100 score (updated from API)
- Artist ID: Spotify URI for future lookups

**Album Metadata:**
- **Explicitly skipped** - Spotify provides artist-level genres only, no album-specific
- Using Spotify for albums causes API thrashing with no benefit

**Track Metadata:**
- ISRC: International Standard Recording Code (for matching)
- Popularity: Track popularity score (not currently used)

**Rate Limits:**
- **Very strict**: Requests 50+ minute retry delays on rate limit
- **Capped at 5 minutes** in our code to keep cache warming viable
- Concurrency: 2 concurrent (very conservative)
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 5min cap
- Global rate limit tracker prevents hammering

**API Configuration:**
- Requires `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` env vars
- OAuth client credentials flow (automatic token refresh)
- App registration: https://developer.spotify.com/dashboard

**Usage:**
```typescript
const token = await getSpotifyToken();
const metadata = await fetchSpotifyArtistMetadata('Radiohead', token);
// Returns: { genres: ['art rock', 'melancholia', 'permanent wave'], popularity: 85 }
```

---

## Multi-Source Merging Strategy

Implemented in `../genre-enrichment.ts`

### Artist Enrichment

**Process:**
1. Check `artist_cache` - Return if cached and not expired
2. Fetch Plex metadata - Always included (genres, styles, moods)
3. Fetch Last.fm metadata - Always attempted, even if Plex has data
4. Fetch Spotify metadata - **Only if Plex + Last.fm both empty**
5. Merge results:
   - Deduplicate genres across sources
   - Combine moods (only from Plex)
   - Track sources used: `"plex,lastfm"` or `"plex,spotify"`
6. Write to cache with 180-day TTL

**Examples:**
- Plex + Last.fm: `{ genres: ["rock", "alternative", "indie"], source: "plex,lastfm" }`
- Last.fm only: `{ genres: ["electronic", "ambient"], source: "lastfm" }`
- Plex fallback to Spotify: `{ genres: ["jazz"], source: "plex,spotify" }`

### Album Enrichment

**Process:**
1. Check `album_cache` - Return if cached and not expired
2. Fetch Plex album metadata - Always included
3. Fetch Last.fm album metadata - Always attempted (best album-specific source)
4. **Skip Spotify** - Provides artist-level only, causes API waste
5. Merge results:
   - Prefer album-specific genres from Last.fm
   - Include Plex album moods
   - Fallback to artist genres if album has none
6. Write to cache with 90-day TTL

**Note:** Albums use shorter TTL (90 days) due to less stability vs artist metadata.

---

## Rate Limiting Implementation

### Exponential Backoff

All providers implement exponential backoff on 429 errors:

```typescript
// Retry delays
const delays = [1000, 2000, 4000, 8000, 16000]; // milliseconds

for (let attempt = 0; attempt < 5; attempt++) {
  try {
    return await fetch(url);
  } catch (error) {
    if (error.status === 429) {
      const delay = Math.min(delays[attempt], MAX_RETRY_DELAY);
      await sleep(delay);
    } else {
      throw error;
    }
  }
}
```

### Retry-After Headers

**Spotify:**
- Respects `Retry-After` header from API
- **Caps retry delay at 5 minutes** (Spotify can request 50+ minutes)
- Logs warning if capped delay applied

**Last.fm:**
- Rarely returns `Retry-After` (generous limits)
- Falls back to exponential backoff if hit

### Global Rate Limit Tracker

Prevents API hammering across concurrent requests:

```typescript
class RateLimitTracker {
  private lastRequestTime: Map<string, number> = new Map();

  async throttle(provider: string, minInterval: number): Promise<void> {
    const now = Date.now();
    const last = this.lastRequestTime.get(provider) || 0;
    const elapsed = now - last;

    if (elapsed < minInterval) {
      await sleep(minInterval - elapsed);
    }

    this.lastRequestTime.set(provider, Date.now());
  }
}
```

---

## Concurrency Configuration

### Artist Cache Warming

**Default**: 2 concurrent requests
**Configurable**: `CACHE_WARM_CONCURRENCY` env var
**Providers**:
- Plex: All artists in parallel (no limits)
- Last.fm: 5 concurrent per batch
- Spotify: 2 concurrent (conservative due to strict limits)

### Album Cache Warming

**Default**: 3 concurrent requests (hardcoded)
**Providers**:
- Plex: Album enumeration via tracks (no limits)
- Last.fm: 5 concurrent per batch
- Spotify: Skipped entirely

**Why higher for albums?** Last.fm is more permissive for album lookups.

---

## Common Development Patterns

### Adding a New Provider

1. Create provider file: `providers/my-provider.ts`
2. Implement metadata fetching function:
```typescript
export async function fetchMyProviderMetadata(
  artistName: string
): Promise<{ genres: string[] }> {
  const response = await fetch(`https://api.example.com/artist/${artistName}`);
  return { genres: response.tags };
}
```

3. Add to multi-source merging in `../genre-enrichment.ts`:
```typescript
// Try new provider
if (!genres.length) {
  const providerData = await fetchMyProviderMetadata(artistName);
  genres.push(...providerData.genres);
  sources.push('myprovider');
}
```

4. Update rate limiting configuration
5. Update cache source tracking

### Adjusting Rate Limits

**For Spotify:**
- Edit `MAX_RETRY_DELAY` in `providers/spotify.ts` (default: 5 minutes)
- Adjust concurrency in `cache-cli.ts:warmCache()` (default: 2)

**For Last.fm:**
- Edit concurrency in enrichment calls (default: 5)
- Last.fm rarely rate limits, safe to increase

### Implementing Caching for New Provider

```typescript
export async function getEnrichedMetadata(
  artistName: string,
  options: { skipCache?: boolean } = {}
): Promise<EnrichedMetadata> {
  // 1. Check cache first
  if (!options.skipCache) {
    const cached = await db.query.artistCache.findFirst({
      where: eq(artistCache.artistName, artistName)
    });

    if (cached && !isExpired(cached)) {
      return parseCached(cached);
    }
  }

  // 2. Fetch from providers
  const metadata = await fetchFromProviders(artistName);

  // 3. Write to cache
  await db.insert(artistCache).values({
    artistName,
    genres: JSON.stringify(metadata.genres),
    source: metadata.sources.join(','),
    expiresAt: getExpirationTimestamp(180) // 180 days
  });

  return metadata;
}
```

---

## Provider API Documentation

### Last.fm API

- **Docs**: https://www.last.fm/api
- **Methods used**:
  - `artist.getInfo`: Artist metadata and top tags
  - `album.getInfo`: Album metadata and tags
- **Authentication**: API key only (simple)
- **Rate limits**: ~5 req/sec sustained, very generous

### Spotify Web API

- **Docs**: https://developer.spotify.com/documentation/web-api
- **Endpoints used**:
  - `GET /v1/artists/{id}`: Artist metadata and genres
  - `GET /v1/search`: Artist search by name
  - `GET /v1/tracks/{id}`: Track metadata (ISRC)
- **Authentication**: OAuth client credentials (auto-refresh)
- **Rate limits**: Variable, can be very strict (50+ min delays)

### Plex API

- **Docs**: https://www.plexopensource.com/
- **Library**: `@ctrl/plex` (forked version with fixes)
- **Methods used**:
  - `library.sections()`: List music libraries
  - `library.allTracks()`: Enumerate all tracks
  - `track.genres()`: Get track genres/styles/moods
- **Rate limits**: None (local server)

---

## Troubleshooting

### Provider Not Returning Data

**Symptoms**: Empty genres, cache populated with `[]`

**Diagnosis:**
1. Check API keys in `.env`
2. Test provider directly:
```bash
# Last.fm
curl "http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=Radiohead&api_key=YOUR_KEY&format=json"

# Spotify (get token first)
curl -X POST "https://accounts.spotify.com/api/token" \
  -d grant_type=client_credentials \
  -d client_id=YOUR_ID \
  -d client_secret=YOUR_SECRET
```

3. Check provider response parsing in code

### Rate Limit Errors

**Symptoms**: 429 errors, "rate limit" in logs

**Solutions:**
- Reduce `CACHE_WARM_CONCURRENCY` (default: 2)
- Increase retry delay cap in `providers/spotify.ts`
- Run cache warming during off-peak hours

### Slow Cache Warming

**Symptoms**: Takes hours to complete

**Diagnosis:**
- Check concurrency settings (may be too conservative)
- Review Spotify retry delays (may be hitting 5min caps frequently)
- Monitor progress via web UI or `job_runs` table

**Solutions:**
- Increase concurrency for Last.fm (safe up to 10)
- Keep Spotify at 2 concurrent (cannot safely increase)
- Split warming into multiple sessions
