# Reference Projects & Resources

## Plex & Playlist Generators
- **Meloday** — Intelligent Plex daylist-style playlist generator. Highlights time-sliced history analysis, sonic similarity usage, and creative naming.
  - Repo: https://github.com/trackstacker/meloday
  - Key file: `meloday.py`
- **DiscoveryLastFM** — Automates music discovery via Last.fm history, MusicBrainz metadata, and Lidarr/Headphones integrations.
  - Repo: https://github.com/MrRobotoGit/DiscoveryLastFM
  - Highlights: modular service layer, caching, retry logic.
- **AudioMuse-AI** — Sonic analysis platform (Librosa + TensorFlow) for self-hosted libraries (Jellyfin/Navidrome/Lyrion).
  - Repo: https://github.com/NeptuneHub/AudioMuse-AI
  - Illustrates heavier ML-based clustering, playlist path finding, and Docker/K8s deployment patterns.

## Plex API Documentation
- **python-plexapi Audio** — Reference for `Audio.sonicallySimilar` and related endpoints.
  - Docs: https://python-plexapi.readthedocs.io/en/latest/modules/audio.html#plexapi.audio.Audio.sonicallySimilar
  - Source: https://raw.githubusercontent.com/pkkid/python-plexapi/master/plexapi/audio.py
- **@ctrl/plex** — TypeScript Plex API client mirroring python-plexapi.
  - Repo: https://github.com/scttcper/plex
  - Docs: https://ctrl-plex.vercel.app

## Additional Inspiration
- **Plex documentation** on playlists and history endpoints (general reference):
  - https://support.plex.tv/articles/201311091-plex-media-server-url-commands/
- **Spotify Daylist** concept (external inspiration for dynamic time-of-day playlists):
  - https://www.spotify.com/us/daylist/

