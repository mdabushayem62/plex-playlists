# Config Directory

This directory contains configuration files that control how the application behaves. Configuration is static (changes rarely) while data in `/data` is dynamic (changes frequently).

## Contents

### Auto-Created Files

The app automatically copies template files here on first startup:

- **playlists.config.json** - Genre playlist configuration (copied from app root)
  - Defines pinned genre playlists
  - Controls auto-discovery settings
  - Edit this file to customize genre playlists

### Optional Files

- **.env** - Environment variable overrides
  - Takes precedence over docker-compose.yml environment variables
  - Useful for sensitive values you don't want in docker-compose
  - See `../.env.example` for all available options

- **genre-mapping.json** - Custom genre mappings (if created)
  - Override automatic genre detection
  - Map artist names to specific genres

## Configuration Hierarchy

The app loads config in this order (later takes precedence):

1. **Built-in defaults** (in application code)
2. **Template files** (playlists.config.json in app root)
3. **Files in this directory** (./config/playlists.config.json)
4. **Environment variables** (from docker-compose.yml or ./config/.env)

## Docker Usage

Mount this directory to persist configuration:

```yaml
volumes:
  - ./config:/config
  - ./data:/data
```

### Quick Start (Docker)

1. **First run** - App auto-creates `playlists.config.json`
2. **Customize** - Edit `config/playlists.config.json` to add genre playlists
3. **Restart** - `docker-compose restart` to apply changes

### Environment Overrides

Create `config/.env` for sensitive values:

```bash
# config/.env
PLEX_AUTH_TOKEN=your-real-token-here
LASTFM_API_KEY=your-lastfm-key
SPOTIFY_CLIENT_ID=your-spotify-id
SPOTIFY_CLIENT_SECRET=your-spotify-secret
```

This keeps credentials out of docker-compose.yml.

## Local Development

When running locally, the app uses `./config/` relative to the project root:

```bash
npm run dev
# Looks for: ./config/playlists.config.json
# Falls back to: ./playlists.config.json
```

## Example: Customizing Genre Playlists

Edit `config/playlists.config.json`:

```json
{
  "genrePlaylists": {
    "pinned": [
      {
        "name": "synthwave",
        "genre": "synthwave",
        "cron": "0 7 * * 1",
        "enabled": true,
        "description": "80s future vibes every Monday 7am"
      },
      {
        "name": "metal",
        "genre": "metal",
        "cron": "0 8 * * 6",
        "enabled": true,
        "description": "Heavy playlist every Saturday 8am"
      }
    ],
    "autoDiscover": {
      "enabled": true,
      "minArtists": 10,
      "maxPlaylists": 15,
      "exclude": ["electronic", "pop"],
      "schedule": "0 15 * * 1"
    }
  }
}
```

Restart the app to apply changes.

## Backup

Config files are small and change rarely - backup separately from data:

```bash
# Backup config only
tar czf plex-playlists-config-$(date +%Y%m%d).tar.gz config/

# Or copy individual files
cp config/playlists.config.json config/playlists.config.json.backup
```

## Reset to Defaults

To start over with default configuration:

```bash
# Delete customized config
rm config/playlists.config.json

# Restart (app will copy template again)
docker-compose restart
```

The template from the app root will be auto-copied on next startup.
