/**
 * Playlists Index Page - TSX version
 * Lists all playlists with search/filter functionality
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
  category?: string;
  lastJob?: JobRun | null;
}

interface JobRun {
  id: number;
  window: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

export interface PlaylistsIndexPageProps {
  playlists: Playlist[];
  dailyPlaylists: Playlist[];
  genrePlaylists: Playlist[];
  totalTracks: number;
  setupComplete: boolean;
  page: string;
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

export function PlaylistsIndexPage(props: PlaylistsIndexPageProps): JSX.Element {
  const {
    playlists,
    dailyPlaylists,
    genrePlaylists,
    totalTracks,
    setupComplete,
    page
  } = props;

  return (
    <Layout title="Playlists" page={page} setupComplete={setupComplete}>
      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Playlists</span></li>
          </ol>
        </nav>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2>Playlists</h2>
          <a href="/playlists/builder" role="button" class="secondary">🎨 Create Custom Playlist</a>
        </div>

        {playlists.length === 0 ? (
          <div style="background: var(--pico-card-background-color); padding: 2rem; border-radius: 0.5rem; text-align: center;">
            <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
              No playlists generated yet.
            </p>
            <a href="/playlists/builder" role="button">🎨 Create Your First Playlist</a>
          </div>
        ) : (
          <>
            {/* Search/Filter */}
            <div style="margin-bottom: 2rem;">
              <input
                type="search"
                id="playlistSearch"
                placeholder="🔍 Search playlists by name or window..."
                oninput="filterPlaylists(this.value)"
                style="margin-bottom: 0;"
              />
              <small id="searchResults" style="color: var(--pico-muted-color);"></small>
            </div>

            {/* Overview Stats */}
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
              <div class="stat-card">
                <h3>{playlists.length}</h3>
                <p>Total Playlists</p>
              </div>
              <div class="stat-card">
                <h3>{dailyPlaylists.length}</h3>
                <p>Daily Playlists</p>
              </div>
              <div class="stat-card">
                <h3>{genrePlaylists.length}</h3>
                <p>Genre Playlists</p>
              </div>
              <div class="stat-card">
                <h3>{totalTracks}</h3>
                <p>Total Tracks</p>
              </div>
            </div>

            {/* Daily Playlists Section */}
            {dailyPlaylists.length > 0 && (
              <section style="margin-bottom: 3rem;">
                <h3>Daily Playlists</h3>
                <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
                  Time-based playlists generated from your listening patterns throughout the day.
                </p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
                  {dailyPlaylists.map(playlist => (
                    <article style="margin-bottom: 0;">
                      <header>
                        <h4 style="margin: 0;">
                          <a href={`/playlists/${playlist.id}`} style="text-decoration: none; color: inherit;">
                            {playlist.title || playlist.window}
                          </a>
                        </h4>
                      </header>
                      <div style="padding: 0.5rem 0;">
                        <p style="margin: 0.25rem 0; color: var(--pico-muted-color); font-size: 0.875rem;">
                          <strong>{playlist.trackCount}</strong> tracks
                        </p>
                        <p style="margin: 0.25rem 0; color: var(--pico-muted-color); font-size: 0.875rem;">
                          Updated {timeAgo(playlist.generatedAt)}
                        </p>
                        {playlist.lastJob && playlist.lastJob.status === 'failed' && (
                          <p style="margin: 0.5rem 0 0 0; color: var(--pico-del-color); font-size: 0.875rem;">
                            ⚠️ Last generation failed
                          </p>
                        )}
                      </div>
                      <footer style="display: flex; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--pico-muted-border-color);">
                        <a href={`/playlists/${playlist.id}`} role="button" class="secondary" style="flex: 1; margin: 0;">
                          View Tracks
                        </a>
                        <button
                          hx-post={`/actions/generate/${playlist.window}`}
                          hx-swap="none"
                          class="outline"
                          style="flex: 0; margin: 0;"
                          title="Regenerate playlist"
                          onclick={`showToast('Generating ${playlist.window} playlist...', 'info')`}
                        >
                          🔄
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Genre Playlists Section */}
            {genrePlaylists.length > 0 && (
              <section>
                <h3>Genre Playlists</h3>
                <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
                  Genre-focused playlists automatically curated from your music library.
                </p>

                <table>
                  <thead>
                    <tr>
                      <th>Playlist</th>
                      <th>Tracks</th>
                      <th>Last Updated</th>
                      <th>Status</th>
                      <th style="text-align: right;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genrePlaylists.map(playlist => (
                      <tr>
                        <td>
                          <a href={`/playlists/${playlist.id}`}>
                            {playlist.title || playlist.window}
                          </a>
                        </td>
                        <td>{playlist.trackCount}</td>
                        <td>{timeAgo(playlist.generatedAt)}</td>
                        <td>
                          {playlist.lastJob ? (
                            <span class={`status-badge status-${playlist.lastJob.status}`}>
                              {playlist.lastJob.status}
                            </span>
                          ) : '-'}
                        </td>
                        <td style="text-align: right;">
                          <button
                            hx-post={`/actions/generate/${playlist.window}`}
                            hx-swap="none"
                            class="secondary"
                            style="margin: 0; font-size: 0.875rem; padding: 0.25rem 0.75rem;"
                            onclick={`showToast('Generating ${playlist.window} playlist...', 'info')`}
                          >
                            Regenerate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        <script src="/js/playlists.js"></script>
      </div>
    </Layout>
  );
}
