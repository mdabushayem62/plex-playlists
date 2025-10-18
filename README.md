# Plex Playlist Enhancer

Automated daily and custom Plex playlists using your listening history, star ratings, and sonic similarity - like Spotify's Daylist, but for Plex and open source.

## What This Does

Automatically generates smart playlists for your Plex music library:

- **🕐 Time-Based Daily Playlists** - Morning, afternoon, evening mixes based on your listening patterns
- **🔮 Weekly Discovery Playlist** - Rediscover forgotten gems from your library
- **⏮️ Weekly Throwback Playlist** - Nostalgic tracks from your past (adapts to your library history)
- **🎨 Custom Playlists** - Genre/mood combinations (e.g., "Chill Electronic", "Dark Synthwave")
- **📊 Smart Selection** - Epsilon-greedy algorithm balancing favorites with exploration
- **📥 Rating Import** - Bootstrap ratings from Spotify or YouTube Music exports

**Perfect for:**
- 🎧 Music lovers with large Plex libraries
- 🏠 Homelab enthusiasts who want to own their music streaming
- 📊 Data nerds who want algorithmic playlists without Spotify

---

## Getting Started

### 🐳 Docker Deployment (Recommended)

**5-minute setup with full web UI**

1. Create `docker-compose.yml`:
```yaml
services:
  plex-playlists:
    image: ghcr.io/aceofaces/plex-playlists:latest
    container_name: plex-playlists
    ports:
      - "8687:8687"
    volumes:
      - ./config:/config
    environment:
      - PLEX_BASE_URL=http://your-plex-server:32400
      - PLEX_AUTH_TOKEN=your-token-here
    restart: unless-stopped
```

2. Start: `docker-compose up -d`
3. Open web UI: **http://localhost:8687**
4. Complete setup wizard and configure your playlists!

👉 **[Full Docker Guide](docs/docker-guide.md)** for advanced configuration

### 💻 Local Development

**For contributors or advanced customization**

```bash
git clone https://github.com/aceofaces/plex-playlists
cd plex-playlists
npm install
npm run build
npm start
```

Web UI available at **http://localhost:8687**

👉 **[Development Guide](docs/cli-guide.md)** for full setup

---

## Key Features

### Intelligent Playlist Generation
- **Epsilon-greedy selection**: 85% exploitation (your favorites) + 15% exploration (discover new tracks)
- **Time-windowed analysis**: Morning (6-11am), afternoon (12-5pm), evening (6-11pm)
- **Discovery mode**: Surfaces tracks you haven't heard in 90+ days
- **Throwback mode**: Nostalgic tracks from your past with adaptive lookback windows (2-5 years for mature libraries, 3-6 months for newer libraries)
- **Cross-playlist deduplication**: No repeats across daily playlists for 7 days

### Smart Scoring
- **Exponential recency decay**: Recent plays weighted heavily (configurable half-life)
- **Star ratings**: Your ratings influence selection (60% weight)
- **Play count normalization**: Balanced against over-played tracks
- **Sonic similarity**: Expands playlists using Plex's audio analysis

### Metadata & Enrichment
- **Multi-source genre data**: Merges Plex, Last.fm, and Spotify metadata
- **90-day caching**: Minimize API calls with intelligent cache warming
- **Rating import**: Bootstrap from Spotify/YouTube Music playlists

### Web Interface
- **Interactive setup wizard**: Get started in minutes
- **Real-time job monitoring**: Watch playlist generation with SSE progress updates
- **Config management**: All settings in one place with live validation
- **Playlist builder**: Create custom genre/mood playlists visually
- **Analytics dashboard**: Track success rates, cache health, recent activity

### Operations
- **Docker ready**: Full containerization with docker-compose
- **SQLite persistence**: Track history and job execution
- **Cron scheduling**: Automatic playlist updates via web UI
- **Job queue**: Background processing with progress tracking

---

## Prerequisites

- **Plex Media Server** with a music library
- **Plex Auth Token** ([How to get it](docs/docker-guide.md#getting-your-plex-token))
- **Docker** (recommended) or **Node.js 20+** (for local development)

---

## Documentation

### Setup & Configuration
- [Docker Setup Guide](docs/docker-guide.md) - Production deployment (recommended)
- [Development Guide](docs/cli-guide.md) - Local development and customization
- [Configuration Reference](docs/configuration-reference.md) - Environment variables and settings

### Web UI Features
- **Dashboard** - System health, active jobs, and recent activity
- **Playlists** - View, regenerate, and manage all playlists
- **Playlist Builder** - Create custom genre/mood playlists
- **Config** - All settings including API keys, scheduling, and cache management
- **Analytics** - Job history, success rates, and performance metrics

### Additional Guides
- [Importing Ratings](docs/importing.md) - Bootstrap from Spotify/YouTube Music
- [Last.fm Setup](docs/api-setup/lastfm-setup.md) - Enhanced genre metadata
- [Spotify Setup](docs/api-setup/spotify-setup.md) - Genre enrichment API

### Reference
- [Algorithm Explained](docs/algorithm-explained.md) - How the smart selection works
- [Troubleshooting](docs/troubleshooting.md) - Common issues and fixes

---

## How It Works (Brief)

1. **Analyze** your Plex listening history (last 30 days, filtered by time window)
2. **Score** tracks using recency decay + star ratings + play counts
3. **Select** using epsilon-greedy: 85% top-scored tracks + 15% diverse exploration
4. **Expand** with Plex's sonic similarity if needed to reach target size
5. **Create** Plex playlist and track in database for cross-playlist deduplication

**Want details?** See [Algorithm Explained](docs/algorithm-explained.md)

---

## Support

- **Questions?** Check [Troubleshooting Guide](docs/troubleshooting.md)
- **Bugs/Features?** [Open an issue](https://github.com/aceofaces/plex-playlists/issues)
- **Contributing?** PRs welcome!

---

## License

MIT

## Acknowledgments

Inspired by Spotify's Daylist, [Meloday](https://github.com/trackstacker/meloday), and powered by [@ctrl/plex](https://github.com/scttcper/plex)
