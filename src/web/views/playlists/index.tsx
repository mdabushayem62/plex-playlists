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

interface SpecialPlaylistDef {
  window: string;
  title: string;
  description: string;
  exists: boolean;
}

export interface PlaylistsIndexPageProps {
  playlists: Playlist[];
  dailyPlaylists: Playlist[];
  specialPlaylists: Playlist[];
  customPlaylists: Playlist[];
  specialPlaylistDefs: SpecialPlaylistDef[];
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

function getPlaylistEmoji(window: string): string {
  if (window === 'morning') return '🌅';
  if (window === 'afternoon') return '☀️';
  if (window === 'evening') return '🌙';
  return '🎵';
}

/**
 * Playlists index content only (for HTMX partial rendering)
 */
export function PlaylistsIndexContent(props: Omit<PlaylistsIndexPageProps, 'page' | 'setupComplete'>) {
  const {
    playlists,
    dailyPlaylists,
    specialPlaylists,
    customPlaylists,
    specialPlaylistDefs,
    totalTracks
  } = props;

  return (
    <div>
      {/* Breadcrumbs */}
      <nav aria-label="breadcrumb" class="mb-5">
        <ol class="flex text-muted-sm p-0 gap-3" style="list-style: none;">
          <li><a href="/">Dashboard</a></li>
          <li>›</li>
          <li><span style="color: var(--pico-contrast);">Playlists</span></li>
        </ol>
      </nav>

        <div class="flex-between mb-5">
          <h2>Playlists</h2>
          <a href="/playlists/builder" role="button" class="secondary">🎨 Create Custom Playlist</a>
        </div>

        {playlists.length === 0 ? (
          <div class="card p-6 rounded-lg text-center">
            <p class="text-muted mb-5">
              No playlists generated yet.
            </p>
            <a href="/playlists/builder" role="button">🎨 Create Your First Playlist</a>
          </div>
        ) : (
          <>
            {/* Search/Filter */}
            <div class="mb-5">
              <input
                type="search"
                id="playlistSearch"
                placeholder="🔍 Search playlists by name or window..."
                oninput="filterPlaylists(this.value)"
                class="m-0"
              />
              <small id="searchResults" class="text-muted"></small>
            </div>

            {/* Overview Stats */}
            <div class="grid-auto-wide gap-4 mb-5">
              <div class="stat-card">
                <h3>{playlists.length}</h3>
                <p>Total Playlists</p>
              </div>
              <div class="stat-card">
                <h3>{dailyPlaylists.length}</h3>
                <p>Daily</p>
              </div>
              <div class="stat-card">
                <h3>{specialPlaylists.length}/{specialPlaylistDefs.length}</h3>
                <p>Special</p>
              </div>
              <div class="stat-card">
                <h3>{customPlaylists.length}</h3>
                <p>Custom</p>
              </div>
              <div class="stat-card">
                <h3>{totalTracks}</h3>
                <p>Total Tracks</p>
              </div>
            </div>

            {/* Daily Playlists Section */}
            {dailyPlaylists.length > 0 && (
              <section class="mb-6">
                <h3>Daily Playlists</h3>
                <p class="text-muted mb-5">
                  Time-based playlists generated from your listening patterns throughout the day.
                </p>
                <table>
                  <colgroup>
                    <col style="width: 30%;" />
                    <col style="width: 12%;" />
                    <col style="width: 15%;" />
                    <col style="width: 15%;" />
                    <col style="width: 28%;" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Playlist</th>
                      <th>Tracks</th>
                      <th>Last Updated</th>
                      <th>Status</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyPlaylists.map(playlist => (
                      <tr>
                        <td>
                          <a href={`/playlists/${playlist.id}`}>
                            {playlist.title || `${getPlaylistEmoji(playlist.window)} ${playlist.window}`}
                          </a>
                        </td>
                        <td>{playlist.trackCount}</td>
                        <td>{timeAgo(playlist.generatedAt)}</td>
                        <td>
                          {playlist.lastJob ? (
                            <span class={`status-badge status-${playlist.lastJob.status}`}>
                              {playlist.lastJob.status}
                            </span>
                          ) : (
                            <span class="text-muted-sm">-</span>
                          )}
                        </td>
                        <td class="text-right">
                          <div class="flex gap-3 justify-end">
                            <button
                              hx-post={`/actions/generate/${playlist.window}`}
                              hx-swap="none"
                              class="secondary m-0 text-sm"
                              style="padding: 0.25rem 0.75rem;"
                              title="Regenerate playlist"
                              aria-label={`Regenerate ${playlist.window} playlist`}
                              onclick={`showToast('Regenerating ${playlist.window} playlist...', 'info')`}
                            >
                              Regenerate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Default Playlists Section */}
            <section class="mb-6">
              <h3>Default Playlists</h3>
              <p class="text-muted mb-5">
                Discovery and throwback playlists that uncover hidden gems and nostalgic favorites.
              </p>

              <table>
                <colgroup>
                  <col style="width: 30%;" />
                  <col style="width: 12%;" />
                  <col style="width: 15%;" />
                  <col style="width: 15%;" />
                  <col style="width: 28%;" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Playlist</th>
                    <th>Tracks</th>
                    <th>Last Updated</th>
                    <th>Status</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {specialPlaylistDefs.map(def => {
                    const playlist = specialPlaylists.find(p => p.window === def.window);

                    return (
                      <tr>
                        <td>
                          {playlist ? (
                            <a href={`/playlists/${playlist.id}`} title={def.description}>
                              {def.title}
                            </a>
                          ) : (
                            <span title={def.description}>{def.title}</span>
                          )}
                        </td>
                        <td>{playlist ? playlist.trackCount : '-'}</td>
                        <td>{playlist ? timeAgo(playlist.generatedAt) : '-'}</td>
                        <td>
                          {playlist ? (
                            playlist.lastJob ? (
                              <span class={`status-badge status-${playlist.lastJob.status}`}>
                                {playlist.lastJob.status}
                              </span>
                            ) : (
                              <span class="text-muted-sm">-</span>
                            )
                          ) : (
                            <span class="text-muted-sm" style="font-style: italic;">Not generated</span>
                          )}
                        </td>
                        <td class="text-right">
                          <div class="flex gap-3 justify-end">
                            {playlist ? (
                              <button
                                hx-post={`/actions/generate/${def.window}`}
                                hx-swap="none"
                                class="secondary m-0 text-sm"
                                style="padding: 0.25rem 0.75rem;"
                                title="Regenerate playlist"
                                aria-label={`Regenerate ${def.window} playlist`}
                                onclick={`showToast('Regenerating ${def.window} playlist...', 'info')`}
                              >
                                Regenerate
                              </button>
                            ) : (
                              <button
                                hx-post={`/actions/generate/${def.window}`}
                                hx-swap="none"
                                class="secondary m-0 text-sm"
                                style="padding: 0.25rem 0.75rem;"
                                title="Generate playlist"
                                aria-label={`Generate ${def.window} playlist`}
                                onclick={`showToast('Generating ${def.window} playlist...', 'info')`}
                              >
                                Generate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {/* Custom Playlists Section */}
            {customPlaylists.length > 0 && (
              <section>
                <h3>Custom Playlists</h3>
                <p class="text-muted mb-5">
                  Genre and mood combination playlists you've created.
                </p>

                <table>
                  <colgroup>
                    <col style="width: 30%;" />
                    <col style="width: 12%;" />
                    <col style="width: 15%;" />
                    <col style="width: 15%;" />
                    <col style="width: 28%;" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Playlist</th>
                      <th>Tracks</th>
                      <th>Last Updated</th>
                      <th>Status</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customPlaylists.map(playlist => (
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
                        <td class="text-right">
                          <div class="flex gap-3 justify-end">
                            <button
                              hx-post={`/actions/generate/${playlist.window}`}
                              hx-swap="none"
                              class="secondary m-0 text-sm"
                              style="padding: 0.25rem 0.75rem;"
                              title="Regenerate playlist"
                              aria-label={`Regenerate ${playlist.window} playlist`}
                              onclick={`showToast('Regenerating ${playlist.window} playlist...', 'info')`}
                            >
                              Regenerate
                            </button>
                            <button
                              onclick={`deleteGeneratedPlaylist(${playlist.id}, '${playlist.title || playlist.window}')`}
                              class="outline m-0 text-sm"
                              style="padding: 0.25rem 0.75rem; color: var(--pico-del-color);"
                              title="Delete playlist"
                              aria-label="Delete playlist"
                            >
                              Delete
                            </button>
                          </div>
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
  );
}

/**
 * Full playlists index page with layout (for regular requests)
 */
export function PlaylistsIndexPage(props: PlaylistsIndexPageProps): JSX.Element {
  const { setupComplete, page, ...contentProps } = props;

  return (
    <Layout title="Playlists" page={page} setupComplete={setupComplete}>
      <PlaylistsIndexContent {...contentProps} />
    </Layout>
  );
}
