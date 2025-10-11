# Docker Setup Guide

Complete guide for running Plex Playlist Enhancer with Docker and the web UI.

---

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Plex Media Server** with a music library
- **Plex Auth Token** (see below)

---

## Getting Your Plex Token

1. Log into **Plex Web App** (app.plex.tv)
2. Play any media item
3. Click the **⋯ menu** → **"Get Info"**
4. Click **"View XML"**
5. In the URL bar, find `X-Plex-Token=...`
6. Copy the token value (everything after the `=`)

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/aceofaces/plex-playlists.git
cd plex-playlists

# Create environment file
cp .env.example .env

# Edit .env with your Plex credentials
nano .env  # or use any text editor

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f
```

**Access web UI:** http://localhost:8687

---

## Configuration

### Required Settings

Edit `.env` and set these two values:

```bash
PLEX_BASE_URL=http://localhost:32400  # Your Plex server URL
PLEX_AUTH_TOKEN=your-token-here       # Token from above
```

### Optional Settings

Common configurations:

```bash
# Timezone (important for scheduling!)
TZ=America/New_York

# Daily playlists schedule (default: 5am daily)
DAILY_PLAYLISTS_CRON=0 5 * * *

# Discovery playlist schedule (default: Monday 6am)
DISCOVERY_CRON=0 6 * * 1

# Playlist size (default: 50 tracks)
PLAYLIST_TARGET_SIZE=50

# Web UI port (default: 8687)
WEB_UI_PORT=8687
```

**See full config reference:** [Configuration Reference](configuration-reference.md)

---

## Timezone Setup

Cron schedules use the **container's timezone**. Set the `TZ` environment variable:

```yaml
# docker-compose.yml
services:
  plex-playlists:
    environment:
      - TZ=America/Los_Angeles  # Your timezone
```

**Common timezones:**
- `America/New_York` - Eastern
- `America/Chicago` - Central
- `America/Los_Angeles` - Pacific
- `Europe/London` - UK
- `Europe/Paris` - Central Europe

**Verify timezone:**
```bash
docker-compose exec plex-playlists date
```

---

## Web UI Overview

### Setup Wizard (First Run)

On first launch, the web UI walks you through:
1. Verify Plex connection
2. Configure scheduling
3. Set playlist preferences
4. Optional API keys (Last.fm, Spotify)

### Dashboard

Main interface showing:
- **Playlist Status** - Last generated, next scheduled run
- **Manual Generation** - Run playlists on-demand
- **Job History** - Success/failure tracking
- **Quick Actions** - Cache management, settings

### Custom Playlists

Create genre/mood combinations:
1. Navigate to **Playlists → Custom**
2. Click **"New Playlist"**
3. Configure:
   - Name (e.g., "Chill Electronic")
   - Genres (up to 2)
   - Moods (up to 2)
   - Target size (10-200 tracks)
4. Click **"Create"**

Playlists auto-generate weekly (configurable).

### Settings

Edit all configuration via web UI:
- Scheduling (cron expressions)
- Scoring parameters (recency, genre limits)
- API keys (Last.fm, Spotify)
- Playlist behavior (exploration rate, exclusions)

Changes take effect after container restart.

---

## Common Operations

### View Logs
```bash
docker-compose logs -f
```

### Restart Container
```bash
docker-compose restart
```

### Stop Container
```bash
docker-compose down
```

### Update to Latest Version
```bash
docker-compose down
git pull
docker-compose build
docker-compose up -d
```

### Access Container Shell (Advanced)
```bash
docker-compose exec plex-playlists sh
```

---

## Docker Networking

### Local Plex (Same Machine)

**Option 1: Host Network** (Recommended)
```yaml
# docker-compose.yml
services:
  plex-playlists:
    network_mode: host
    environment:
      - PLEX_BASE_URL=http://localhost:32400
```

**Option 2: Bridge Network**
```yaml
# docker-compose.yml
services:
  plex-playlists:
    environment:
      - PLEX_BASE_URL=http://host.docker.internal:32400
```

### Remote Plex

Use bridge network with remote IP:
```bash
PLEX_BASE_URL=http://192.168.1.100:32400
```

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker-compose logs
```

**Common issues:**
- Invalid Plex token → Re-generate token
- Port conflict → Change `WEB_UI_PORT` in `.env`
- Permission errors → Check volume permissions

### Can't Connect to Plex

**Test connection:**
```bash
curl -I http://localhost:32400/identity?X-Plex-Token=YOUR_TOKEN
```

**If fails:**
- Verify `PLEX_BASE_URL` is correct
- Check Docker networking mode
- Ensure Plex is running

### Playlists Not Generating

**Check job history in web UI:**
- Look for errors in dashboard
- Verify Plex has music library
- Check listening history exists

**Manual test:**
```bash
docker-compose exec plex-playlists node dist/cli.js run morning
```

### Wrong Timezone

**Verify current timezone:**
```bash
docker-compose exec plex-playlists date
```

**Fix:** Set `TZ` environment variable in `.env` and restart.

### Database Issues

**Reset database:**
```bash
docker-compose down
docker volume rm plex-playlists_data  # Or rm ./data/plex-playlists.db
docker-compose up -d
```

---

## Advanced: CLI Commands via Docker

Run CLI commands inside container:

```bash
# Cache management
docker-compose exec plex-playlists node dist/cli.js cache stats
docker-compose exec plex-playlists node dist/cli.js cache warm

# Manual playlist generation
docker-compose exec plex-playlists node dist/cli.js run morning
docker-compose exec plex-playlists node dist/cli.js run discovery

# Import ratings
docker-compose exec plex-playlists node dist/cli.js import /path/to/files
```

**For full CLI features, see:** [CLI Guide](cli-guide.md)

---

## Backup & Recovery

### Backup Database

```bash
# Copy database from Docker volume
docker cp plex-playlists:/data/plex-playlists.db ./backup-$(date +%Y%m%d).db
```

### Restore Database

```bash
docker-compose down
docker cp ./backup-20250110.db plex-playlists:/data/plex-playlists.db
docker-compose up -d
```

---

## Next Steps

- **Import ratings:** [Importing Guide](importing.md)
- **Genre enrichment:** Set up [Last.fm](api-setup/lastfm-setup.md) or [Spotify](api-setup/spotify-setup.md) API keys
- **Understand the algorithm:** [Algorithm Explained](algorithm-explained.md)
- **Troubleshooting:** [Full Troubleshooting Guide](troubleshooting.md)

---

**Need CLI access?** See [CLI Guide](cli-guide.md) for direct command usage.
