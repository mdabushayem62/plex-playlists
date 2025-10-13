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
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><a href="/config">Configuration</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Settings</span></li>
          </ol>
        </nav>

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
              <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/api-setup/lastfm-setup.md" target="_blank">Last.fm guide</a> •
              <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/api-setup/spotify-setup.md" target="_blank">Spotify guide</a>
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

        {/* Genre Configuration */}
        <details id="section-genres">
          <summary>🎭 Genre Filtering</summary>
          <div>
            <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 0.75rem;">
              Manage which genres are filtered out during playlist generation. Meta-genres like "electronic" and "pop/rock" are too broad and get filtered by default.
            </p>

            {/* Statistics */}
            <div style="margin-bottom: 1rem;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9375rem;">📊 Impact Statistics</h4>
              <div id="genre-stats-container" style="min-height: 80px; display: flex; align-items: center; justify-content: center;">
                <div class="loading"></div>
              </div>
            </div>

            {/* Genre Ignore List */}
            <div style="margin-bottom: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="margin: 0; font-size: 0.9375rem;">🚫 Genres to Filter</h4>
                <div style="display: flex; gap: 0.5rem;">
                  <button id="reset-genres-btn" onclick="resetGenresToDefault()" class="outline" style="margin: 0; padding: 0.25rem 0.75rem; font-size: 0.8125rem;">
                    🔄 Reset to Default
                  </button>
                  <button id="save-genres-btn" onclick="saveGenreChanges()" class="primary" disabled style="margin: 0; padding: 0.25rem 0.75rem; font-size: 0.8125rem;">
                    💾 Save Changes
                  </button>
                </div>
              </div>

              <div id="genre-default-notice" style="background: var(--pico-ins-background-color); border: 1px solid var(--pico-ins-color); border-radius: 0.25rem; padding: 0.75rem; margin-bottom: 0.75rem; display: none;">
                <strong style="font-size: 0.8125rem;">ℹ️ Using default genre ignore list</strong>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem;">
                  The default list filters out overly broad meta-genres. You can customize this list below.
                </p>
              </div>

              <div id="genre-tags-list" style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.75rem 0; min-height: 3rem; padding: 0.75rem; border: 1px solid var(--pico-muted-border-color); border-radius: 0.25rem; background: var(--pico-background-color);">
                <div class="loading"></div>
              </div>

              <div style="margin-top: 0.75rem;">
                <label for="genre-search-input" style="font-size: 0.875rem; font-weight: 600;">
                  Add genres to ignore list
                </label>
                <input
                  type="text"
                  id="genre-search-input"
                  placeholder="Search genres to add..."
                  oninput="filterGenreSuggestions()"
                  style="margin-top: 0.25rem;"
                />
                <div id="genre-suggestions-list" style="display: none; max-height: 250px; overflow-y: auto; border: 1px solid var(--pico-muted-border-color); border-radius: 0.25rem; margin-top: 0.25rem; background: var(--pico-card-background-color);"></div>
              </div>
            </div>

            {/* Currently Filtered Genres */}
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color);">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9375rem;">🎯 Currently Filtered Genres</h4>
              <p style="color: var(--pico-muted-color); font-size: 0.75rem; margin: 0 0 0.75rem 0;">
                These are the genres that will be filtered out from playlists based on your current ignore list.
              </p>
              <div id="filtered-genres-list" style="font-size: 0.875rem;">
                <div class="loading"></div>
              </div>
            </div>

            {/* Help Text */}
            <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.25rem; padding: 0.75rem; margin-top: 1rem;">
              <h5 style="margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem;">
                <span>💡</span>
                <span>How Genre Filtering Works</span>
              </h5>
              <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.75rem;">
                <li style="margin-bottom: 0.25rem;"><strong>Meta-genres</strong> like "electronic" or "pop/rock" are filtered out because they're too broad</li>
                <li style="margin-bottom: 0.25rem;"><strong>Specific genres</strong> like "synthwave" or "progressive house" remain for better playlist variety</li>
                <li style="margin-bottom: 0.25rem;"><strong>Filtering happens</strong> during playlist generation - genres are still cached for analytics</li>
                <li><strong>If all genres filtered</strong>, the original list is kept (prevents empty genre lists)</li>
              </ul>
            </div>
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

        {/* Custom Playlists Link */}
        <div style="background: var(--pico-background-color); border: 1px solid var(--pico-muted-border-color); border-radius: 0.25rem; padding: 0.75rem; margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>Custom Playlists</strong>
              <p style="margin: 0.25rem 0 0 0; font-size: 0.8125rem; color: var(--pico-muted-color);">
                Create genre/mood combination playlists
              </p>
            </div>
            <a href="/playlists" class="secondary" style="text-decoration: none; margin: 0; white-space: nowrap;">
              🎵 Manage Playlists
            </a>
          </div>
        </div>

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

// ========== Genre Configuration Management ==========
let currentGenreIgnoreList = [];
let allGenresList = [];
let genreListDirty = false;
let genreListIsDefault = true;

// Load genre data
async function loadGenreConfiguration() {
  try {
    const response = await fetch('/config/api/genres/ignore-list');
    const data = await response.json();

    currentGenreIgnoreList = data.ignoreList || [];
    genreListIsDefault = data.isDefault;

    renderGenreTags();
    renderGenreStatistics(data.statistics);
    renderFilteredGenresList(data.statistics.filteredGenres);
    updateGenreDefaultNotice();

    // Load all genres for autocomplete
    const genresResponse = await fetch('/config/api/genres/all');
    const genresData = await genresResponse.json();
    allGenresList = genresData.genres || [];
  } catch (error) {
    console.error('Failed to load genre data:', error);
    showToast('Failed to load genre data', 'error');
  }
}

// Render genre tags
function renderGenreTags() {
  const container = document.getElementById('genre-tags-list');
  if (currentGenreIgnoreList.length === 0) {
    container.innerHTML = '<p style="color: var(--pico-muted-color); margin: 0; font-size: 0.875rem;">No genres in ignore list</p>';
    return;
  }

  container.innerHTML = currentGenreIgnoreList.map(genre => \`
    <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: var(--pico-primary-background); color: var(--pico-primary); padding: 0.3rem 0.6rem; border-radius: 0.25rem; font-size: 0.8125rem; border: 1px solid var(--pico-primary);">
      <span>\${escapeHtmlForGenre(genre)}</span>
      <button onclick="removeGenreFromList('\${escapeHtmlForGenre(genre)}')" style="background: none; border: none; color: var(--pico-primary); cursor: pointer; padding: 0; font-size: 1rem; line-height: 1; opacity: 0.7;" title="Remove from ignore list">×</button>
    </div>
  \`).join('');
}

// Render statistics
function renderGenreStatistics(stats) {
  const container = document.getElementById('genre-stats-container');
  container.innerHTML = \`
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; width: 100%;">
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.totalArtists}</div>
        <div style="font-size: 0.75rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Total Artists</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.totalUniqueGenres}</div>
        <div style="font-size: 0.75rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Unique Genres</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.artistsAffected}</div>
        <div style="font-size: 0.75rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Artists Affected</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.genresFilteredCount}</div>
        <div style="font-size: 0.75rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Genres Filtered</div>
      </div>
    </div>
    <p style="text-align: center; color: var(--pico-muted-color); font-size: 0.8125rem; margin-top: 0.75rem;">
      \${stats.artistsAffected} artists will have specific genres after filtering (\${((stats.artistsAffected / stats.totalArtists) * 100).toFixed(1)}%)
    </p>
  \`;
}

// Render filtered genres list
function renderFilteredGenresList(filteredGenres) {
  const container = document.getElementById('filtered-genres-list');
  if (!filteredGenres || filteredGenres.length === 0) {
    container.innerHTML = '<p style="color: var(--pico-muted-color); margin: 0.75rem 0;">No genres are currently being filtered</p>';
    return;
  }

  container.innerHTML = \`
    <p style="color: var(--pico-muted-color); font-size: 0.8125rem; margin-bottom: 0.75rem;">
      Showing top \${filteredGenres.length} filtered genres:
    </p>
    \${filteredGenres.map(({ genre, artistCount }) => \`
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.375rem 0; border-bottom: 1px solid var(--pico-muted-border-color);">
        <div>
          <strong>\${escapeHtmlForGenre(genre)}</strong>
          <span style="color: var(--pico-muted-color); margin-left: 0.5rem; font-size: 0.8125rem;">
            (\${artistCount} \${artistCount === 1 ? 'artist' : 'artists'})
          </span>
        </div>
        <button class="outline" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; margin: 0;" onclick="removeGenreFromList('\${escapeHtmlForGenre(genre)}')">Remove</button>
      </div>
    \`).join('')}
  \`;
}

// Update default notice visibility
function updateGenreDefaultNotice() {
  document.getElementById('genre-default-notice').style.display = genreListIsDefault ? 'block' : 'none';
}

// Update save button state
function updateGenreSaveButton() {
  document.getElementById('save-genres-btn').disabled = !genreListDirty;
}

// Mark as dirty
function markGenresDirty() {
  genreListDirty = true;
  genreListIsDefault = false;
  updateGenreSaveButton();
  updateGenreDefaultNotice();
}

// Add genre to ignore list
function addGenreToList(genre) {
  if (!genre || currentGenreIgnoreList.includes(genre)) return;
  currentGenreIgnoreList.push(genre);
  currentGenreIgnoreList.sort();
  renderGenreTags();
  markGenresDirty();
  document.getElementById('genre-search-input').value = '';
  document.getElementById('genre-suggestions-list').style.display = 'none';
}

// Remove genre from ignore list
function removeGenreFromList(genre) {
  const index = currentGenreIgnoreList.indexOf(genre);
  if (index === -1) return;
  currentGenreIgnoreList.splice(index, 1);
  renderGenreTags();
  markGenresDirty();
  refreshGenreStatistics();
}

// Save changes
async function saveGenreChanges() {
  const saveBtn = document.getElementById('save-genres-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '💾 Saving...';

  try {
    const response = await fetch('/config/api/genres/ignore-list', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genres: currentGenreIgnoreList })
    });

    if (!response.ok) throw new Error('Failed to save');

    genreListDirty = false;
    updateGenreSaveButton();
    showToast('Genre ignore list updated successfully', 'success');
    await refreshGenreStatistics();
  } catch (error) {
    console.error('Failed to save genres:', error);
    showToast('Failed to save changes', 'error');
    saveBtn.disabled = false;
  } finally {
    saveBtn.textContent = '💾 Save Changes';
  }
}

// Reset to default
async function resetGenresToDefault() {
  if (!confirm('Are you sure you want to reset the genre ignore list to default values?')) return;

  try {
    const response = await fetch('/config/api/genres/ignore-list', { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to reset');

    showToast('Genre ignore list reset to default', 'success');
    await loadGenreConfiguration();
    genreListDirty = false;
    updateGenreSaveButton();
  } catch (error) {
    console.error('Failed to reset:', error);
    showToast('Failed to reset to default', 'error');
  }
}

// Filter genres for autocomplete
function filterGenreSuggestions() {
  const search = document.getElementById('genre-search-input').value.toLowerCase().trim();
  const container = document.getElementById('genre-suggestions-list');

  if (!search) {
    container.style.display = 'none';
    return;
  }

  const matches = allGenresList
    .filter(({ genre }) => genre.toLowerCase().includes(search) && !currentGenreIgnoreList.includes(genre))
    .slice(0, 20);

  if (matches.length === 0) {
    container.innerHTML = '<p style="padding: 0.75rem; margin: 0; color: var(--pico-muted-color); font-size: 0.875rem;">No matching genres found</p>';
    container.style.display = 'block';
    return;
  }

  container.innerHTML = matches.map(({ genre, artistCount }) => \`
    <div onclick="addGenreToList('\${escapeHtmlForGenre(genre)}')" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--pico-muted-border-color); transition: background 0.2s;">
      <span style="font-size: 0.875rem;">\${escapeHtmlForGenre(genre)}</span>
      <span style="font-size: 0.75rem; color: var(--pico-muted-color); background: var(--pico-background-color); padding: 0.15rem 0.4rem; border-radius: 0.25rem;">\${artistCount} \${artistCount === 1 ? 'artist' : 'artists'}</span>
    </div>
  \`).join('');

  container.style.display = 'block';

  // Add hover effect
  container.querySelectorAll('div[onclick]').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'var(--pico-primary-background)');
    el.addEventListener('mouseleave', () => el.style.background = '');
  });
}

// Refresh statistics
async function refreshGenreStatistics() {
  try {
    const response = await fetch('/config/api/genres/ignore-list');
    const data = await response.json();
    renderGenreStatistics(data.statistics);
    renderFilteredGenresList(data.statistics.filteredGenres);
  } catch (error) {
    console.error('Failed to refresh statistics:', error);
  }
}

// Escape HTML
function escapeHtmlForGenre(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  const searchInput = document.getElementById('genre-search-input');
  const suggestions = document.getElementById('genre-suggestions-list');
  if (searchInput && suggestions && !searchInput.contains(e.target) && !suggestions.contains(e.target)) {
    suggestions.style.display = 'none';
  }
});

// Load genre configuration when genre section is opened
const genreSection = document.getElementById('section-genres');
if (genreSection) {
  genreSection.addEventListener('toggle', () => {
    if (genreSection.open && currentGenreIgnoreList.length === 0) {
      loadGenreConfiguration();
    }
  });
  // Also load if already open on page load
  if (genreSection.open) {
    loadGenreConfiguration();
  }
}
      `}</script>
    </Layout>
  );
}
