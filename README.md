# Plex Playlist Enhancer

Smart Plex playlist automation that learns from your listening habits. Generate daily, weekly, and custom playlists using pattern analysis, star ratings, and intelligent track selection.

## What This Does

Automatically generates smart playlists for your Plex music library:

- **🕐 Daily Playlists** - Time-based mixes (morning, afternoon, evening) that adapt to your listening patterns
- **🔮 Discovery** - Surface forgotten gems and tracks you haven't heard in a while
- **⏮️ Throwback** - Nostalgic tracks from your listening history
- **🎨 Custom Playlists** - Build genre/mood combinations that match your taste
- **📊 Intelligent Selection** - Balanced algorithm that favors quality while encouraging exploration
- **🎯 Pattern Learning** - Adapts to when and what you prefer to listen to
- **📥 Rating Import** - Bootstrap from Spotify or YouTube Music exports

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

### Smart Selection
- **Balanced algorithm**: Favors your favorites while encouraging musical exploration
- **Pattern awareness**: Learns from your listening habits and time-of-day preferences
- **Cross-playlist deduplication**: Avoids repetition across your daily playlists
- **Quality scoring**: Combines star ratings, play counts, and listening recency
- **Sonic similarity**: Expands playlists using Plex's audio analysis

### Playlist Types
- **Time-based daily**: Morning, afternoon, and evening mixes adapted to your patterns
- **Discovery**: Rediscover forgotten tracks from your library
- **Throwback**: Nostalgic tracks from your listening history
- **Custom**: Genre and mood combinations you design

### Metadata & Enrichment
- **Multi-source genre data**: Enriches Plex metadata with Last.fm and Spotify
- **Intelligent caching**: Minimizes API calls while keeping data fresh
- **Rating import**: Bootstrap from Spotify or YouTube Music exports

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

## How It Works

1. **Analyze** your Plex listening history to understand your preferences
2. **Score** tracks using a combination of ratings, play patterns, and recency
3. **Select** tracks that balance your favorites with musical exploration
4. **Expand** using Plex's sonic similarity when needed
5. **Create** playlists and track selections to avoid repetition

The system learns from your listening behavior and adapts playlist generation to match your tastes over time.

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
