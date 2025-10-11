# Plex Playlist Enhancer

Automated daily and custom Plex playlists using your listening history, star ratings, and sonic similarity - like Spotify's Daylist, but for Plex and open source.

## What This Does

Automatically generates smart playlists for your Plex music library:

- **🕐 Time-Based Daily Playlists** - Morning, afternoon, evening mixes based on your listening patterns
- **🔮 Weekly Discovery Playlist** - Rediscover forgotten gems from your library
- **⏮️ Weekly Throwback Playlist** - Nostalgic tracks from 2-5 years ago
- **🎨 Custom Playlists** - Genre/mood combinations (e.g., "Chill Electronic", "Dark Synthwave")
- **📊 Smart Selection** - Epsilon-greedy algorithm balancing favorites with exploration
- **📥 Rating Import** - Bootstrap ratings from Spotify or YouTube Music exports

**Perfect for:**
- 🎧 Music lovers with large Plex libraries
- 🏠 Homelab enthusiasts who want to own their music streaming
- 📊 Data nerds who want algorithmic playlists without Spotify

---

## Getting Started

Choose your deployment method:

### 🐳 Docker Users (Recommended)

**Best for:** Easy setup with web UI for management

**What you get:**
- One-command deployment with docker-compose
- Web UI for configuration and monitoring
- Automatic scheduling and updates
- Zero Node.js/npm knowledge required

👉 **[Docker Setup Guide](docs/docker-guide.md)**

### 💻 CLI Users & Developers

**Best for:** Scriptable automation, customization, or development

**What you get:**
- Direct CLI commands for all operations
- Scriptable with cron or custom workflows
- Development environment with hot reload
- Full database and code access

👉 **[CLI Setup Guide](docs/cli-guide.md)**

---

## Quick Comparison

| Feature | Docker | CLI |
|---------|--------|-----|
| **Setup Time** | 5 minutes | 10 minutes |
| **Web UI** | ✅ Included | ✅ Included |
| **CLI Commands** | Via `docker-compose exec` | Direct access |
| **Auto Updates** | Container rebuild | `git pull && npm install` |
| **Customization** | Environment variables | Full code access |
| **Best For** | Set-and-forget | Power users |

---

## Key Features

### Intelligent Playlist Generation
- **Epsilon-greedy selection**: 85% exploitation (your favorites) + 15% exploration (discover new tracks)
- **Time-windowed analysis**: Morning (6-11am), afternoon (12-5pm), evening (6-11pm)
- **Discovery mode**: Surfaces tracks you haven't heard in 90+ days
- **Throwback mode**: Nostalgic tracks from 2-5 years ago (configurable window)
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

### Operations
- **Docker ready**: Full containerization with docker-compose
- **SQLite persistence**: Track history and job execution
- **Cron scheduling**: Automatic playlist updates
- **Job monitoring**: Web UI with real-time progress tracking

---

## Prerequisites

- **Plex Media Server** with a music library
- **Plex Auth Token** ([How to get it](docs/docker-guide.md#getting-your-plex-token))
- **Docker** (for Docker path) or **Node.js 20+** (for CLI path)

---

## Documentation

### Setup Guides
- [Docker Setup Guide](docs/docker-guide.md) - Docker deployment with web UI
- [CLI Setup Guide](docs/cli-guide.md) - CLI installation and usage
- [Configuration Reference](docs/configuration-reference.md) - All environment variables

### How-To Guides
- [Importing Ratings](docs/importing.md) - Import ratings from Spotify/YouTube Music
- [Last.fm Setup](docs/api-setup/lastfm-setup.md) - Genre enrichment via Last.fm
- [Spotify Setup](docs/api-setup/spotify-setup.md) - Genre enrichment via Spotify

### Reference
- [Algorithm Explained](docs/algorithm-explained.md) - Scoring, selection, and discovery
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [Roadmap](docs/roadmap.md) - Planned features and completed work

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
