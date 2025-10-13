# Troubleshooting Guide

Quick solutions for common issues. Choose your deployment method below.

---

## 🐳 Docker Users

### Container Won't Start

**Check logs:**
```bash
docker-compose logs
```

**Common causes:**
- Invalid Plex token → Re-generate and update `.env`
- Port 8687 in use → Change `WEB_UI_PORT` in `.env`
- Database locked → Stop other instances: `docker ps | grep plex-playlists`

**Fix:**
```bash
docker-compose down
# Fix .env
docker-compose up -d
```

### Can't Connect to Plex

**Test connection:**
```bash
curl -I http://localhost:32400/identity?X-Plex-Token=YOUR_TOKEN
```

**If fails:**
- Local Plex: Try `network_mode: host` in `docker-compose.yml`
- Remote Plex: Use IP address in `PLEX_BASE_URL` (e.g., `http://192.168.1.100:32400`)

**Host network mode:**
```yaml
# docker-compose.yml
services:
  plex-playlists:
    network_mode: host
```

### Playlists Not Generating

**Check web UI dashboard for errors**

**Manual test:**
```bash
docker-compose exec plex-playlists node dist/cli.js run morning
```

**Common issues:**
- No listening history → Play music in Plex first
- Wrong timezone → Set `TZ=America/New_York` in `.env`
- Cron schedule incorrect → Verify cron syntax

### Wrong Timezone

**Check current timezone:**
```bash
docker-compose exec plex-playlists date
```

**Fix in `.env`:**
```bash
TZ=America/New_York  # Your timezone
```

**Restart:**
```bash
docker-compose restart
```

### Database Corruption

**Symptoms:** `database disk image is malformed`

**Recovery:**
```bash
docker-compose down
docker volume rm plex-playlists_data
docker-compose up -d
```

**Or restore from backup:**
```bash
docker cp ./backup.db plex-playlists:/data/plex-playlists.db
```

### Update to Latest Version

```bash
docker-compose down
git pull
docker-compose build
docker-compose up -d
```

---

## 💻 CLI Users

### Installation Issues

**Node version too old:**
```bash
node --version  # Must be 20+
nvm install 20
nvm use 20
```

**Build fails:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Permission Errors

**Database access denied:**
```bash
chmod 755 ./data
chmod 644 ./data/plex-playlists.db
```

**Can't write logs:**
```bash
mkdir -p ~/.local/share/plex-playlists/logs
chmod 755 ~/.local/share/plex-playlists/logs
```

### CLI Command Not Found

**Use full path:**
```bash
node /path/to/plex-playlists/dist/cli.js run morning
```

**Or create alias:**
```bash
alias plex-playlists="node /path/to/plex-playlists/dist/cli.js"
```

### Scheduler Not Running

**Check if already running:**
```bash
ps aux | grep "plex-playlists start"
```

**Kill old instance:**
```bash
pkill -f "plex-playlists start"
```

**Check logs:**
```bash
plex-playlists start > /var/log/plex-playlists.log 2>&1
tail -f /var/log/plex-playlists.log
```

### Systemd Service Issues

**Service won't start:**
```bash
sudo systemctl status plex-playlists
sudo journalctl -u plex-playlists -f
```

**Fix permissions:**
```bash
sudo chown your-user:your-user /path/to/plex-playlists
```

**Reload after editing service:**
```bash
sudo systemctl daemon-reload
sudo systemctl restart plex-playlists
```

---

## Common to Both

### No Tracks in Playlist

**Causes:**
- No listening history in time window
- Overly restrictive constraints

**Solutions:**
```bash
# Check listening history
# (Via Plex Web → More → History)

# Relax constraints in .env
MAX_GENRE_SHARE=0.6      # Allow 60% per genre
MAX_PER_ARTIST=3         # Allow 3 tracks per artist
HISTORY_DAYS=60          # Analyze more history
```

### Plex Authentication Failed

**Cause:** Invalid or expired token

**Get new token:**
1. Plex Web → Play media → ⋯ → Get Info → View XML
2. Copy `X-Plex-Token=...` from URL
3. Update `.env`
4. Restart

### Rate Limiting (Spotify/Last.fm)

**Spotify 429 errors:**
- Built-in exponential backoff (automatic)
- Reduce concurrency: `CACHE_WARM_CONCURRENCY=5`

**Last.fm timeouts:**
- Very rare (generous limits)
- Reduce concurrency if needed

**Check rate limit status:**
```bash
# Docker
docker-compose logs | grep "rate limit"

# CLI
grep "rate limit" /var/log/plex-playlists.log
```

### Artist & Album Cache Issues

**Cache not populating:**
```bash
# Docker
docker-compose exec plex-playlists node dist/cli.js cache warm --dry-run

# CLI
plex-playlists cache warm --dry-run
```

**API keys not working:**
- Verify keys in `.env`
- Test Spotify: `curl -X POST https://accounts.spotify.com/api/token ...`
- Test Last.fm: `curl "http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&api_key=YOUR_KEY&artist=Radiohead&format=json"`

**Clear corrupt cache:**
```bash
# Docker
docker-compose exec plex-playlists node dist/cli.js cache clear --all

# CLI
plex-playlists cache clear --all
```

### Database Errors

**"Database is locked":**
- Only one process accessing database at a time
- Stop duplicate instances

**"Database disk image is malformed":**
```bash
# Docker
docker-compose down
docker volume rm plex-playlists_data
docker-compose up -d

# CLI
rm ./data/plex-playlists.db*
npm run build && npm start
```

### Large Library Performance

**Symptoms:** Slow generation (>60 seconds), timeouts

**Optimizations in `.env`:**
```bash
FALLBACK_LIMIT=100       # Reduce Plex API load
HISTORY_DAYS=21          # Analyze less history
CACHE_WARM_CONCURRENCY=5 # More conservative
```

### Web UI Not Loading

**Check port:**
```bash
# Docker
docker-compose ps  # Verify port 8687 mapped

# CLI
lsof -i :8687  # Check if port in use
```

**Change port:**
```bash
WEB_UI_PORT=9090
```

**Verify web UI enabled:**
```bash
WEB_UI_ENABLED=true
```

---

## Backup & Recovery

### Backup Database

**Docker:**
```bash
docker cp plex-playlists:/data/plex-playlists.db ./backup-$(date +%Y%m%d).db
```

**CLI:**
```bash
cp ./data/plex-playlists.db ./backup-$(date +%Y%m%d).db
```

### Restore Database

**Docker:**
```bash
docker-compose down
docker cp ./backup-20250110.db plex-playlists:/data/plex-playlists.db
docker-compose up -d
```

**CLI:**
```bash
cp ./backup-20250110.db ./data/plex-playlists.db
```

---

## Diagnostic Commands

### View Job History

**Docker:**
```bash
docker-compose exec plex-playlists sqlite3 /data/plex-playlists.db \
  "SELECT window, status, datetime(started_at/1000, 'unixepoch')
   FROM job_runs ORDER BY started_at DESC LIMIT 10;"
```

**CLI:**
```bash
sqlite3 ./data/plex-playlists.db \
  "SELECT window, status, datetime(started_at/1000, 'unixepoch')
   FROM job_runs ORDER BY started_at DESC LIMIT 10;"
```

### Check Cache Stats

**Docker:**
```bash
docker-compose exec plex-playlists node dist/cli.js cache stats
```

**CLI:**
```bash
plex-playlists cache stats
```

### View Live Logs

**Docker:**
```bash
docker-compose logs -f
```

**CLI:**
```bash
tail -f /var/log/plex-playlists.log
```

---

## Getting Help

If issues persist:

1. **Check logs** with `LOG_LEVEL=debug`
2. **Test components individually:**
   - Plex connection: `curl http://localhost:32400/identity?X-Plex-Token=TOKEN`
   - Database: `sqlite3 ./data/plex-playlists.db "SELECT COUNT(*) FROM playlists;"`
3. **Review configuration:** [Configuration Reference](configuration-reference.md)
4. **Search issues:** [GitHub Issues](https://github.com/aceofaces/plex-playlists/issues)
5. **Open new issue** with:
   - Deployment method (Docker/CLI)
   - Relevant logs (redact tokens!)
   - Steps to reproduce

---

## Related Documentation

- [Docker Guide](docker-guide.md) - Docker-specific setup
- [CLI Guide](cli-guide.md) - CLI installation and usage
- [Configuration Reference](configuration-reference.md) - All environment variables
- [Algorithm Explained](algorithm-explained.md) - How playlists are generated
