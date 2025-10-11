# CLI Setup Guide

Complete guide for installing and using the CLI directly, including development setup.

---

## Prerequisites

- **Node.js 20 or higher**
- **Plex Media Server** with a music library
- **Plex Auth Token** (see [Docker Guide - Getting Token](docker-guide.md#getting-your-plex-token))

---

## Installation

### Option 1: Install from npm (When Published)

```bash
npm install -g plex-playlists
plex-playlists --help
```

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/aceofaces/plex-playlists.git
cd plex-playlists

# Install dependencies
npm install

# Build
npm run build

# Run CLI
node dist/cli.js --help
```

### Option 3: Development Mode

```bash
# Clone repository
git clone https://github.com/aceofaces/plex-playlists.git
cd plex-playlists

# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev
```

---

## Configuration

Create `.env` file in project root:

```bash
cp .env.example .env
nano .env  # Edit with your settings
```

**Minimum required:**
```bash
PLEX_BASE_URL=http://localhost:32400
PLEX_AUTH_TOKEN=your-plex-token-here
```

**See full options:** [Configuration Reference](configuration-reference.md)

---

## CLI Commands

### Scheduler

Run continuous scheduler with cron-based automation:

```bash
plex-playlists start
```

Runs in foreground. Press `Ctrl+C` to stop gracefully.

### Manual Playlist Generation

```bash
# Time-based playlists
plex-playlists run morning
plex-playlists run afternoon
plex-playlists run evening

# Special playlists
plex-playlists run discovery      # Weekly discovery (forgotten gems)
plex-playlists run throwback      # Weekly throwback (2-5 years ago)

# Run all daily playlists sequentially
plex-playlists run-all
```

### Rating Import

Import ratings from Spotify/YouTube Music exports:

```bash
# Import from directory (auto-detects CSV/JSON)
plex-playlists import ~/music-exports/

# Dry run (preview without changes)
plex-playlists import ~/music-exports/ --dry-run
```

**See:** [Importing Guide](importing.md)

### Cache Management

```bash
# Show cache statistics
plex-playlists cache stats

# Warm genre cache for all artists
plex-playlists cache warm

# Warm with lower concurrency (safer)
plex-playlists cache warm --concurrency=5

# Dry run (preview only)
plex-playlists cache warm --dry-run

# Clear expired entries
plex-playlists cache clear

# Clear all cache
plex-playlists cache clear --all
```

---

## Scheduling

### Option 1: Built-in Scheduler (Recommended)

Configure cron expressions in `.env`:

```bash
DAILY_PLAYLISTS_CRON=0 5 * * *      # 5am daily
DISCOVERY_CRON=0 6 * * 1            # Monday 6am
THROWBACK_CRON=0 6 * * 6            # Saturday 6am
CUSTOM_PLAYLISTS_CRON=0 6 * * 0     # Sunday 6am
CACHE_WARM_CRON=0 3 * * 0           # Sunday 3am
CACHE_REFRESH_CRON=0 2 * * *        # 2am daily
```

Run scheduler:
```bash
plex-playlists start
```

**Run in background:**
```bash
# Using screen
screen -S plex-playlists
plex-playlists start
# Press Ctrl+A, then D to detach

# Using systemd (see below)
```

### Option 2: System Cron

Disable built-in scheduler and use system cron:

```bash
# Edit crontab
crontab -e

# Add entries
0 5 * * * /path/to/plex-playlists run-all
0 6 * * 1 /path/to/plex-playlists run discovery
0 6 * * 6 /path/to/plex-playlists run throwback
0 3 * * 0 /path/to/plex-playlists cache warm
```

### Option 3: Systemd Service

Create `/etc/systemd/system/plex-playlists.service`:

```ini
[Unit]
Description=Plex Playlist Enhancer
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/plex-playlists
ExecStart=/usr/bin/node /path/to/plex-playlists/dist/cli.js start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable plex-playlists
sudo systemctl start plex-playlists
sudo systemctl status plex-playlists
```

---

## Development

### Commands

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

### Database Migrations

```bash
# Generate migration after schema changes
npx drizzle-kit generate

# View database in Drizzle Studio
npx drizzle-kit studio
```

Migrations run automatically on app startup.

### Pre-commit Hooks

Husky runs checks before each commit:
1. ESLint (must pass with zero warnings)
2. Tests (all must pass)
3. Build (must compile successfully)

**Manual run:**
```bash
.husky/pre-commit
```

### Project Structure

```
src/
├── cli.ts                  # CLI entry point
├── config.ts               # Environment validation
├── playlist-runner.ts      # Core orchestration
├── db/                     # Database layer
├── history/                # History fetching/aggregation
├── playlist/               # Selection logic
│   ├── candidate-builder.ts
│   ├── selector.ts         # Epsilon-greedy selection
│   ├── fallback.ts
│   ├── sonic-expander.ts
│   ├── discovery.ts        # Discovery playlist
│   └── throwback.ts        # Throwback playlist
├── plex/                   # Plex API client
├── import/                 # Rating import
├── metadata/               # Genre enrichment
└── web/                    # Web UI server
```

---

## Scripting & Automation

### Bash Script Example

```bash
#!/bin/bash
# daily-playlists.sh

# Run all three daily playlists
plex-playlists run-all

# Check exit code
if [ $? -eq 0 ]; then
  echo "Playlists generated successfully"
else
  echo "Error generating playlists" >&2
  exit 1
fi
```

### Node.js Integration

```typescript
import { createApp } from 'plex-playlists';

const app = await createApp();
await app.runPlaylist('morning');
await app.close();
```

### Database Queries

```bash
# Direct SQLite access
sqlite3 ./data/plex-playlists.db

# View recent job runs
sqlite3 ./data/plex-playlists.db \
  "SELECT window, status, datetime(started_at/1000, 'unixepoch')
   FROM job_runs ORDER BY started_at DESC LIMIT 10;"
```

---

## Troubleshooting

### Installation Issues

**Node version error:**
```bash
# Check version
node --version  # Must be 20+

# Use nvm to upgrade
nvm install 20
nvm use 20
```

**Build fails:**
```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### Permission Errors

```bash
# Fix data directory permissions
chmod 755 ./data
chmod 644 ./data/plex-playlists.db
```

### CLI Not Found

```bash
# Use full path
node /path/to/plex-playlists/dist/cli.js run morning

# Or create alias
alias plex-playlists="node /path/to/plex-playlists/dist/cli.js"
```

### Scheduler Issues

**Check if already running:**
```bash
ps aux | grep "plex-playlists start"
```

**View logs:**
```bash
# Redirect to log file
plex-playlists start > /var/log/plex-playlists.log 2>&1
```

---

## Advanced Usage

### Custom Configuration per Environment

```bash
# Production
NODE_ENV=production plex-playlists start

# Development
NODE_ENV=development npm run dev
```

### Multiple Instances

Run separate instances with different databases:

```bash
# Instance 1
DATABASE_PATH=/data/plex1.db plex-playlists start

# Instance 2
DATABASE_PATH=/data/plex2.db plex-playlists start
```

### Monitoring with PM2

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/cli.js --name plex-playlists -- start

# View logs
pm2 logs plex-playlists

# Monitor
pm2 monit
```

---

## Next Steps

- **Web UI:** CLI includes web UI on http://localhost:8687 (configurable via `WEB_UI_PORT`)
- **Import ratings:** [Importing Guide](importing.md)
- **Genre enrichment:** [Last.fm](api-setup/lastfm-setup.md) / [Spotify](api-setup/spotify-setup.md) setup
- **Algorithm details:** [Algorithm Explained](algorithm-explained.md)
- **Full troubleshooting:** [Troubleshooting Guide](troubleshooting.md)

---

**Need Docker?** See [Docker Guide](docker-guide.md) for containerized deployment.
