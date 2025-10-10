/**
 * Consolidated settings page
 * All configuration in one place with collapsible sections
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';
import { EditableField, EditableFieldScript, type FieldMetadata } from '../components/editable-field.js';

export interface SettingsPageProps {
  plexSettings: Record<string, FieldMetadata>;
  apiSettings: Record<string, FieldMetadata>;
  scoringSettings: Record<string, FieldMetadata>;
  schedulingSettings: Record<string, FieldMetadata>;
  cacheStats: {
    total: number;
    bySource: Record<string, number>;
    expired: number;
  };
  playlistConfig: any;
  configPath: string;
  envVars: {
    database: { path: string };
    webUi: { enabled: boolean; port: number };
  };
  page: string;
  setupComplete: boolean;
}

function formatFieldName(key: string): JSX.Element {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function SettingsPage(props: SettingsPageProps): JSX.Element {
  const {
    plexSettings,
    apiSettings,
    scoringSettings,
    schedulingSettings,
    cacheStats,
    envVars,
    page,
    setupComplete
  } = props;

  return (
    <Layout title="Settings" page={page} setupComplete={setupComplete}>
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div>
            <h2 style="margin: 0;">⚙️ Settings</h2>
            <p style="color: var(--pico-muted-color); font-size: 0.8125rem; margin: 0.25rem 0 0 0;">
              All configuration in one place. Click sections to expand.
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button onclick="expandAll()" class="secondary" style="margin: 0; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
              ▼ Expand All
            </button>
            <button onclick="collapseAll()" class="secondary" style="margin: 0; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
              ▲ Collapse All
            </button>
          </div>
        </div>

        {/* Plex Server Configuration */}
        <details id="section-plex">
          <summary>🖥️ Plex Server Connection</summary>
          <div>
            <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 0.75rem;">
              ⚠️ <strong>Restart required</strong> after changing Plex settings
            </p>

            {Object.entries(plexSettings).map(([key, metadata]) => (
              <div style="margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                  <label style="margin: 0; font-size: 0.875rem; font-weight: 600;">
                    {formatFieldName(key)}
                  </label>
                </div>
                <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0 0 0.375rem 0;">
                  {metadata.description}
                </p>
                {EditableField({ fieldKey: key, metadata })}
              </div>
            ))}

            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color);">
              <button id="testPlexBtn" onclick="testPlexConnection()" class="secondary" style="margin: 0;">
                🔌 Test Connection
              </button>
            </div>
          </div>
        </details>

        {/* API Keys for Genre Enrichment */}
        <details id="section-apis">
          <summary>🔗 API Keys (Genre Enrichment)</summary>
          <div>
            <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 0.75rem;">
              Optional: Add API keys for enhanced genre metadata.
              <a href="https://github.com/aceofaces/plex-playlists/blob/main/LASTFM_SETUP.md" target="_blank">Last.fm guide</a> •
              <a href="https://github.com/aceofaces/plex-playlists/blob/main/SPOTIFY_SETUP.md" target="_blank">Spotify guide</a>
            </p>

            {Object.entries(apiSettings).map(([key, metadata]) => {
              let label = key;
              if (key.includes('lastfm')) label = 'Last.fm API Key';
              else if (key.includes('spotify_client_id')) label = 'Spotify Client ID';
              else if (key.includes('spotify_client_secret')) label = 'Spotify Client Secret';

              return (
                <div style="margin-bottom: 0.75rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <label style="margin: 0; font-size: 0.875rem; font-weight: 600;">
                      {label}
                    </label>
                  </div>
                  <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0 0 0.375rem 0;">
                    {metadata.description}
                  </p>
                  {EditableField({ fieldKey: key, metadata })}
                </div>
              );
            })}

            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color); display: flex; gap: 0.5rem;">
              <button onclick="testLastfm()" class="secondary" style="margin: 0;">
                🔍 Test Last.fm
              </button>
              <button onclick="testSpotify()" class="secondary" style="margin: 0;">
                🔍 Test Spotify
              </button>
            </div>
          </div>
        </details>

        {/* Scoring Settings */}
        <details id="section-scoring">
          <summary>🎯 Scoring & Algorithm</summary>
          <div>
            <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 0.75rem;">
              Fine-tune how tracks are scored and selected for playlists
            </p>

            {Object.entries(scoringSettings).map(([key, metadata]) => (
              <div style="margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                  <label style="margin: 0; font-size: 0.875rem; font-weight: 600;">
                    {formatFieldName(key)}
                  </label>
                </div>
                <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0 0 0.375rem 0;">
                  {metadata.description}
                </p>
                {EditableField({ fieldKey: key, metadata })}
              </div>
            ))}
          </div>
        </details>

        {/* Scheduling Settings */}
        <details id="section-scheduling">
          <summary>⏰ Scheduling (Cron)</summary>
          <div>
            <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 0.75rem;">
              Configure when playlist generation runs (cron format)
            </p>

            {Object.entries(schedulingSettings).map(([key, metadata]) => (
              <div style="margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                  <label style="margin: 0; font-size: 0.875rem; font-weight: 600;">
                    {formatFieldName(key)}
                  </label>
                </div>
                <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0 0 0.375rem 0;">
                  {metadata.description}
                </p>
                {EditableField({ fieldKey: key, metadata })}
              </div>
            ))}
          </div>
        </details>

        {/* Cache Statistics */}
        <details id="section-cache">
          <summary>📊 Cache Statistics</summary>
          <div>
            <div class="grid-dense grid-3" style="margin-bottom: 0.75rem;">
              <div class="stat-card">
                <h3>{cacheStats.total}</h3>
                <p>Total Cached</p>
              </div>
              <div class="stat-card">
                <h3>{cacheStats.expired}</h3>
                <p>Expiring Soon</p>
              </div>
              <div class="stat-card">
                <h3>{Object.keys(cacheStats.bySource).length}</h3>
                <p>Data Sources</p>
              </div>
            </div>

            <div style="margin-bottom: 0.75rem;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9375rem;">By Source</h4>
              {Object.entries(cacheStats.bySource).map(([source, count]) => (
                <div style="display: flex; justify-content: space-between; padding: 0.25rem 0; border-bottom: 1px solid var(--pico-muted-border-color);">
                  <span style="font-size: 0.875rem;">{source}</span>
                  <strong style="font-size: 0.875rem;">{count}</strong>
                </div>
              ))}
            </div>

            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color); display: flex; gap: 0.5rem;">
              <a href="/actions/cache" class="secondary" style="margin: 0; text-decoration: none;">
                🔄 Manage Cache
              </a>
            </div>
          </div>
        </details>

        {/* Environment Variables (Read-only) */}
        <details id="section-env">
          <summary>🔧 Environment (Read-only)</summary>
          <div>
            <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 0.75rem;">
              These settings are configured in <code>.env</code> file
            </p>

            <div style="margin-bottom: 0.75rem;">
              <label style="font-size: 0.875rem; font-weight: 600;">Database Path</label>
              <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0.25rem 0 0.375rem 0;">
                SQLite database location
              </p>
              <code style="display: block; padding: 0.5rem; background: var(--pico-card-background-color); border-radius: 0.25rem;">
                {envVars.database.path}
              </code>
            </div>

            <div style="margin-bottom: 0.75rem;">
              <label style="font-size: 0.875rem; font-weight: 600;">Web UI</label>
              <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0.25rem 0 0.375rem 0;">
                Web interface configuration
              </p>
              <code style="display: block; padding: 0.5rem; background: var(--pico-card-background-color); border-radius: 0.25rem;">
                Enabled: {envVars.webUi.enabled ? 'Yes' : 'No'} | Port: {envVars.webUi.port}
              </code>
            </div>
          </div>
        </details>

        {/* Configuration Tips */}
        <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.25rem; padding: 0.75rem; margin-top: 1rem;">
          <h4 style="margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.375rem; font-size: 0.9375rem;">
            <span>💡</span>
            <span>Configuration Tips</span>
          </h4>
          <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.8125rem;">
            <li style="margin-bottom: 0.25rem;">Changes saved to <code>./config/.env</code> for persistence across restarts</li>
            <li style="margin-bottom: 0.25rem;">Most settings take effect immediately (except Plex connection)</li>
            <li style="margin-bottom: 0.25rem;">Database settings override <code>.env</code> file values</li>
            <li>Use test buttons to verify API credentials before saving</li>
          </ul>
        </div>
      </div>

      {EditableFieldScript()}

      <script>{`
// Register all fields on page load
${Object.entries(plexSettings)
  .map(
    ([key, metadata]) =>
      `registerField('${key}', ${JSON.stringify(metadata)});`
  )
  .join('\n')}

${Object.entries(apiSettings)
  .map(
    ([key, metadata]) =>
      `registerField('${key}', ${JSON.stringify(metadata)});`
  )
  .join('\n')}

${Object.entries(scoringSettings)
  .map(
    ([key, metadata]) =>
      `registerField('${key}', ${JSON.stringify(metadata)});`
  )
  .join('\n')}

${Object.entries(schedulingSettings)
  .map(
    ([key, metadata]) =>
      `registerField('${key}', ${JSON.stringify(metadata)});`
  )
  .join('\n')}

// Expand/Collapse All
function expandAll() {
  document.querySelectorAll('details').forEach(d => d.open = true);
}

function collapseAll() {
  document.querySelectorAll('details').forEach(d => d.open = false);
}

// Connection Testing Functions
async function testPlexConnection() {
  const btn = document.getElementById('testPlexBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Testing...';

  try {
    const response = await fetch('/config/api/test-plex-connection');
    const data = await response.json();

    if (response.ok && data.success) {
      btn.innerHTML = '✓ Connected';
      btn.style.background = 'var(--pico-ins-color)';
      showToast(\`Plex connection successful: \${data.serverName || 'Connected'}\`, 'success');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = '';
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.error || 'Connection failed');
    }
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    btn.style.background = 'var(--pico-del-color)';
    showToast('Plex connection failed: ' + err.message, 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  }
}

async function testLastfm() {
  const btn = event.target;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Testing...';

  try {
    const response = await fetch('/config/api/test-lastfm');
    const data = await response.json();

    if (response.ok && data.success) {
      btn.innerHTML = '✓ Connected';
      showToast('Last.fm connection successful', 'success');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.error || 'Test failed');
    }
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    showToast('Last.fm test failed: ' + err.message, 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 3000);
  }
}

async function testSpotify() {
  const btn = event.target;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Testing...';

  try {
    const response = await fetch('/config/api/test-spotify');
    const data = await response.json();

    if (response.ok && data.success) {
      btn.innerHTML = '✓ Connected';
      showToast('Spotify connection successful', 'success');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.error || 'Test failed');
    }
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    showToast('Spotify test failed: ' + err.message, 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 3000);
  }
}

// Remember which sections were open
document.querySelectorAll('details').forEach(details => {
  const id = details.id;
  if (id && localStorage.getItem(id + '_open') === 'true') {
    details.open = true;
  }

  details.addEventListener('toggle', () => {
    if (id) {
      localStorage.setItem(id + '_open', details.open);
    }
  });
});
      `}</script>
    </Layout>
  );
}
