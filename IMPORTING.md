# Importing Listening History into Plex

This guide explains how to export your listening history from Spotify and YouTube Music, and import it into your Plex library to establish baseline ratings for playlist generation.

## Overview

The import process:
1. **Export** playlists from Spotify/YouTube Music as CSV files
2. **Import** CSVs into Plex to set star ratings automatically
3. **Ratings** are assigned based on playlist type (Top Songs, Liked, or Curated)

### Rating System

- **4.5 stars**: "Your Top Songs" playlists (annual/monthly top tracks)
- **4.0 stars**: "Liked Songs" or favorites playlists
- **3.0 stars**: Any other curated playlist you export

Tracks appearing in multiple playlists receive the highest applicable rating.

---

## Exporting from Spotify

### Method 1: Using Exportify (Recommended)

**Exportify** is a web app that exports Spotify playlists to CSV format.

1. **Visit**: https://exportify.net/
2. **Login** with your Spotify account
3. **Select playlists** to export:
   - ✅ Liked Songs
   - ✅ Your Top Songs 2024, 2023, 2022, etc.
   - ✅ Any custom playlists you want rated
4. **Click "Export"** for each playlist
5. **Save** CSV files to a folder (e.g., `~/spotify-exports/`)

### Method 2: Manual Export (Spotify Playlists Only)

For individual playlists:
1. Open **Spotify Desktop App**
2. Select your playlist
3. Press `Ctrl+A` (Windows) or `Cmd+A` (Mac) to select all tracks
4. Right-click → **Share** → **Copy Spotify URIs**
5. Paste into a spreadsheet and export as CSV

> **Note**: Manual export requires additional column formatting. Exportify is recommended.

### Expected Spotify CSV Format

```csv
Track URI,Track Name,Artist Name(s),Album Name,Duration (ms),Added At
spotify:track:abc123,Song Title,Artist Name,Album Name,240000,2024-01-15
```

**Required columns:**
- `Track URI`
- `Track Name`
- `Artist Name(s)`
- `Album Name` (optional but recommended)

---

## Exporting from YouTube Music

### Using YouTube Takeout

1. **Visit**: https://takeout.google.com/
2. **Deselect all**, then select only **"YouTube and YouTube Music"**
3. Click **"All YouTube data included"** and deselect everything except:
   - ✅ playlists
   - ✅ music-library-songs
4. Choose **JSON format** (will be converted to CSV)
5. Click **"Next step"** and choose export settings
6. **Wait** for Google to prepare your export (can take hours/days)
7. **Download** the archive when ready

### Converting YouTube Music JSON to CSV

YouTube Takeout provides JSON files. Use this Python script to convert them:

```python
import json
import csv
from pathlib import Path

def convert_youtube_playlist_to_csv(json_file, csv_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'Video ID', 'Song Title', 'Artist Name 1',
            'Artist Name 2', 'Artist Name 3', 'Artist Name 4', 'Album Title'
        ])
        writer.writeheader()

        for item in data:
            # Extract track info from YouTube Music JSON structure
            title = item.get('title', '')
            video_id = item.get('contentDetails', {}).get('videoId', '')

            # Split artist info (YouTube often combines artists)
            artists = item.get('subtitle', '').split(' • ')
            artist1 = artists[0] if len(artists) > 0 else ''
            artist2 = artists[1] if len(artists) > 1 else ''
            album = artists[2] if len(artists) > 2 else ''

            writer.writerow({
                'Video ID': video_id,
                'Song Title': title,
                'Artist Name 1': artist1,
                'Artist Name 2': artist2,
                'Artist Name 3': '',
                'Artist Name 4': '',
                'Album Title': album
            })

# Convert all playlists
for json_file in Path('Takeout/YouTube and YouTube Music/playlists').glob('*.json'):
    csv_file = json_file.with_suffix('.csv')
    convert_youtube_playlist_to_csv(json_file, csv_file)
    print(f'Converted: {json_file.name} → {csv_file.name}')
```

Save as `convert_youtube.py` and run: `python convert_youtube.py`

### Expected YouTube Music CSV Format

```csv
Video ID,Song Title,Artist Name 1,Artist Name 2,Artist Name 3,Artist Name 4,Album Title
abc123xyz,Song Title,Primary Artist,Featured Artist,,,Album Name
```

**Required columns:**
- `Video ID`
- `Song Title`
- `Artist Name 1` (at minimum)
- `Album Title` (optional)

---

## Importing into Plex

### Prerequisites

1. **Plex library** with music files properly tagged
2. **CSV files** exported from Spotify or YouTube Music
3. **plex-playlists** installed and configured

### Basic Import Command

```bash
plex-playlists import /path/to/csv-folder
```

### Options

```bash
# Dry run (preview without making changes)
plex-playlists import /path/to/csv-folder --dry-run

# Example with actual path
plex-playlists import ~/music-exports/spotify/
```

### Import Process

The importer will:

1. **Parse** all CSV files in the directory
2. **Fetch** all tracks from your Plex library (one-time operation)
3. **Match** CSV tracks to Plex tracks using fuzzy matching:
   - Artist name matching (handles multi-artist tracks)
   - Track title matching (handles variations)
   - Album matching for disambiguation
4. **Calculate** star ratings based on playlist names
5. **Set ratings** in Plex (skips already-rated tracks)

### Naming Your Playlists for Rating Detection

The importer automatically detects playlist types by filename:

| Playlist Name Pattern | Rating | Examples |
|----------------------|--------|----------|
| `*top*songs*` | 4.5 ⭐ | `Your Top Songs 2024.csv`, `Top 100 Songs.csv` |
| `*liked*songs*` | 4.0 ⭐ | `Liked Songs.csv`, `My Liked Songs.csv` |
| Anything else | 3.0 ⭐ | `Workout Mix.csv`, `Chill Vibes.csv` |

> **Tip**: Rename your CSV files before import to match these patterns for optimal ratings.

### Example Directory Structure

```
~/music-exports/
├── spotify/
│   ├── Liked Songs.csv
│   ├── Your Top Songs 2024.csv
│   ├── Your Top Songs 2023.csv
│   ├── Workout Mix.csv
│   └── Chill Vibes.csv
└── youtube/
    ├── Liked Music.csv
    └── My Playlist.csv
```

**Import command:**
```bash
plex-playlists import ~/music-exports/spotify/
plex-playlists import ~/music-exports/youtube/
```

---

## Import Results

After import completes, you'll see a summary:

```
=== Import Results ===
Total tracks in CSV files: 1,247
Matched to Plex library: 1,089
Ratings set: 834
Skipped (already rated): 255
Failed to match: 158
```

### Understanding Match Rates

- **90%+ match rate**: Excellent! Your Plex library is well-tagged.
- **70-90% match rate**: Good. Some tracks may have different metadata.
- **<70% match rate**: Check your Plex library tagging and CSV file quality.

### Common Matching Issues

1. **Different artist names**:
   - CSV: "The Beatles"
   - Plex: "Beatles, The"
   - ✅ Usually handled automatically

2. **Featured artists**:
   - CSV: "Artist (feat. Other Artist)"
   - Plex: "Artist"
   - ✅ Multi-artist splitting handles this

3. **Remixes/Versions**:
   - CSV: "Song (Radio Edit)"
   - Plex: "Song"
   - ⚠️ May not match (consider standardizing tags)

4. **Compilation albums**:
   - CSV: "Various Artists"
   - Plex: Individual artist names
   - ✅ Album matching helps disambiguate

---

## Advanced Usage

### Custom Rating Configuration

While the default ratings work well, you can customize them if needed by modifying the rating calculator logic in `src/import/rating-calculator.ts`.

### Batch Processing Multiple Services

```bash
#!/bin/bash
# import-all.sh

echo "Importing Spotify..."
plex-playlists import ~/exports/spotify/

echo "Importing YouTube Music..."
plex-playlists import ~/exports/youtube/

echo "Checking cache stats..."
plex-playlists cache stats

echo "Done! Run a playlist to see results:"
echo "  plex-playlists run morning"
```

### Verifying Imports

After importing, verify ratings were set:

1. Open **Plex Web** or mobile app
2. Navigate to **Music Library**
3. Sort by **Rating** (descending)
4. Check that imported tracks show star ratings

You can also check the logs:
```bash
tail -f ~/.local/share/plex-playlists/logs/app.log
```

---

## Troubleshooting

### No tracks matched

**Problem**: `Matched to Plex library: 0`

**Solutions**:
1. Verify CSV format matches Spotify or YouTube Music format
2. Check Plex library has music files with proper metadata
3. Run with `--dry-run` to see detailed errors
4. Check logs for specific matching failures

### Permission errors

**Problem**: "Failed to set rating: Unauthorized"

**Solutions**:
1. Verify `PLEX_AUTH_TOKEN` in `.env` is correct
2. Ensure token has write permissions
3. Test connection: `plex-playlists cache stats`

### CSV parsing errors

**Problem**: "Unknown CSV format" or parsing failures

**Solutions**:
1. Ensure CSV has required column headers (case-sensitive)
2. Check for UTF-8 encoding (not UTF-16 or other)
3. Remove BOM if present
4. Verify no empty rows at start of file

### Tracks already rated

**Problem**: `Skipped (already rated): 1000+`

**Solution**: The importer intentionally skips tracks that already have ratings to preserve manual ratings. To re-import:
1. Clear ratings in Plex first (manual process)
2. Or modify `setTrackRating()` to allow overwrites

---

## Best Practices

### Before Importing

1. ✅ **Clean your Plex library metadata** first
   - Use MusicBrainz Picard or similar tools
   - Standardize artist names
   - Ensure album/track names are accurate

2. ✅ **Export your best playlists**
   - Focus on "Top Songs" and "Liked Songs"
   - Quality over quantity - curated playlists work best

3. ✅ **Test with dry-run first**
   ```bash
   plex-playlists import ~/exports/ --dry-run
   ```

### After Importing

1. ✅ **Warm the genre cache** for faster playlist generation:
   ```bash
   plex-playlists cache warm
   ```

2. ✅ **Generate a test playlist** to verify:
   ```bash
   plex-playlists run morning
   ```

3. ✅ **Review results** in Plex and adjust as needed

---

## Next Steps

After importing:

1. **Run playlist generation**:
   ```bash
   plex-playlists run morning
   plex-playlists run afternoon
   plex-playlists run evening
   ```

2. **Start the scheduler** for automatic daily updates:
   ```bash
   plex-playlists start
   ```

3. **Monitor and iterate**:
   - Check generated playlists in Plex
   - Adjust ratings manually for mismatched tracks
   - Re-import with updated playlists periodically

---

## Reference

### Supported CSV Formats

| Service | Format | Auto-detected |
|---------|--------|---------------|
| Spotify (Exportify) | `Track URI`, `Track Name`, `Artist Name(s)`, `Album Name` | ✅ Yes |
| YouTube Music (Takeout) | `Video ID`, `Song Title`, `Artist Name 1-4`, `Album Title` | ✅ Yes |
| Custom | Any format with artist/title columns | ⚠️ Requires code modification |

### CLI Reference

```bash
# Import ratings from CSV files
plex-playlists import <csv-directory> [--dry-run]

# Check import would affect (no changes made)
plex-playlists import ~/exports/ --dry-run

# View detailed logs
tail -f ~/.local/share/plex-playlists/logs/app.log
```

### File Locations

- **CSV exports**: Anywhere you choose (e.g., `~/music-exports/`)
- **Logs**: `~/.local/share/plex-playlists/logs/`
- **Database**: `./data/plex-playlists.db`
- **Config**: `.env` in project root

---

## Support

If you encounter issues:

1. Check this documentation first
2. Review logs for detailed error messages
3. Run with `--dry-run` to preview without changes
4. Verify CSV format matches Spotify or YouTube Music format
5. Test Plex connection: `plex-playlists cache stats`

For bugs or feature requests, see the main [README.md](./README.md).
