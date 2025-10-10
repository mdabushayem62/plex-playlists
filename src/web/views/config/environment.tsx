/**
 * Environment & Credentials Configuration Page - TSX version
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';
import { EditableField, EditableFieldScript, type FieldMetadata } from '../components/editable-field.tsx';

interface Breadcrumb {
  label: string;
  url: string | null;
}

interface EnvVars {
  database: {
    path: string;
  };
  webUi: {
    enabled: boolean;
    port: number;
  };
}

export interface EnvironmentPageProps {
  plexSettings: Record<string, FieldMetadata>;
  apiSettings: Record<string, FieldMetadata>;
  envVars: EnvVars;
  page: string;
  setupComplete: boolean;
  breadcrumbs?: Breadcrumb[];
}

function formatFieldLabel(key: string): JSX.Element {
  if (key.includes('lastfm')) return 'Last.fm API Key';
  if (key.includes('spotify_client_id')) return 'Spotify Client ID';
  if (key.includes('spotify_client_secret')) return 'Spotify Client Secret';
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function EnvironmentPage(props: EnvironmentPageProps): JSX.Element {
  const { plexSettings, apiSettings, envVars, page, setupComplete, breadcrumbs } = props;

  return (
    <Layout title="Environment Variables" page={page} setupComplete={setupComplete}>
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

        <h2>Environment & Credentials</h2>
        <p style="color: var(--pico-muted-color);">
          Configure Plex connection and external API keys. Changes are saved to both database and <code>./config/.env</code> file for persistence.
        </p>

        {/* Plex Server Configuration */}
        <section style="margin-top: 2rem;">
          <h3>Plex Server</h3>
          <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
            ⚠️ <strong>Restart required</strong> after changing Plex settings
          </p>

          {Object.entries(plexSettings).map(([key, metadata]) => (
            <article style="margin-bottom: 1.5rem;">
              <h4 style="margin-bottom: 0.5rem;">
                {formatFieldLabel(key)}
              </h4>
              <p style="color: var(--pico-muted-color); margin-bottom: 1rem; font-size: 0.875rem;">
                {metadata.description}
              </p>

              <EditableField fieldKey={key} metadata={metadata} />
            </article>
          ))}

          <div style="margin-top: 1rem;">
            <button id="testPlexBtn" onclick="testPlexConnection()" class="secondary" style="margin: 0;">
              🔌 Test Plex Connection
            </button>
          </div>
        </section>

        {/* API Keys */}
        <section style="margin-top: 2rem;">
          <h3>API Keys for Genre Enrichment</h3>
          <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
            Optional: Add API keys for enhanced genre metadata from Last.fm and Spotify.
            See setup guides:
            <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/lastfm-setup.md" target="_blank">Last.fm</a> •
            <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/spotify-setup.md" target="_blank">Spotify</a>
          </p>

          {Object.entries(apiSettings).map(([key, metadata]) => (
            <article style="margin-bottom: 1.5rem;">
              <h4 style="margin-bottom: 0.5rem;">
                {formatFieldLabel(key)}
              </h4>
              <p style="color: var(--pico-muted-color); margin-bottom: 1rem; font-size: 0.875rem;">
                {metadata.description}
              </p>

              <EditableField fieldKey={key} metadata={metadata} />
            </article>
          ))}

          <div style="margin-top: 1rem; display: flex; gap: 1rem;">
            <button onclick="testLastfm()" class="secondary" style="margin: 0;">
              🔍 Test Last.fm
            </button>
            <button onclick="testSpotify()" class="secondary" style="margin: 0;">
              🔍 Test Spotify
            </button>
          </div>
        </section>

        {/* Read-Only System Info */}
        <section style="margin-top: 2rem;">
          <h3>System Configuration (Read-Only)</h3>
          <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
            These settings are set via environment variables and cannot be changed from the web UI.
          </p>

          <table>
            <tbody>
              <tr>
                <td><code>DATABASE_PATH</code></td>
                <td><strong>{envVars.database.path}</strong></td>
              </tr>
              <tr>
                <td><code>WEB_UI_ENABLED</code></td>
                <td><strong>{String(envVars.webUi.enabled)}</strong></td>
              </tr>
              <tr>
                <td><code>WEB_UI_PORT</code></td>
                <td><strong>{envVars.webUi.port}</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Help Panel */}
        <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.5rem; padding: 1.5rem; margin-top: 2rem;">
          <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.25rem;">💡</span>
            <span>Configuration Tips</span>
          </h4>
          <ul style="margin: 0; padding-left: 1.5rem;">
            <li style="margin-bottom: 0.5rem;">
              <strong>Writeback enabled:</strong> All changes are saved to <code>./config/.env</code> for persistence
            </li>
            <li style="margin-bottom: 0.5rem;">
              <strong>Docker users:</strong> Mount <code>./config:/config</code> to persist settings across container restarts
            </li>
            <li style="margin-bottom: 0.5rem;">
              <strong>Plex settings:</strong> Require app restart to take effect
            </li>
            <li>
              <strong>Test connections:</strong> Use the test buttons to verify API credentials work
            </li>
          </ul>
        </div>
      </div>

      {/* Include editable field JavaScript */}
      <EditableFieldScript />
      <script src="/js/config.js"></script>
      <script>{`
        // Register all fields on page load
        ${Object.entries(plexSettings).map(([key, metadata]) =>
          `registerField('${key}', ${JSON.stringify(metadata)});`
        ).join('\n        ')}

        ${Object.entries(apiSettings).map(([key, metadata]) =>
          `registerField('${key}', ${JSON.stringify(metadata)});`
        ).join('\n        ')}
      `}</script>
    </Layout>
  );
}
