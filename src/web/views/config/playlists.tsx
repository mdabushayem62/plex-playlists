/**
 * Playlist Configuration Page - TSX version
 * Manage genre playlist configuration (pinned playlists and auto-discovery)
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface PinnedPlaylist {
  name: string;
  genre: string;
  cron: string;
  enabled: boolean;
}

interface AutoDiscoverConfig {
  enabled: boolean;
  minArtists?: number;
  maxPlaylists?: number;
  defaultCron?: string;
}

interface PlaylistConfig {
  genrePlaylists?: {
    pinned?: PinnedPlaylist[];
    autoDiscover?: AutoDiscoverConfig;
  };
}

interface Breadcrumb {
  label: string;
  url: string | null;
}

export interface PlaylistsConfigPageProps {
  config: PlaylistConfig | null;
  configPath: string;
  error: string | null;
  page: string;
  setupComplete: boolean;
  breadcrumbs?: Breadcrumb[];
}

const DEFAULT_CONFIG = `{
  "genrePlaylists": {
    "pinned": [
      {
        "name": "🎵 Weekly Synthwave",
        "genre": "synthwave",
        "cron": "0 23 * * 0",
        "enabled": true
      }
    ],
    "autoDiscover": {
      "enabled": true,
      "minArtists": 5,
      "maxPlaylists": 20,
      "defaultCron": "0 23 * * 0"
    }
  }
}`;

export function PlaylistsConfigPage(props: PlaylistsConfigPageProps): JSX.Element {
  const { config, error, page, setupComplete, breadcrumbs } = props;

  return (
    <Layout title="Playlist Configuration" page={page} setupComplete={setupComplete}>
      <div>
        {/* Breadcrumbs */}
        {breadcrumbs && (
          <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
            <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
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

        <h2>Playlist Configuration</h2>
        <p style="color: var(--pico-muted-color);">
          Genre playlist configuration for pinned playlists and auto-discovery settings.
        </p>

        {/* Error Display */}
        {error && (
          <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem; margin-bottom: 2rem;">
            <strong>Error loading configuration:</strong> {error}
          </div>
        )}

        {/* Config Display */}
        {config ? (
          <>
            {/* Pinned Genre Playlists */}
            <section style="margin-bottom: 2rem;">
              <h3>Pinned Genre Playlists</h3>
              {config.genrePlaylists?.pinned && config.genrePlaylists.pinned.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Genre</th>
                      <th>Schedule</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.genrePlaylists.pinned.map(playlist => (
                      <tr>
                        <td><strong>{playlist.name}</strong></td>
                        <td><code>{playlist.genre}</code></td>
                        <td><code>{playlist.cron}</code></td>
                        <td>
                          {playlist.enabled ? (
                            <span style="color: var(--pico-ins-color);">✓ Enabled</span>
                          ) : (
                            <span style="color: var(--pico-muted-color);">○ Disabled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style="color: var(--pico-muted-color);">No pinned genre playlists configured.</p>
              )}
            </section>

            {/* Auto-Discovery Settings */}
            <section style="margin-bottom: 2rem;">
              <h3>Auto-Discovery</h3>
              <table>
                <tbody>
                  <tr>
                    <td><strong>Enabled</strong></td>
                    <td>
                      {config.genrePlaylists?.autoDiscover?.enabled ? (
                        <span style="color: var(--pico-ins-color);">✓ Yes</span>
                      ) : (
                        <span style="color: var(--pico-muted-color);">○ No</span>
                      )}
                    </td>
                  </tr>
                  {config.genrePlaylists?.autoDiscover && (
                    <>
                      <tr>
                        <td><strong>Min Artists</strong></td>
                        <td>{config.genrePlaylists.autoDiscover.minArtists || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td><strong>Max Playlists</strong></td>
                        <td>{config.genrePlaylists.autoDiscover.maxPlaylists || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td><strong>Schedule</strong></td>
                        <td><code>{config.genrePlaylists.autoDiscover.defaultCron || 'N/A'}</code></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </section>
          </>
        ) : (
          <p style="color: var(--pico-muted-color);">
            No configuration found. Use the editor below to create your playlist configuration.
          </p>
        )}

        {/* Editable Configuration */}
        <section style="margin-bottom: 2rem;">
          <h3>Edit Configuration</h3>
          <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
            Edit the JSON configuration below to add or modify genre playlists.
            📖 See <a href="https://github.com/aceofaces/plex-playlists/blob/main/README.md#genre-playlists" target="_blank">README</a> for detailed documentation.
          </p>

          <form id="playlistsForm" hx-post="/config/playlists/save" hx-swap="innerHTML" hx-target="#save-response">
            <label>
              Playlist Configuration (JSON)
              <textarea
                name="playlistsConfig"
                rows="20"
                style="font-family: monospace; font-size: 0.875rem;"
                required
              >{config ? JSON.stringify(config, null, 2) : DEFAULT_CONFIG}</textarea>
              <small>Format: JSON with genrePlaylists.pinned (array) and genrePlaylists.autoDiscover (object)</small>
            </label>

            <div style="display: flex; gap: 1rem;">
              <button type="submit">Save Configuration</button>
              <button type="button" onclick="window.location.reload()" class="secondary">Reset</button>
            </div>
          </form>

          <div id="save-response" style="margin-top: 1rem;"></div>

          <script>{`
            // Handle save response
            document.body.addEventListener('htmx:afterSwap', function(event) {
              if (event.detail.target.id === 'save-response') {
                try {
                  const response = JSON.parse(event.detail.xhr.responseText);
                  if (response.success) {
                    event.detail.target.innerHTML = '<p style="color: var(--pico-ins-color);">✓ Configuration saved successfully! Changes will take effect on next playlist generation.</p>';
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                  } else if (response.error) {
                    event.detail.target.innerHTML = '<p style="color: var(--pico-del-color);">✗ ' + response.error + '</p>';
                  }
                } catch (e) {
                  event.detail.target.innerHTML = '<p style="color: var(--pico-del-color);">✗ Error saving configuration</p>';
                }
              }
            });
          `}</script>
        </section>
      </div>
    </Layout>
  );
}
