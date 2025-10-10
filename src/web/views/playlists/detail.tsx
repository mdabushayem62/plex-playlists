/**
 * Playlist Detail Page - TSX version
 * Shows detailed view of a single playlist with tracks
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface Playlist {
  id: number;
  window: string;
  title: string | null;
  trackCount: number;
  generatedAt: Date;
  plexRatingKey: string | null;
  description?: string | null;
}

interface Track {
  position: number;
  ratingKey: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  genres: string | null;
  score: number | null;
  recencyWeight: number | null;
  fallbackScore: number | null;
}

interface JobRun {
  id: number;
  window: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

interface GenreStat {
  genre: string;
  count: number;
  percentage: number;
}

interface Breadcrumb {
  label: string;
  url: string | null;
}

export interface PlaylistDetailPageProps {
  playlist: Playlist;
  tracks: Track[];
  recentJobs: JobRun[];
  genreStats: GenreStat[];
  prevPlaylist: Playlist | null;
  nextPlaylist: Playlist | null;
  setupComplete: boolean;
  page: string;
  breadcrumbs: Breadcrumb[];
}

function timeAgo(date: Date): JSX.Element {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function getPlaylistEmoji(window: string): JSX.Element {
  if (window === 'morning') return '🌅';
  if (window === 'afternoon') return '☀️';
  if (window === 'evening') return '🌙';
  return '🎵';
}

function formatDate(date: Date): JSX.Element {
  return new Date(date).toLocaleString();
}

function formatScore(score: number | null): JSX.Element {
  return score ? score.toFixed(3) : '-';
}

export function PlaylistDetailPage(props: PlaylistDetailPageProps): JSX.Element {
  const {
    playlist,
    tracks,
    recentJobs,
    genreStats,
    prevPlaylist,
    nextPlaylist,
    setupComplete,
    page,
    breadcrumbs
  } = props;

  return (
    <Layout title={playlist.title || playlist.window} page={page} setupComplete={setupComplete}>
      <div>
        {/* Breadcrumbs & Navigation */}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          {breadcrumbs && (
            <nav aria-label="breadcrumb">
              <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color); margin: 0;">
                {breadcrumbs.map((crumb, idx) => (
                  <>
                    {idx > 0 && <li>›</li>}
                    <li>
                      {crumb.url ? (
                        <a href={crumb.url}>{crumb.label}</a>
                      ) : (
                        <span style="color: var(--pico-contrast);">{crumb.label}</span>
                      )}
                    </li>
                  </>
                ))}
              </ol>
            </nav>
          )}

          {/* Previous/Next Navigation */}
          <div style="display: flex; gap: 0.5rem;">
            {prevPlaylist ? (
              <a
                href={`/playlists/${prevPlaylist.id}`}
                role="button"
                class="secondary"
                style="padding: 0.5rem 1rem; margin: 0;"
                title={prevPlaylist.title || prevPlaylist.window}
              >
                ← Previous
              </a>
            ) : (
              <button disabled style="padding: 0.5rem 1rem; margin: 0;">← Previous</button>
            )}
            {nextPlaylist ? (
              <a
                href={`/playlists/${nextPlaylist.id}`}
                role="button"
                class="secondary"
                style="padding: 0.5rem 1rem; margin: 0;"
                title={nextPlaylist.title || nextPlaylist.window}
              >
                Next →
              </a>
            ) : (
              <button disabled style="padding: 0.5rem 1rem; margin: 0;">Next →</button>
            )}
          </div>
        </div>

        {/* Playlist Header */}
        <div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 2rem;">
          <div style="margin-bottom: 1rem;">
            <h2 style="margin: 0;">{playlist.title || playlist.window}</h2>
            {playlist.description && (
              <p style="margin: 0.5rem 0 0 0; color: var(--pico-muted-color);">
                {playlist.description}
              </p>
            )}
          </div>

          {/* Playlist Stats */}
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div>
              <p style="margin: 0; color: var(--pico-muted-color); font-size: 0.875rem;">Tracks</p>
              <p style="margin: 0; font-size: 1.5rem; font-weight: 600;">{playlist.trackCount}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--pico-muted-color); font-size: 0.875rem;">Last Generated</p>
              <p style="margin: 0; font-size: 1rem;">{timeAgo(playlist.generatedAt)}</p>
              <p style="margin: 0; color: var(--pico-muted-color); font-size: 0.75rem;">{formatDate(playlist.generatedAt)}</p>
            </div>
            {playlist.plexRatingKey && (
              <div>
                <p style="margin: 0; color: var(--pico-muted-color); font-size: 0.875rem;">Plex</p>
                <p style="margin: 0;">
                  <a href="#" style="font-size: 0.875rem;" title="Open in Plex (requires Plex app)">
                    View in Plex →
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Genre Tag Cloud */}
          {genreStats && genreStats.length > 0 && (
            <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color);">
              <p style="margin: 0 0 0.75rem 0; color: var(--pico-muted-color); font-size: 0.875rem; font-weight: 600;">
                Genres in this playlist:
              </p>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                {genreStats.slice(0, 15).map(g => (
                  <span
                    style={`
                      font-size: ${0.75 + (g.count / genreStats[0].count) * 0.4}rem;
                      padding: 0.25rem 0.75rem;
                      background: var(--pico-card-background-color);
                      border-radius: 1rem;
                      border: 1px solid var(--pico-muted-border-color);
                      white-space: nowrap;
                    `}
                    title={`${g.count} tracks (${g.percentage.toFixed(1)}%)`}
                  >
                    {g.genre}
                    <small style="color: var(--pico-muted-color); margin-left: 0.25rem;">{g.count}</small>
                  </span>
                ))}
                {genreStats.length > 15 && (
                  <span style="color: var(--pico-muted-color); font-size: 0.875rem; padding: 0.25rem 0.5rem;">
                    +{genreStats.length - 15} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color);">
            <button
              id="regenerateBtn"
              data-window={playlist.window}
              onclick="confirmRegenerate()"
              style="margin: 0;"
            >
              🔄 Regenerate
            </button>
            <a href={`/playlists/${playlist.id}/export/csv`} role="button" class="secondary" style="margin: 0;">
              📊 Export CSV
            </a>
            <a href={`/playlists/${playlist.id}/export/m3u`} role="button" class="secondary" style="margin: 0;">
              🎵 Export M3U
            </a>
            <a href="/config/playlists" role="button" class="secondary" style="margin: 0;">
              ⚙️ Configure
            </a>
          </div>
        </div>

        {/* Tracks Table */}
        <section>
          <h3>Tracks ({tracks.length})</h3>
          {tracks.length === 0 ? (
            <p style="color: var(--pico-muted-color);">No tracks in this playlist.</p>
          ) : (
            <>
              <div style="overflow-x: auto;">
                <table>
                  <thead>
                    <tr>
                      <th style="width: 50px;">#</th>
                      <th>Title</th>
                      <th>Artist</th>
                      <th>Album</th>
                      <th style="width: 120px; text-align: center;">Genres</th>
                      <th style="width: 100px; text-align: right;" title="Final Score (70% recency + 30% fallback)">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track) => {
                      // Parse genres for display
                      let trackGenres: string[] = [];
                      try {
                        if (track.genres) {
                          trackGenres = JSON.parse(track.genres);
                        }
                      } catch (e) {
                        // Ignore parse errors
                      }

                      // Build tooltip content
                      const tooltipContent = [
                        'Score Breakdown:',
                        '• Final: ' + formatScore(track.score),
                        '• Recency: ' + formatScore(track.recencyWeight),
                        '• Fallback: ' + formatScore(track.fallbackScore),
                        trackGenres.length > 0 ? '\nGenres: ' + trackGenres.join(', ') : ''
                      ].filter(Boolean).join('\n');

                      return (
                        <tr style="cursor: help;" title={tooltipContent}>
                          <td style="color: var(--pico-muted-color);">{track.position + 1}</td>
                          <td><strong>{track.title || 'Unknown Title'}</strong></td>
                          <td>{track.artist || 'Unknown Artist'}</td>
                          <td style="color: var(--pico-muted-color);">{track.album || '-'}</td>
                          <td style="text-align: center; font-size: 0.75rem;">
                            {trackGenres.length > 0 ? (
                              <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; justify-content: center;">
                                {trackGenres.slice(0, 2).map(g => (
                                  <span style="
                                    background: var(--pico-background-color);
                                    padding: 0.125rem 0.375rem;
                                    border-radius: 0.25rem;
                                    white-space: nowrap;
                                  ">{g}</span>
                                ))}
                                {trackGenres.length > 2 && (
                                  <span style="color: var(--pico-muted-color);">+{trackGenres.length - 2}</span>
                                )}
                              </div>
                            ) : (
                              <span style="color: var(--pico-muted-color);">-</span>
                            )}
                          </td>
                          <td style="text-align: right; font-family: monospace; font-size: 0.875rem;">
                            <span
                              class="score-badge"
                              style="
                                display: inline-block;
                                padding: 0.25rem 0.5rem;
                                background: var(--pico-background-color);
                                border-radius: 0.25rem;
                                font-weight: 600;
                              "
                              title={`Recency: ${formatScore(track.recencyWeight)} | Fallback: ${formatScore(track.fallbackScore)}`}
                            >
                              {formatScore(track.score)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--pico-muted-color);">
                💡 <strong>Tip:</strong> Hover over tracks to see detailed score breakdowns and full genre lists
              </p>
            </>
          )}
        </section>

        {/* Recent Generation History */}
        {recentJobs.length > 0 && (
          <section style="margin-top: 2rem;">
            <h3>Recent Generation History</h3>
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => {
                  const duration = job.finishedAt && job.startedAt
                    ? Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
                    : null;
                  return (
                    <tr>
                      <td>{timeAgo(job.startedAt)}</td>
                      <td>
                        <span class={`status-badge status-${job.status}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>{duration ? duration + 's' : job.status === 'running' ? '...' : '-'}</td>
                      <td style="color: var(--pico-del-color); font-size: 0.875rem;">
                        {job.error || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <script src="/js/playlist-detail.js"></script>
      </div>
    </Layout>
  );
}
