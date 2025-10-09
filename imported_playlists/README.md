# Imported Playlists

This directory is used to store CSV files exported from music streaming services (Spotify, YouTube Music, etc.) for importing star ratings into your Plex library.

## Usage

1. Export your playlists from Spotify or YouTube Music as CSV files
2. Place the CSV files in this directory
3. Run the import command:
   ```bash
   plex-playlists import ./imported_playlists
   ```

See [IMPORTING.md](../IMPORTING.md) for detailed instructions on exporting playlists and importing ratings.

## CSV Format

The importer expects CSV files with these columns:
- Track Name (or Title)
- Artist Name (or Artist)
- Album Name (or Album)
- Any other metadata columns are ignored

## Docker Usage

When using Docker, you can mount this directory or provide your own:

```yaml
volumes:
  - ./config:/config
  - ./imported_playlists:/app/imported_playlists
```

Then run:
```bash
docker exec plex-playlists node dist/cli.js import /app/imported_playlists
```
