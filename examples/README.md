# Example CSV Files

This directory contains sample CSV files showing the expected format for importing track ratings from Spotify and YouTube Music.

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

### youtube-music-export-example.csv

Example YouTube Music CSV (converted from JSON via Google Takeout).

**Required columns:**
- `Video ID` - YouTube video identifier
- `Song Title` - Track title
- `Artist Name 1` - Primary artist
- `Album Title` - Album name

**Optional columns:**
- `Artist Name 2-4` - Additional artists for multi-artist tracks

## Usage

These files are provided as examples only. To test the import feature:

```bash
# Test with dry-run to see what would be imported
plex-playlists import examples/ --dry-run
```

For actual imports, export your own playlists from Spotify or YouTube Music following the instructions in [IMPORTING.md](../IMPORTING.md).

## CSV Format Validation

The importer auto-detects which service each CSV came from based on column headers:

- **Spotify**: Detected by presence of `Track URI` column
- **YouTube Music**: Detected by presence of `Video ID` column

Both formats are fully supported and can be mixed in the same import directory.
