/**
 * Config tabs components - HTMX tabs-hateoas pattern
 * Server renders all tab buttons + active tab content
 */

import Html from '@kitajs/html';
import { EditableField, type FieldMetadata } from '../components/editable-field.js';
import { StatsCard, type CacheStats } from '../components/stats-card.js';

export interface TabsData {
  plexSettings: Record<string, FieldMetadata>;
  apiSettings: Record<string, FieldMetadata>;
  scoringSettings: Record<string, FieldMetadata>;
  schedulingSettings: Record<string, FieldMetadata>;
  genreSettings?: {
    ignoreList: string[];
    isDefault: boolean;
    statistics: {
      totalArtists: number;
      totalUniqueGenres: number;
      artistsAffected: number;
      genresFilteredCount: number;
      filteredGenres: Array<{ genre: string; artistCount: number }>;
    };
    allGenres: Array<{ genre: string; artistCount: number }>;
  };
  cacheStats: {
    artists: CacheStats;
    albums: CacheStats;
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
}

export interface TabsWithContentProps {
  activeTab: string;
  data: TabsData;
}

function formatFieldName(key: string): JSX.Element {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Tab buttons - rendered for all requests
 */
export function TabButtons({ activeTab }: { activeTab: string }): JSX.Element {
  const tabs = [
    { id: 'general', label: '🖥️ General' },
    { id: 'scoring', label: '🎯 Scoring' },
    { id: 'api-keys', label: '🔗 API Keys' },
    { id: 'scheduling', label: '⏰ Scheduling' },
    { id: 'genre', label: '🎭 Genre' },
    { id: 'cache', label: '📊 Cache' },
    { id: 'import', label: '📥 Import' },
    { id: 'environment', label: '🔧 Environment' }
  ];

  return (
    <div role="tablist" style="display: flex; gap: 0.5rem; border-bottom: 2px solid var(--pico-muted-border-color); margin-bottom: 1rem; flex-wrap: wrap;">
      {tabs.map(tab => (
        <button
          role="tab"
          aria-selected={activeTab === tab.id ? 'true' : 'false'}
          class={activeTab === tab.id ? 'tab-selected' : ''}
          hx-get={`/config/api/${tab.id}`}
          hx-target="#tab-content"
          hx-swap="innerHTML"
          hx-push-url={`/config?tab=${tab.id}`}
          style={`
            background: ${activeTab === tab.id ? 'var(--pico-primary)' : 'transparent'};
            color: ${activeTab === tab.id ? 'var(--pico-primary-inverse)' : 'var(--pico-color)'};
            border: none;
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-weight: ${activeTab === tab.id ? '600' : '400'};
            border-bottom: ${activeTab === tab.id ? '2px solid var(--pico-primary)' : '2px solid transparent'};
            margin-bottom: -2px;
            transition: all 0.2s ease;
          `}
          data-tab-id={tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * General Settings Tab Content
 */
export function GeneralTabContent({ data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">🖥️ Plex Server Connection</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        ⚠️ <strong>Restart required</strong> after changing Plex settings
      </p>

      {Object.entries(data.plexSettings).map(([key, metadata]) => (
        <div style="margin-bottom: 0.75rem;">
          <div class="flex-between" style="margin-bottom: 0.25rem;">
            <label class="m-0" style="font-size: 0.875rem; font-weight: 600;">
              {formatFieldName(key)}
            </label>
          </div>
          <p class="text-muted-xs" style="margin: 0 0 0.375rem 0;">
            {metadata.description}
          </p>
          {EditableField({ fieldKey: key, metadata })}
        </div>
      ))}

      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color);">
        <button id="testPlexBtn" onclick="testPlexConnection()" class="secondary m-0">
          🔌 Test Connection
        </button>
      </div>

      {/* Configuration Tips */}
      <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.25rem; padding: 0.75rem; margin-top: 1.5rem;">
        <h4 class="m-0" style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.375rem; font-size: 0.9375rem;">
          <span>💡</span>
          <span>Configuration Tips</span>
        </h4>
        <ul class="m-0 text-sm" style="padding-left: 1.25rem;">
          <li style="margin-bottom: 0.25rem;">Changes saved to <code>./config/.env</code> for persistence across restarts</li>
          <li style="margin-bottom: 0.25rem;">Most settings take effect immediately (except Plex connection)</li>
          <li style="margin-bottom: 0.25rem;">Database settings override <code>.env</code> file values</li>
          <li>Use test buttons to verify API credentials before saving</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Scoring Settings Tab Content
 */
export function ScoringTabContent({ data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">🎯 Scoring & Algorithm</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        Fine-tune how tracks are scored and selected for playlists
      </p>

      {Object.entries(data.scoringSettings).map(([key, metadata]) => (
        <div style="margin-bottom: 0.75rem;">
          <div class="flex-between" style="margin-bottom: 0.25rem;">
            <label class="m-0" style="font-size: 0.875rem; font-weight: 600;">
              {formatFieldName(key)}
            </label>
          </div>
          <p class="text-muted-xs" style="margin: 0 0 0.375rem 0;">
            {metadata.description}
          </p>
          {EditableField({ fieldKey: key, metadata })}
        </div>
      ))}
    </div>
  );
}

/**
 * API Keys Tab Content
 */
export function ApiKeysTabContent({ data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">🔗 API Keys (Genre Enrichment)</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        Optional: Add API keys for enhanced genre metadata.
        <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/api-setup/lastfm-setup.md" target="_blank">Last.fm guide</a> •
        <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/api-setup/spotify-setup.md" target="_blank">Spotify guide</a>
      </p>

      {Object.entries(data.apiSettings).map(([key, metadata]) => {
        let label = key;
        if (key.includes('lastfm')) label = 'Last.fm API Key';
        else if (key.includes('spotify_client_id')) label = 'Spotify Client ID';
        else if (key.includes('spotify_client_secret')) label = 'Spotify Client Secret';

        return (
          <div style="margin-bottom: 0.75rem;">
            <div class="flex-between" style="margin-bottom: 0.25rem;">
              <label class="m-0" style="font-size: 0.875rem; font-weight: 600;">
                {label}
              </label>
            </div>
            <p class="text-muted-xs" style="margin: 0 0 0.375rem 0;">
              {metadata.description}
            </p>
            {EditableField({ fieldKey: key, metadata })}
          </div>
        );
      })}

      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color); display: flex; gap: 0.5rem;">
        <button onclick="testLastfm()" class="secondary m-0">
          🔍 Test Last.fm
        </button>
        <button onclick="testSpotify()" class="secondary m-0">
          🔍 Test Spotify
        </button>
      </div>
    </div>
  );
}

/**
 * Scheduling Tab Content
 */
export function SchedulingTabContent({ data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">⏰ Scheduling (Cron)</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        Configure when playlist generation runs (cron format)
      </p>

      {Object.entries(data.schedulingSettings).map(([key, metadata]) => (
        <div style="margin-bottom: 0.75rem;">
          <div class="flex-between" style="margin-bottom: 0.25rem;">
            <label class="m-0" style="font-size: 0.875rem; font-weight: 600;">
              {formatFieldName(key)}
            </label>
          </div>
          <p class="text-muted-xs" style="margin: 0 0 0.375rem 0;">
            {metadata.description}
          </p>
          {EditableField({ fieldKey: key, metadata })}
        </div>
      ))}
    </div>
  );
}

/**
 * Genre Filtering Tab Content
 */
export function GenreTabContent({ data: _data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">🎭 Genre Filtering</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        Manage which genres are filtered out during playlist generation. Meta-genres like "electronic" and "pop/rock" are too broad and get filtered by default.
      </p>

      {/* Genre configuration will be loaded dynamically */}
      <div style="margin-bottom: 1rem;">
        <h4 class="m-0" style="margin-bottom: 0.5rem; font-size: 0.9375rem;">📊 Impact Statistics</h4>
        <div id="genre-stats-container" style="min-height: 80px; display: flex; align-items: center; justify-content: center;">
          <div class="loading"></div>
        </div>
      </div>

      <div style="margin-bottom: 1rem;">
        <div class="flex-between" style="margin-bottom: 0.5rem;">
          <h4 class="m-0" style="font-size: 0.9375rem;">🚫 Genres to Filter</h4>
          <div style="display: flex; gap: 0.5rem;">
            <button id="reset-genres-btn" onclick="resetGenresToDefault()" class="outline m-0" style="padding: 0.25rem 0.75rem; font-size: 0.8125rem;">
              🔄 Reset to Default
            </button>
            <button id="save-genres-btn" onclick="saveGenreChanges()" class="primary m-0" disabled style="padding: 0.25rem 0.75rem; font-size: 0.8125rem;">
              💾 Save Changes
            </button>
          </div>
        </div>

        <div id="genre-default-notice" style="background: var(--pico-ins-background-color); border: 1px solid var(--pico-ins-color); border-radius: 0.25rem; padding: 0.75rem; margin-bottom: 0.75rem; display: none;">
          <strong class="text-sm">ℹ️ Using default genre ignore list</strong>
          <p class="text-muted-xs" style="margin: 0.25rem 0 0 0;">
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

      <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color);">
        <h4 class="m-0" style="margin-bottom: 0.5rem; font-size: 0.9375rem;">🎯 Currently Filtered Genres</h4>
        <p class="text-muted-xs" style="margin: 0 0 0.75rem 0;">
          These are the genres that will be filtered out from playlists based on your current ignore list.
        </p>
        <div id="filtered-genres-list" style="font-size: 0.875rem;">
          <div class="loading"></div>
        </div>
      </div>

      <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.25rem; padding: 0.75rem; margin-top: 1rem;">
        <h5 class="m-0" style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem;">
          <span>💡</span>
          <span>How Genre Filtering Works</span>
        </h5>
        <ul class="m-0 text-xs" style="padding-left: 1.25rem;">
          <li style="margin-bottom: 0.25rem;"><strong>Meta-genres</strong> like "electronic" or "pop/rock" are filtered out because they're too broad</li>
          <li style="margin-bottom: 0.25rem;"><strong>Specific genres</strong> like "synthwave" or "progressive house" remain for better playlist variety</li>
          <li style="margin-bottom: 0.25rem;"><strong>Filtering happens</strong> during playlist generation - genres are still cached for analytics</li>
          <li><strong>If all genres filtered</strong>, the original list is kept (prevents empty genre lists)</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Cache Statistics Tab Content
 */
export function CacheTabContent({ data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">📊 Cache Management</h3>
      <p class="text-muted-sm" style="margin-bottom: 1.5rem;">
        View statistics and manage metadata caches for genre enrichment and analytics.
      </p>

      {/* Artist Cache Statistics */}
      {StatsCard({ title: '🎤 Artist Cache', stats: data.cacheStats.artists, showDetails: true })}

      {/* Album Cache Statistics */}
      {StatsCard({ title: '💿 Album Cache', stats: data.cacheStats.albums, showDetails: true })}

      {/* Track Cache Statistics */}
      <div style="margin-bottom: 2rem;">
        <h4 class="m-0" style="margin-bottom: 0.75rem; font-size: 1.125rem;">🎵 Track Cache</h4>

        {/* Coverage Stats */}
        <div class="grid-auto-wide gap-4" style="margin-bottom: 1rem;">
          <div class="stat-card">
            <h3>{data.cacheStats.tracks.total}</h3>
            <p>Cached Tracks</p>
          </div>
          <div class="stat-card">
            <h3>{data.cacheStats.tracks.totalTracks}</h3>
            <p>Total in Library</p>
          </div>
          <div class="stat-card">
            <h3 style={data.cacheStats.tracks.coverage >= 80 ? "color: var(--pico-ins-color);" : data.cacheStats.tracks.coverage >= 50 ? "color: var(--pico-secondary-color);" : "color: var(--pico-del-color);"}>{data.cacheStats.tracks.coverage.toFixed(1)}%</h3>
            <p>Coverage</p>
          </div>
        </div>

        {/* Quality Indicators */}
        <div class="grid-auto-wide gap-4" style="margin-bottom: 1rem;">
          <div class="stat-card">
            <h3>{data.cacheStats.tracks.highRated}</h3>
            <p>High Rated (≥8⭐)</p>
          </div>
          <div class="stat-card">
            <h3>{data.cacheStats.tracks.unplayed}</h3>
            <p>Unplayed</p>
          </div>
          <div class="stat-card">
            <h3>{data.cacheStats.tracks.unrated}</h3>
            <p>Unrated</p>
          </div>
        </div>

        {/* Expiration Status */}
        {(data.cacheStats.tracks.staticExpiringWithin7Days > 0 || data.cacheStats.tracks.statsExpiringWithin7Days > 0) && (
          <div class="grid-auto-wide gap-4" style="margin-bottom: 1rem;">
            {data.cacheStats.tracks.staticExpiringWithin7Days > 0 && (
              <div class="stat-card">
                <h3 style="color: var(--pico-secondary-color);">{data.cacheStats.tracks.staticExpiringWithin7Days}</h3>
                <p>Static Expiring Soon</p>
              </div>
            )}
            {data.cacheStats.tracks.statsExpiringWithin7Days > 0 && (
              <div class="stat-card">
                <h3 style="color: var(--pico-secondary-color);">{data.cacheStats.tracks.statsExpiringWithin7Days}</h3>
                <p>Stats Expiring Soon</p>
              </div>
            )}
          </div>
        )}

        {/* Cache Age Details */}
        {(data.cacheStats.tracks.oldestStaticEntry || data.cacheStats.tracks.newestStaticEntry) && (
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color); color: var(--pico-muted-color); font-size: 0.875rem;">
            {data.cacheStats.tracks.oldestStaticEntry && (
              <div>Oldest static entry: {new Date(data.cacheStats.tracks.oldestStaticEntry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            )}
            {data.cacheStats.tracks.newestStaticEntry && (
              <div>Newest static entry: {new Date(data.cacheStats.tracks.newestStaticEntry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            )}
          </div>
        )}
      </div>

      {/* Cache Operations */}
      <div style="margin-bottom: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--pico-muted-border-color);">
        <h4 class="m-0" style="margin-bottom: 0.5rem; font-size: 0.9375rem;">Cache Operations</h4>
        <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
          Warm cache to fetch metadata for uncached items, or sync tracks for analytics and quality scoring.
        </p>

        {/* Artist Cache Progress Bar */}
        <div id="artist-cache-progress" style="display: none; background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div>
              <strong id="artist-cache-progress-label">Warming artist cache...</strong>
              <div style="color: var(--pico-muted-color); font-size: 0.875rem;" id="artist-cache-progress-message">Starting...</div>
            </div>
            <div style="text-align: right;">
              <div id="artist-cache-progress-percent" style="font-size: 1.25rem; font-weight: bold;">0%</div>
              <div id="artist-cache-progress-eta" style="color: var(--pico-muted-color); font-size: 0.75rem;">calculating...</div>
            </div>
          </div>
          <progress id="artist-cache-progress-bar" value="0" max="100" style="width: 100%;"></progress>
        </div>

        {/* Album Cache Progress Bar */}
        <div id="album-cache-progress" style="display: none; background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div>
              <strong id="album-cache-progress-label">Warming album cache...</strong>
              <div style="color: var(--pico-muted-color); font-size: 0.875rem;" id="album-cache-progress-message">Starting...</div>
            </div>
            <div style="text-align: right;">
              <div id="album-cache-progress-percent" style="font-size: 1.25rem; font-weight: bold;">0%</div>
              <div id="album-cache-progress-eta" style="color: var(--pico-muted-color); font-size: 0.75rem;">calculating...</div>
            </div>
          </div>
          <progress id="album-cache-progress-bar" value="0" max="100" style="width: 100%;"></progress>
        </div>

        {/* Track Cache Progress Bar */}
        <div id="track-cache-progress" style="display: none; background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div>
              <strong id="track-cache-progress-label">Syncing track cache...</strong>
              <div style="color: var(--pico-muted-color); font-size: 0.875rem;" id="track-cache-progress-message">Starting...</div>
            </div>
            <div style="text-align: right;">
              <div id="track-cache-progress-percent" style="font-size: 1.25rem; font-weight: bold;">0%</div>
              <div id="track-cache-progress-eta" style="color: var(--pico-muted-color); font-size: 0.75rem;">calculating...</div>
            </div>
          </div>
          <progress id="track-cache-progress-bar" value="0" max="100" style="width: 100%;"></progress>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button id="warmCacheBtn" class="secondary m-0" onclick="warmCache()">🔥 Warm Artist Cache</button>
          <button id="warmAlbumCacheBtn" class="secondary m-0" onclick="warmAlbumCache()">🔥 Warm Album Cache</button>
          <button id="syncRatedTracksBtn" class="secondary m-0" onclick="syncRatedTracks()">⭐ Sync Rated Tracks</button>
          <button id="syncFullLibraryBtn" class="secondary m-0" onclick="syncFullLibrary()">📀 Sync Full Library</button>
          <form method="POST" action="/actions/cache/clear-expired" style="display: inline; margin: 0;">
            <button type="submit" class="secondary m-0">🗑️ Clear Expired</button>
          </form>
        </div>
      </div>

      {/* Tip */}
      <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.25rem; padding: 0.75rem;">
        <h5 class="m-0" style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem;">
          <span>💡</span>
          <span>Cache Tips</span>
        </h5>
        <ul class="m-0 text-xs" style="padding-left: 1.25rem;">
          <li style="margin-bottom: 0.25rem;"><strong>Album genres</strong> are more accurate for varied artists (e.g., Taylor Swift)</li>
          <li style="margin-bottom: 0.25rem;">Artist cache is used as fallback when album genres aren't found</li>
          <li style="margin-bottom: 0.25rem;"><strong>Track Cache (Rated):</strong> Quick 2-5 min sync for analytics (Hidden Gems chart)</li>
          <li><strong>Track Cache (Full):</strong> Complete library sync (30-45 min for large libraries)</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Environment Variables Tab Content
 */
export function EnvironmentTabContent({ data }: { data: TabsData }): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">🔧 Environment (Read-only)</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        These settings are configured in <code>.env</code> file
      </p>

      <div style="margin-bottom: 0.75rem;">
        <label style="font-size: 0.875rem; font-weight: 600;">Database Path</label>
        <p class="text-muted-xs" style="margin: 0.25rem 0 0.375rem 0;">
          SQLite database location
        </p>
        <code style="display: block; padding: 0.5rem; background: var(--pico-card-background-color); border-radius: 0.25rem;">
          {data.envVars.database.path}
        </code>
      </div>

      <div style="margin-bottom: 0.75rem;">
        <label style="font-size: 0.875rem; font-weight: 600;">Web UI</label>
        <p class="text-muted-xs" style="margin: 0.25rem 0 0.375rem 0;">
          Web interface configuration
        </p>
        <code style="display: block; padding: 0.5rem; background: var(--pico-card-background-color); border-radius: 0.25rem;">
          Enabled: {data.envVars.webUi.enabled ? 'Yes' : 'No'} | Port: {data.envVars.webUi.port}
        </code>
      </div>
    </div>
  );
}

/**
 * Import Ratings Tab Content
 */
export function ImportTabContent(): JSX.Element {
  return (
    <div>
      <h3 class="m-0" style="margin-bottom: 0.75rem;">📥 Import Ratings</h3>
      <p class="text-muted-sm" style="margin-bottom: 0.75rem;">
        Import ratings from CSV (Spotify, iTunes, Navidrome) or JSON (YouTube Music) exports.
      </p>

      <form id="importForm" hx-post="/actions/import/run" hx-target="#import-results" hx-indicator="#import-spinner">
        <label>
          Import Directory Path
          <input
            type="text"
            name="csvPath"
            value="/config/ratings"
            placeholder="/config/ratings"
            required
          />
          <small>Path to directory containing CSV or JSON files (auto-detected)</small>
        </label>

        <div style="display: flex; gap: 1rem; align-items: center;">
          <button type="submit" class="secondary">🔄 Start Import</button>
          <div id="import-spinner" class="htmx-indicator" style="color: var(--pico-muted-color);">
            Processing...
          </div>
        </div>
      </form>

      <div id="import-results" style="margin-top: 1rem;"></div>

      <details style="margin-top: 1rem;">
        <summary style="cursor: pointer;">CSV Format Requirements</summary>
        <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
          <p style="margin-bottom: 0.5rem;">
            Your CSV files must include: <code>title</code>, <code>artist</code>, <code>album</code>, and <code>rating</code>
          </p>
          <p style="margin: 0; font-size: 0.875rem;">
            📖 See <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/importing.md" target="_blank">Importing Guide</a>
            for detailed format specifications.
          </p>
        </div>
      </details>
    </div>
  );
}

/**
 * Main tabs with content component - renders tab buttons + active content
 */
export function TabsWithContent({ activeTab, data }: TabsWithContentProps): JSX.Element {
  // Map tab IDs to content components
  const contentMap: Record<string, () => JSX.Element> = {
    'general': () => GeneralTabContent({ data }),
    'scoring': () => ScoringTabContent({ data }),
    'api-keys': () => ApiKeysTabContent({ data }),
    'scheduling': () => SchedulingTabContent({ data }),
    'genre': () => GenreTabContent({ data }),
    'cache': () => CacheTabContent({ data }),
    'import': () => ImportTabContent(),
    'environment': () => EnvironmentTabContent({ data })
  };

  const ContentComponent = contentMap[activeTab] || contentMap['general'];

  return (
    <>
      {TabButtons({ activeTab })}
      <div id="tab-content" role="tabpanel">
        {ContentComponent()}
      </div>
    </>
  );
}
