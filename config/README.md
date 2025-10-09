# Config Directory

This directory is mounted into the Docker container at `/config` and contains all persistent configuration and data for the application.

## Contents

- **plex-playlists.db** - SQLite database (auto-created on first run)
- **plex-playlists.db-shm, plex-playlists.db-wal** - SQLite write-ahead log files
- **.env** (optional) - Environment variable overrides (see below)

## Environment Configuration

You can configure the application in two ways:

### Option 1: docker-compose.yml (Recommended)
Set environment variables directly in `docker-compose.yml`:

```yaml
environment:
  - PLEX_BASE_URL=http://localhost:32400
  - PLEX_AUTH_TOKEN=your-token
  - DATABASE_PATH=/config/plex-playlists.db
```

### Option 2: .env file
Create a `.env` file in this directory with your configuration:

```bash
# Create config/.env
cp ../.env.example .env
# Edit .env with your settings
```

The container will automatically load `.env` from `/config/.env` if it exists.

## Imported Playlists

To import ratings from Spotify/YouTube Music:

1. Place CSV exports in the `imported_playlists/` directory (in project root)
2. Run the import command:
   ```bash
   docker exec plex-playlists node dist/cli.js import /app/imported_playlists
   ```

See [IMPORTING.md](../IMPORTING.md) for detailed instructions.

## Database Management

The SQLite database is created automatically on first run. To reset:

```bash
# Stop the container
docker-compose down

# Delete the database
rm config/plex-playlists.db*

# Restart (database will be recreated)
docker-compose up -d
```

## Backup

To backup your configuration and playlist history:

```bash
# Backup the entire config directory
tar czf plex-playlists-backup-$(date +%Y%m%d).tar.gz config/
```

To restore:

```bash
# Extract backup
tar xzf plex-playlists-backup-YYYYMMDD.tar.gz
```
