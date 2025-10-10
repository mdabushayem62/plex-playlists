# Import Ratings from Spotify/YouTube Music

This guide explains how to import track ratings from Spotify and YouTube Music CSV exports into your Plex library.

## Overview

The importer matches tracks from your CSV files to your Plex library and sets star ratings based on the source playlist:

- **4.5 stars**: Tracks from "Your Top Songs" playlists (2021-2024)
- **4 stars**: Tracks from "Liked Songs"
- **3 stars**: Tracks from other curated playlists

**Important**: The importer only sets ratings for tracks that don't already have a rating. Existing ratings are preserved.

## Prerequisites

1. Export your Spotify playlists using [Exportify](https://exportify.net) or the Spotify Web API
2. Export your YouTube Music library via [Google Takeout](https://takeout.google.com)
3. Place all CSV files in a single directory (e.g., `imported_playlists/`)

## Usage

### Dry Run (Recommended First)

Test the import without making changes:

```bash
npm run build
npm run start -- import imported_playlists/ --dry-run
```

or

```bash
plex-playlists import imported_playlists/ --dry-run
```

This will:
- Parse all CSV files in the directory
- Match tracks to your Plex library using fuzzy matching
- Show what ratings would be set
- **Not actually modify any ratings**

### Apply Ratings

Once you've verified the dry-run results, run without `--dry-run`:

```bash
plex-playlists import imported_playlists/
```

## CSV Format Support

### Spotify CSV Format
Exportify and the Spotify Web API export CSVs with these required columns:
- `Track Name`
- `Artist Name(s)`
- `Track URI`
- `Album Name`

### YouTube Music CSV Format
Google Takeout exports CSVs with these required columns:
- `Song Title`
- `Artist Name 1` (and optionally Artist Name 2-4)
- `Album Title`
- `Video ID`

The importer automatically detects which format each CSV file uses.

## Matching Algorithm

The importer uses fuzzy string matching to find tracks in your Plex library:

1. **Search**: Searches Plex for tracks by artist name
2. **Fuzzy Match**: Compares artist and title using string similarity (85% threshold)
3. **Scoring**: Prioritizes artist match (70%) over title match (30%)
4. **Best Match**: Selects the highest-scoring match

### Match Quality

Tracks may not match if:
- The artist/title differs significantly between services (remasters, featuring artists, etc.)
- The track doesn't exist in your Plex library
- Character encoding issues (rare with UTF-8 BOM handling)

Check the error list in the output for unmatched tracks.

## Output

The importer provides a summary:

```
=== Import Results ===
Total tracks in CSV files: 2145
Matched to Plex library: 1823
Ratings set: 1654
Skipped (already rated): 169
Failed to match: 322

Errors (10):
  - No match: Danger - 0:59
  - No match: Carpenter Brut - Night Prowler
  ...
```

## Rating Calculation

Tracks can appear in multiple playlists. The importer assigns the **highest applicable rating**:

```typescript
// Example: Track appears in both "Liked Songs" and "Your Top Songs 2024"
// Result: 4.5 stars (highest of 4.0 and 4.5)
```

Pattern matching (case-insensitive):
- Top Songs: `/your.?top.?songs/i`
- Liked Songs: `/liked.?songs/i`

## Plex Rating Scale

Plex uses a 10-point scale internally. The importer converts as follows:

| Star Rating | Plex Internal Value |
|-------------|---------------------|
| 3.0 stars   | 6                   |
| 4.0 stars   | 8                   |
| 4.5 stars   | 9                   |
| 5.0 stars   | 10                  |

## Integration with Playlist Generator

After importing ratings, the fallback scoring in `playlist-runner.ts` will automatically prioritize these tracks:

```
Fallback Score = 0.6 * normalizedStarRating + 0.4 * normalizedPlayCount
```

With 4.5-star ratings, your imported favorites will score highly even without recent play history.

## Troubleshooting

### "No music library section found"
Ensure your Plex server is running and the `PLEX_BASE_URL` and `PLEX_AUTH_TOKEN` are correctly set in `.env`.

### "CSV file is empty"
Check that your CSV files contain data and have proper headers.

### Low match rate
- Ensure your Plex library artist/title metadata is accurate
- Try cleaning up special characters in Plex metadata
- Consider lowering `SIMILARITY_THRESHOLD` in `src/import/track-matcher.ts` (default: 0.85)

### Encoding issues
The parser handles UTF-8 BOM automatically. If you see garbled characters, check the CSV file encoding.

## Advanced Configuration

### Custom Rating Scheme

Edit `src/import/rating-calculator.ts`:

```typescript
export const getDefaultRatingConfig = (): RatingConfig => {
  return {
    topSongs: 5.0,   // Change to 5 stars for top songs
    likedSongs: 4.0,
    curated: 3.5     // Bump curated playlists to 3.5
  };
};
```

### Adjust Similarity Threshold

Edit `src/import/track-matcher.ts`:

```typescript
const SIMILARITY_THRESHOLD = 0.80; // Lower = more lenient matching
```

### Batch Processing

For very large libraries (10,000+ tracks), consider processing in batches by splitting CSV files into multiple directories.
