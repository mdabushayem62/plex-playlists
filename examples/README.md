# Example Export Files

This directory contains sample export files showing the expected formats for importing track ratings from Spotify and YouTube Music.

## Files

### spotify-export-example.csv

Example Spotify CSV export from [Exportify](https://exportify.net).

**Required columns:**
- `Track URI` - Spotify track identifier
- `Track Name` - Song title
- `Artist Name(s)` - Artist names (comma-separated for multi-artist tracks)
- `Album Name` - Album title

**Optional columns:**
- `Added At` - When the track was added to the playlist
- `Genres`, `Danceability`, `Energy`, etc. - Additional Spotify metadata (not used by importer)

### youtube-music-export-example.json

Example YouTube Music JSON export from Google Takeout (native format - no conversion needed!).

**Required fields:**
- `title` (or `song`, `songTitle`) - Track title
- `artist` (or `artistName`) - Primary artist
- `album` (or `albumTitle`) - Album name

**Supported formats:**
- Direct array: `[{title, artist, album}, ...]`
- Wrapped object: `{tracks: [{title, artist, album}, ...]}`
- Single track: `{title, artist, album}`

## Usage

These files are provided as examples only. To test the import feature:

```bash
# Test with dry-run to see what would be imported
plex-playlists import examples/ --dry-run
```

For actual imports, export your own playlists from Spotify or YouTube Music following the instructions in [docs/importing.md](../docs/importing.md).

## Format Auto-Detection

The importer auto-detects file formats based on:

- **File extension**: `.csv` vs `.json`
- **CSV columns**: `Track URI` (Spotify) vs `Video ID` (YouTube Music CSV)
- **JSON structure**: Automatic parsing of YouTube Music JSON variations

All formats are fully supported and can be mixed in the same import directory.
