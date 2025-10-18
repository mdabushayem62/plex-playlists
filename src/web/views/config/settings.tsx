/**
 * Settings page with tabbed interface
 * Uses HTMX tabs-hateoas pattern for desktop-first navigation
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';
import { EditableFieldScript, type FieldMetadata } from '../components/editable-field.js';
import { TabsWithContent, type TabsData } from './config-tabs.js';

export interface SettingsPageProps {
  plexSettings: Record<string, FieldMetadata>;
  apiSettings: Record<string, FieldMetadata>;
  scoringSettings: Record<string, FieldMetadata>;
  schedulingSettings: Record<string, FieldMetadata>;
  cacheStats: {
    artists: {
      total: number;
      bySource: Record<string, number>;
      expired: number;
      expiringWithin7Days: number;
      oldestEntry: Date | null;
      newestEntry: Date | null;
    };
    albums: {
      total: number;
      bySource: Record<string, number>;
      expired: number;
      expiringWithin7Days: number;
      oldestEntry: Date | null;
      newestEntry: Date | null;
    };
    tracks: {
      total: number;
      totalTracks: number;
      coverage: number;
      staticExpired: number;
      staticExpiringWithin7Days: number;
      statsExpired: number;
      statsExpiringWithin7Days: number;
      highRated: number;
      unplayed: number;
      unrated: number;
      oldestStaticEntry: Date | null;
      newestStaticEntry: Date | null;
      oldestStatsEntry: Date | null;
      newestStatsEntry: Date | null;
    };
  };
  envVars: {
    database: { path: string };
    webUi: { enabled: boolean; port: number };
  };
  page: string;
  setupComplete: boolean;
  activeTab?: string;
}

/**
 * Settings content only (for HTMX partial rendering)
 */
export function SettingsContent(props: Omit<SettingsPageProps, 'page' | 'setupComplete'>): JSX.Element {
  const {
    plexSettings,
    apiSettings,
    scoringSettings,
    schedulingSettings,
    cacheStats,
    envVars,
    activeTab = 'general'
  } = props;

  // Prepare data for tabs
  const tabsData: TabsData = {
    plexSettings,
    apiSettings,
    scoringSettings,
    schedulingSettings,
    cacheStats,
    envVars
  };

  return (
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

      <div class="flex-between" style="margin-bottom: 1rem;">
        <div>
          <h2 class="m-0">⚙️ Settings</h2>
          <p class="text-muted-sm" style="margin: 0.25rem 0 0 0;">
            Configure your Plex Playlist Enhancer
          </p>
        </div>
      </div>

      {/* Tabs with content */}
      {TabsWithContent({ activeTab, data: tabsData })}

      {EditableFieldScript()}

      {/* Job monitoring module for cache warming progress */}
      <script src="/js/job-monitor.js"></script>

      {/* Cache warming functions */}
      <script>{`
        // Cache warming function with progress tracking
        async function warmCache() {
          const elements = {
            button: document.getElementById('warmCacheBtn'),
            progressContainer: document.getElementById('artist-cache-progress'),
            progressBar: document.getElementById('artist-cache-progress-bar'),
            progressPercent: document.getElementById('artist-cache-progress-percent'),
            progressMessage: document.getElementById('artist-cache-progress-message'),
            progressEta: document.getElementById('artist-cache-progress-eta')
          };

          try {
            await window.jobMonitor.startCacheWarming('artist', elements);
          } catch (err) {
            showToast('Failed to start cache warming: ' + err.message, 'error');
          }
        }

        // Album cache warming function with progress tracking
        async function warmAlbumCache() {
          const elements = {
            button: document.getElementById('warmAlbumCacheBtn'),
            progressContainer: document.getElementById('album-cache-progress'),
            progressBar: document.getElementById('album-cache-progress-bar'),
            progressPercent: document.getElementById('album-cache-progress-percent'),
            progressMessage: document.getElementById('album-cache-progress-message'),
            progressEta: document.getElementById('album-cache-progress-eta')
          };

          try {
            await window.jobMonitor.startCacheWarming('album', elements);
          } catch (err) {
            showToast('Failed to start album cache warming: ' + err.message, 'error');
          }
        }

        // Sync rated tracks to cache (quick sync for analytics)
        async function syncRatedTracks() {
          const elements = {
            button: document.getElementById('syncRatedTracksBtn'),
            progressContainer: document.getElementById('track-cache-progress'),
            progressBar: document.getElementById('track-cache-progress-bar'),
            progressPercent: document.getElementById('track-cache-progress-percent'),
            progressMessage: document.getElementById('track-cache-progress-message'),
            progressEta: document.getElementById('track-cache-progress-eta'),
            progressLabel: document.getElementById('track-cache-progress-label')
          };

          const btn = elements.button;
          const originalText = btn.innerHTML;

          btn.disabled = true;
          btn.innerHTML = '⏳ Starting...';
          elements.progressContainer.style.display = 'block';
          elements.progressLabel.textContent = 'Syncing rated tracks...';

          try {
            const response = await fetch('/actions/cache/sync-rated', { method: 'POST' });
            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error || 'Failed to start sync');
            }

            const jobId = data.jobId;
            const eventSource = new EventSource(\`/actions/jobs/\${jobId}/stream\`);

            eventSource.onmessage = (event) => {
              const job = JSON.parse(event.data);

              if (job.progress) {
                const progressPercent = job.progress.percent || 0;
                elements.progressBar.value = progressPercent;
                elements.progressPercent.textContent = Math.round(progressPercent) + '%';
                elements.progressMessage.textContent = job.progress.message || 'Syncing...';
                if (job.progress.eta) {
                  elements.progressEta.textContent = 'ETA: ' + job.progress.eta;
                }
              }

              if (job.status === 'success') {
                btn.innerHTML = '✓ Synced';
                showToast('Rated tracks sync complete', 'success');
                eventSource.close();
                setTimeout(() => window.location.reload(), 1500);
              } else if (job.status === 'failed') {
                btn.innerHTML = '✗ Failed';
                btn.disabled = false;
                showToast(\`Sync failed: \${job.error || 'Unknown error'}\`, 'error');
                elements.progressContainer.style.display = 'none';
                eventSource.close();
                setTimeout(() => {
                  btn.innerHTML = originalText;
                }, 5000);
              }
            };

            eventSource.onerror = () => {
              eventSource.close();
              fetch(\`/actions/jobs/\${jobId}\`)
                .then(res => res.json())
                .then(job => {
                  if (job.status === 'success') {
                    btn.innerHTML = '✓ Synced';
                    showToast('Rated tracks sync complete', 'success');
                    setTimeout(() => window.location.reload(), 1500);
                  } else if (job.status === 'failed') {
                    btn.innerHTML = '✗ Failed';
                    btn.disabled = false;
                    showToast(\`Sync failed: \${job.error || 'Unknown error'}\`, 'error');
                    elements.progressContainer.style.display = 'none';
                  }
                })
                .catch(() => {
                  btn.innerHTML = '✗ Failed';
                  btn.disabled = false;
                  elements.progressContainer.style.display = 'none';
                });
            };
          } catch (err) {
            btn.innerHTML = '✗ Failed';
            btn.disabled = false;
            showToast('Failed to start sync: ' + err.message, 'error');
            elements.progressContainer.style.display = 'none';
            setTimeout(() => {
              btn.innerHTML = originalText;
            }, 3000);
          }
        }

        // Sync full track library to cache
        async function syncFullLibrary() {
          const elements = {
            button: document.getElementById('syncFullLibraryBtn'),
            progressContainer: document.getElementById('track-cache-progress'),
            progressBar: document.getElementById('track-cache-progress-bar'),
            progressPercent: document.getElementById('track-cache-progress-percent'),
            progressMessage: document.getElementById('track-cache-progress-message'),
            progressEta: document.getElementById('track-cache-progress-eta'),
            progressLabel: document.getElementById('track-cache-progress-label')
          };

          const btn = elements.button;
          const originalText = btn.innerHTML;

          btn.disabled = true;
          btn.innerHTML = '⏳ Starting...';
          elements.progressContainer.style.display = 'block';
          elements.progressLabel.textContent = 'Syncing full track library...';

          try {
            const response = await fetch('/actions/cache/sync-full', { method: 'POST' });
            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error || 'Failed to start sync');
            }

            const jobId = data.jobId;
            const eventSource = new EventSource(\`/actions/jobs/\${jobId}/stream\`);

            eventSource.onmessage = (event) => {
              const job = JSON.parse(event.data);

              if (job.progress) {
                const progressPercent = job.progress.percent || 0;
                elements.progressBar.value = progressPercent;
                elements.progressPercent.textContent = Math.round(progressPercent) + '%';
                elements.progressMessage.textContent = job.progress.message || 'Syncing...';
                if (job.progress.eta) {
                  elements.progressEta.textContent = 'ETA: ' + job.progress.eta;
                }
              }

              if (job.status === 'success') {
                btn.innerHTML = '✓ Synced';
                showToast('Full library sync complete', 'success');
                eventSource.close();
                setTimeout(() => window.location.reload(), 1500);
              } else if (job.status === 'failed') {
                btn.innerHTML = '✗ Failed';
                btn.disabled = false;
                showToast(\`Sync failed: \${job.error || 'Unknown error'}\`, 'error');
                elements.progressContainer.style.display = 'none';
                eventSource.close();
                setTimeout(() => {
                  btn.innerHTML = originalText;
                }, 5000);
              }
            };

            eventSource.onerror = () => {
              eventSource.close();
              fetch(\`/actions/jobs/\${jobId}\`)
                .then(res => res.json())
                .then(job => {
                  if (job.status === 'success') {
                    btn.innerHTML = '✓ Synced';
                    showToast('Full library sync complete', 'success');
                    setTimeout(() => window.location.reload(), 1500);
                  } else if (job.status === 'failed') {
                    btn.innerHTML = '✗ Failed';
                    btn.disabled = false;
                    showToast(\`Sync failed: \${job.error || 'Unknown error'}\`, 'error');
                    elements.progressContainer.style.display = 'none';
                  }
                })
                .catch(() => {
                  btn.innerHTML = '✗ Failed';
                  btn.disabled = false;
                  elements.progressContainer.style.display = 'none';
                });
            };
          } catch (err) {
            btn.innerHTML = '✗ Failed';
            btn.disabled = false;
            showToast('Failed to start sync: ' + err.message, 'error');
            elements.progressContainer.style.display = 'none';
            setTimeout(() => {
              btn.innerHTML = originalText;
            }, 3000);
          }
        }

        // Expose functions globally for inline onclick handlers
        window.warmCache = warmCache;
        window.warmAlbumCache = warmAlbumCache;
        window.syncRatedTracks = syncRatedTracks;
        window.syncFullLibrary = syncFullLibrary;
      `}</script>

      {/* Settings scripts */}
      {renderSettingsScripts(plexSettings, apiSettings, scoringSettings, schedulingSettings, activeTab)}

      {/* URL hash support and connection testing */}
      <script src="/js/config.js"></script>
    </div>
  );
}

/**
 * Helper to render settings scripts (extracted for reuse)
 */
function renderSettingsScripts(
  plexSettings: Record<string, FieldMetadata>,
  apiSettings: Record<string, FieldMetadata>,
  scoringSettings: Record<string, FieldMetadata>,
  schedulingSettings: Record<string, FieldMetadata>,
  activeTab: string
): JSX.Element {
  return (
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
    container.innerHTML = '<p class="text-muted-sm m-0">No genres in ignore list</p>';
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
        <div class="text-muted-xs" style="margin-top: 0.25rem;">Total Artists</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.totalUniqueGenres}</div>
        <div class="text-muted-xs" style="margin-top: 0.25rem;">Unique Genres</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.artistsAffected}</div>
        <div class="text-muted-xs" style="margin-top: 0.25rem;">Artists Affected</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);">
        <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary); line-height: 1;">\${stats.genresFilteredCount}</div>
        <div class="text-muted-xs" style="margin-top: 0.25rem;">Genres Filtered</div>
      </div>
    </div>
    <p class="text-muted-sm" style="text-align: center; margin-top: 0.75rem;">
      \${stats.artistsAffected} artists will have specific genres after filtering (\${((stats.artistsAffected / stats.totalArtists) * 100).toFixed(1)}%)
    </p>
  \`;
}

// Render filtered genres list
function renderFilteredGenresList(filteredGenres) {
  const container = document.getElementById('filtered-genres-list');
  if (!filteredGenres || filteredGenres.length === 0) {
    container.innerHTML = '<p class="text-muted" style="margin: 0.75rem 0;">No genres are currently being filtered</p>';
    return;
  }

  container.innerHTML = \`
    <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
      Showing top \${filteredGenres.length} filtered genres:
    </p>
    \${filteredGenres.map(({ genre, artistCount }) => \`
      <div class="flex-between" style="padding: 0.375rem 0; border-bottom: 1px solid var(--pico-muted-border-color);">
        <div>
          <strong>\${escapeHtmlForGenre(genre)}</strong>
          <span class="text-muted-sm" style="margin-left: 0.5rem;">
            (\${artistCount} \${artistCount === 1 ? 'artist' : 'artists'})
          </span>
        </div>
        <button class="outline m-0 text-xs" style="padding: 0.2rem 0.4rem;" onclick="removeGenreFromList('\${escapeHtmlForGenre(genre)}')">Remove</button>
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
    container.innerHTML = '<p class="text-muted-sm m-0" style="padding: 0.75rem;">No matching genres found</p>';
    container.style.display = 'block';
    return;
  }

  container.innerHTML = matches.map(({ genre, artistCount }) => \`
    <div onclick="addGenreToList('\${escapeHtmlForGenre(genre)}')" class="flex-between" style="padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--pico-muted-border-color); transition: background 0.2s;">
      <span class="text-sm">\${escapeHtmlForGenre(genre)}</span>
      <span class="text-muted-xs" style="background: var(--pico-background-color); padding: 0.15rem 0.4rem; border-radius: 0.25rem;">\${artistCount} \${artistCount === 1 ? 'artist' : 'artists'}</span>
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

// Load genre configuration on page load if genre tab is active
if (window.location.hash === '#genre' || '${activeTab}' === 'genre') {
  setTimeout(() => {
    if (currentGenreIgnoreList.length === 0) {
      loadGenreConfiguration();
    }
  }, 100);
}

// Reload genre config when switching to genre tab
document.body.addEventListener('htmx:afterSettle', function(event) {
  const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
  if (activeTab && activeTab.dataset.tabId === 'genre' && currentGenreIgnoreList.length === 0) {
    loadGenreConfiguration();
  }
});
      `}</script>
  );
}

/**
 * Full settings page with layout (for regular requests)
 */
export function SettingsPage(props: SettingsPageProps): JSX.Element {
  const { page, setupComplete, ...contentProps } = props;

  return (
    <Layout title="Settings" page={page} setupComplete={setupComplete}>
      <SettingsContent {...contentProps} />
    </Layout>
  );
}
