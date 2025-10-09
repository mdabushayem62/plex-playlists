# Troubleshooting Guide

Comprehensive guide to common issues, error recovery, and operational concerns for homelab deployments.

---

## Error Recovery & Resilience

### What Happens When Plex Server is Down?

**Scheduled Runs:**
- If Plex is unreachable during a scheduled playlist generation, the job will **fail gracefully**
- The error is logged to the database in the `job_runs` table with status `'failed'`
- The scheduler **continues running** and will retry at the next scheduled time
- No data corruption or crashes occur

**Behavior:**
```javascript
// Example from scheduler.ts
cron.schedule(expression, () => {
  runWindowJob(window)
    .catch(error => logger.error({ window, err: error }, 'playlist generation failed'));
  // Scheduler continues running despite the error
});
```

**Check Failed Jobs:**
```sql
-- View recent failed jobs
SELECT * FROM job_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 10;
```

**Manual Recovery:**
```bash
# After Plex is back online, manually trigger failed window
docker-compose exec plex-playlists node dist/cli.js run morning

# Or restart the scheduler to clear any stuck state
docker-compose restart plex-playlists
```

---

## Rate Limiting & API Timeouts

### Plex API

**Current Behavior:**
- Uses `@ctrl/plex` library defaults (no custom timeout configuration)
- No built-in retry logic for Plex API calls
- Connection timeout: ~30 seconds (library default)
- No rate limiting (Plex generally doesn't enforce strict rate limits for personal servers)

**If Plex API is Slow:**
- Large libraries (>10,000 tracks) may take time to fetch metadata
- Fallback fetch limited to 200 tracks by default (configurable via `FALLBACK_LIMIT`)
- Sonic similarity expansion happens sequentially to avoid overwhelming Plex

**Timeout Errors:**
```
Error: playlist run failed
Cause: getaddrinfo ENOTFOUND localhost
```
or
```
Error: playlist run failed
Cause: connect ETIMEDOUT
```

**Solutions:**
1. Increase `FALLBACK_LIMIT` if you have a fast Plex server and want more variety:
   ```bash
   FALLBACK_LIMIT=500  # Default is 200
   ```

2. Decrease `FALLBACK_LIMIT` if Plex API times out frequently:
   ```bash
   FALLBACK_LIMIT=100  # More conservative
   ```

3. Check Plex server health:
   ```bash
   curl -I http://localhost:32400/identity?X-Plex-Token=YOUR_TOKEN
   ```

### Spotify API

**Built-in Rate Limiting:**
- ✅ Automatic rate limit detection (HTTP 429 responses)
- ✅ Exponential backoff retry (1s → 2s → 4s → 8s → 16s)
- ✅ Respects `Retry-After` header from Spotify
- ✅ Timeout: 5 seconds per request
- ✅ Retry attempts: Up to 5 times

**Configuration:**
```typescript
// From src/metadata/providers/spotify.ts
timeout: { request: 5000 }      // 5 second timeout
retry: { limit: 5 }              // 5 retry attempts
baseRetryDelay: 1000             // Start at 1 second, exponential backoff
```

**Rate Limit Log Example:**
```
INFO: waiting for spotify rate limit to reset (waitMs: 3000)
INFO: spotify rate limit hit, retrying after delay (attempt: 2, delayMs: 2000)
```

### Last.fm API

**Built-in Configuration:**
- ✅ Timeout: 10 seconds per request
- ✅ Retry attempts: Up to 3 times
- ✅ Last.fm is very generous with rate limits (typically no issues)

**Configuration:**
```typescript
// From src/metadata/providers/lastfm.ts
timeout: { request: 10000 }     // 10 second timeout
retry: { limit: 3 }              // 3 retry attempts
```

---

## Database Backup & Restore

### Backup Strategy

**Automatic Backups (Recommended):**

Create a simple backup script that runs daily:

```bash
#!/bin/bash
# /usr/local/bin/backup-plex-playlists.sh

BACKUP_DIR="/path/to/backups/plex-playlists"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="/path/to/data/plex-playlists.db"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Copy database (handles SQLite locking gracefully)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/plex-playlists-$TIMESTAMP.db'"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "plex-playlists-*.db" -mtime +30 -delete

echo "Backup complete: plex-playlists-$TIMESTAMP.db"
```

**Add to crontab:**
```bash
# Run daily at 3 AM
0 3 * * * /usr/local/bin/backup-plex-playlists.sh >> /var/log/plex-playlists-backup.log 2>&1
```

**Docker Volume Backup:**
```bash
# Backup Docker volume
docker run --rm -v plex-playlists_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/plex-playlists-data-$(date +%Y%m%d).tar.gz /data

# List backups
ls -lh plex-playlists-data-*.tar.gz
```

### Restore from Backup

**Method 1: Direct File Restore**
```bash
# Stop the container
docker-compose down

# Replace database file
cp /path/to/backups/plex-playlists-20250109.db ./data/plex-playlists.db

# Restart
docker-compose up -d
```

**Method 2: Docker Volume Restore**
```bash
# Stop the container
docker-compose down

# Restore from tar
docker run --rm -v plex-playlists_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/plex-playlists-data-20250109.tar.gz -C /

# Restart
docker-compose up -d
```

**Verify Restore:**
```bash
# Check database integrity
docker-compose exec plex-playlists node -e "
  const db = require('better-sqlite3')('/data/plex-playlists.db');
  const count = db.prepare('SELECT COUNT(*) as cnt FROM playlists').get();
  console.log('Playlists in database:', count.cnt);
"

# Or query job history
docker-compose exec plex-playlists sqlite3 /data/plex-playlists.db \
  "SELECT window, datetime(started_at/1000, 'unixepoch') as started, status FROM job_runs ORDER BY started_at DESC LIMIT 10;"
```

### Database Corruption Recovery

**Symptoms:**
- `Error: database disk image is malformed`
- `Error: file is not a database`
- Container crashes on startup

**Recovery Steps:**
```bash
# 1. Stop the container
docker-compose down

# 2. Try SQLite recovery
sqlite3 ./data/plex-playlists.db ".recover" | sqlite3 ./data/plex-playlists-recovered.db

# 3. If recovery works, replace the database
mv ./data/plex-playlists.db ./data/plex-playlists-corrupted-backup.db
mv ./data/plex-playlists-recovered.db ./data/plex-playlists.db

# 4. If recovery fails, restore from backup
cp /path/to/backups/plex-playlists-LATEST.db ./data/plex-playlists.db

# 5. Restart
docker-compose up -d
```

**If No Backup Exists:**
```bash
# Nuclear option: delete database and regenerate from scratch
docker-compose down
rm -f ./data/plex-playlists.db*
docker-compose up -d

# Database will be recreated with migrations on startup
# Run manual playlist generation to rebuild history
docker-compose exec plex-playlists node dist/cli.js run morning
```

---

## Health Monitoring

### Container Health Check

**Current Healthcheck** (basic process check):
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1
```

This only verifies the Node.js process is running, not that the scheduler is working.

**Improved Healthcheck** (see Docker section below for implementation):
- Check if database is accessible
- Verify scheduler has run jobs recently
- Ensure Plex connection is alive

### Monitoring Job Status

**View Recent Jobs:**
```bash
# Show last 20 job runs
docker-compose exec plex-playlists sqlite3 /data/plex-playlists.db <<EOF
.headers on
.mode column
SELECT
  window,
  datetime(started_at/1000, 'unixepoch') as started,
  datetime(finished_at/1000, 'unixepoch') as finished,
  status,
  substr(error, 1, 50) as error_preview
FROM job_runs
ORDER BY started_at DESC
LIMIT 20;
EOF
```

**Check for Consecutive Failures:**
```bash
# Alert if last 3 runs all failed
docker-compose exec plex-playlists sqlite3 /data/plex-playlists.db \
  "SELECT COUNT(*) FROM (SELECT status FROM job_runs ORDER BY started_at DESC LIMIT 3) WHERE status = 'failed';"
```

**Prometheus Metrics (Future Enhancement):**
```bash
# Example metrics endpoint (not yet implemented)
curl http://localhost:9090/metrics

# Would show:
# plex_playlists_jobs_total{window="morning",status="success"} 42
# plex_playlists_jobs_total{window="morning",status="failed"} 2
# plex_playlists_last_run_timestamp{window="morning"} 1704772800
```

---

## Common Error Scenarios

### 1. "No tracks selected for playlist"

**Cause:** Insufficient history or overly restrictive filters.

**Solutions:**
```bash
# Check if you have listening history
docker-compose exec plex-playlists sqlite3 /data/plex-playlists.db \
  "SELECT COUNT(*) FROM history_cache;"

# Temporarily lower constraints
MAX_GENRE_SHARE=0.6  # Allow 60% instead of 40%
MAX_PER_ARTIST=3     # Allow 3 tracks per artist instead of 2
```

### 2. "Database is locked"

**Cause:** Multiple processes accessing SQLite simultaneously.

**Solutions:**
```bash
# Ensure only one container is running
docker ps | grep plex-playlists

# If multiple instances, stop extras
docker stop <container-id>

# Check for stale lock files
ls -la ./data/plex-playlists.db*
rm -f ./data/plex-playlists.db-shm ./data/plex-playlists.db-wal
```

### 3. "Plex authentication failed"

**Cause:** Invalid or expired auth token.

**Solutions:**
```bash
# Test Plex connection manually
curl -H "X-Plex-Token: YOUR_TOKEN" http://localhost:32400/identity

# Get a fresh token (see README "Getting Your Plex Token" section)

# Update .env file
PLEX_AUTH_TOKEN=new-token-here

# Restart container
docker-compose restart plex-playlists
```

### 4. Genre Cache Warming Timeouts

**Cause:** Too many artists, Spotify/Last.fm rate limits.

**Solutions:**
```bash
# Use lower concurrency
plex-playlists cache warm --concurrency=5  # Default is 10

# Warm cache in batches over multiple days
# Let the scheduled runs naturally build the cache over time
```

---

## Docker & Networking

### Host Network Mode (Local Plex)

If Plex runs on `localhost` or same Docker host:

```yaml
# docker-compose.yml
services:
  plex-playlists:
    network_mode: host
    environment:
      - PLEX_BASE_URL=http://localhost:32400
```

**Important:** In host mode, published ports are ignored (container uses host network directly).

### Bridge Mode (Remote Plex)

If Plex runs on a different server:

```yaml
# docker-compose.yml
services:
  plex-playlists:
    networks:
      - default
    ports:
      - "9090:9090"  # If you add metrics endpoint later
    environment:
      - PLEX_BASE_URL=http://192.168.1.100:32400
```

### DNS Resolution Issues

**Symptoms:**
```
Error: getaddrinfo EAI_AGAIN plex.example.com
```

**Solutions:**
```yaml
# docker-compose.yml
services:
  plex-playlists:
    dns:
      - 8.8.8.8
      - 1.1.1.1
    extra_hosts:
      - "plex.local:192.168.1.100"
```

---

## Performance Optimization

### Large Libraries (>10,000 tracks)

**Symptoms:**
- Slow playlist generation (>60 seconds)
- Plex API timeouts

**Optimizations:**
```bash
# Reduce fallback candidate fetch size
FALLBACK_LIMIT=100         # Default: 200

# Reduce history window
HISTORY_DAYS=14            # Default: 30

# Pre-warm genre cache during off-peak hours
# Add to crontab: warm cache at 2 AM daily
0 2 * * * docker-compose exec plex-playlists node dist/cli.js cache warm --concurrency=5
```

### Database Growth

**Check Database Size:**
```bash
du -h ./data/plex-playlists.db
```

**Typical Sizes:**
- 1 month of operation: ~500 KB - 2 MB
- 1 year of operation: ~5 MB - 20 MB

**Cleanup Old Job Runs:**
```sql
-- Delete job runs older than 90 days
DELETE FROM job_runs
WHERE started_at < (strftime('%s', 'now', '-90 days') * 1000);

-- Vacuum to reclaim space
VACUUM;
```

---

## Logs & Debugging

### View Live Logs

```bash
# Follow all logs
docker-compose logs -f plex-playlists

# Filter for errors only
docker-compose logs plex-playlists | grep ERROR

# Filter by window
docker-compose logs plex-playlists | grep "window.*morning"
```

### Log Levels

Controlled by Pino logger (structured JSON logs).

**Change log level:**
```yaml
# docker-compose.yml
environment:
  - LOG_LEVEL=debug  # Options: debug, info, warn, error
```

**Example debug output:**
```json
{
  "level": 20,
  "time": 1704772800000,
  "window": "morning",
  "historyEntries": 342,
  "uniqueTracks": 215,
  "msg": "history retrieved and aggregated"
}
```

### Export Logs for Analysis

```bash
# Export last 1000 lines to file
docker-compose logs --tail=1000 plex-playlists > plex-playlists-debug.log

# Export with timestamps
docker-compose logs -t plex-playlists > plex-playlists-timestamped.log
```

---

## Getting Help

If issues persist after trying these troubleshooting steps:

1. **Check Logs:** Run with `LOG_LEVEL=debug` to get detailed output
2. **Verify Setup:** Test each component individually:
   - Plex connection: `curl http://localhost:32400/identity?X-Plex-Token=TOKEN`
   - Database access: `sqlite3 ./data/plex-playlists.db "SELECT COUNT(*) FROM playlists;"`
   - Spotify API: `npx tsx test-spotify.ts` (if configured)
   - Last.fm API: `npx tsx test-lastfm.ts` (if configured)

3. **Check Job History:** Review `job_runs` table for patterns
4. **Review Configuration:** Ensure `.env` file matches `.env.example` structure
5. **GitHub Issues:** Search existing issues or open a new one with:
   - Docker/Node version
   - Relevant logs (redact auth tokens!)
   - Configuration (without secrets)
   - Steps to reproduce

---

## Advanced Recovery

### Force Playlist Regeneration

```bash
# Delete specific playlist from Plex and database, then regenerate
docker-compose exec plex-playlists node -e "
const db = require('better-sqlite3')('/data/plex-playlists.db');
db.prepare('DELETE FROM playlists WHERE window = ?').run('morning');
db.prepare('DELETE FROM playlist_tracks WHERE playlist_id NOT IN (SELECT id FROM playlists)').run();
"

# Regenerate
docker-compose exec plex-playlists node dist/cli.js run morning
```

### Reset All Playlists

```bash
# Nuclear option: clear all playlist data, keep job history
docker-compose exec plex-playlists sqlite3 /data/plex-playlists.db <<EOF
DELETE FROM playlist_tracks;
DELETE FROM playlists;
VACUUM;
EOF

# Regenerate all windows
docker-compose exec plex-playlists node dist/cli.js run morning
docker-compose exec plex-playlists node dist/cli.js run afternoon
docker-compose exec plex-playlists node dist/cli.js run evening
```

---

## Reference

- [README.md](./README.md) - General usage and setup
- [IMPORTING.md](./IMPORTING.md) - CSV import troubleshooting
- [LASTFM_SETUP.md](./LASTFM_SETUP.md) - Last.fm API issues
- [SPOTIFY_SETUP.md](./SPOTIFY_SETUP.md) - Spotify API issues
- [Plex API Documentation](https://www.plexopedia.com/plex-media-server/api/) - Unofficial Plex API reference
