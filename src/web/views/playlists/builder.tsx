/**
 * Custom Playlist Builder Page - TSX version
 * Allows users to create genre/mood-based playlists
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

export interface CustomPlaylist {
  id: number;
  name: string;
  genres: string[];
  moods: string[];
  enabled: boolean;
  targetSize: number;
  description?: string | null;
  createdAt: Date;
}

export interface PlaylistBuilderPageProps {
  customPlaylists: CustomPlaylist[];
  availableGenres: string[];
  availableMoods: string[];
  setupComplete: boolean;
  page: string;
}

export function PlaylistBuilderPage(props: PlaylistBuilderPageProps): JSX.Element {
  const { customPlaylists, availableGenres, availableMoods, setupComplete, page } = props;

  return (
    <Layout title="Playlist Builder" page={page} setupComplete={setupComplete}>
      <style>{`
        .genre-mood-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .genre-mood-tag {
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--pico-muted-border-color);
          border-radius: 1rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
          background: var(--pico-background-color);
        }
        .genre-mood-tag:hover {
          border-color: var(--pico-primary);
          background: var(--pico-card-background-color);
        }
        .genre-mood-tag.selected {
          border-color: var(--pico-primary);
          background: var(--pico-primary);
          color: var(--pico-primary-inverse);
          font-weight: 600;
        }
        .genre-mood-tag.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .playlist-builder-card {
          background: var(--pico-card-background-color);
          border: 1px solid var(--pico-muted-border-color);
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .playlist-builder-card.creating {
          border-color: var(--pico-primary);
          background: linear-gradient(135deg, rgba(74, 143, 201, 0.05) 0%, rgba(74, 143, 201, 0.02) 100%);
        }
        .recommendation-card {
          background: var(--pico-card-background-color);
          border: 1px solid var(--pico-muted-border-color);
          border-radius: 0.5rem;
          padding: 1rem;
          transition: all 0.2s;
        }
        .recommendation-card:hover {
          border-color: var(--pico-primary);
          transform: translateY(-2px);
        }
        .category-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .category-favorite { background: var(--pico-ins-color); color: white; }
        .category-mood { background: var(--pico-primary); color: var(--pico-primary-inverse); }
        .category-combo { background: var(--pico-contrast); color: var(--pico-background-color); }
        .category-discovery { background: var(--pico-muted-color); color: white; }
        #builder-form {
          display: none;
        }
        #builder-form.active {
          display: block;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><a href="/playlists">Playlists</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Builder</span></li>
          </ol>
        </nav>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <div>
            <h2 style="margin-bottom: 0.5rem;">🎨 Playlist Builder</h2>
            <p style="color: var(--pico-muted-color); margin: 0;">
              Create custom playlists by combining genres and moods. Select up to 2 genres and 2 moods.
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button id="show-recommendations-btn" onclick="loadRecommendations()" class="outline">
              💡 Get Recommendations
            </button>
            <button id="new-playlist-btn" onclick="toggleBuilder()" class="secondary">
              ➕ Create Playlist
            </button>
          </div>
        </div>

        {/* Builder Form (Hidden by default) */}
        <div id="builder-form" class="playlist-builder-card creating">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">New Custom Playlist</h3>
            <button onclick="toggleBuilder()" class="outline" style="padding: 0.25rem 0.75rem; font-size: 0.875rem;">✗ Cancel</button>
          </div>

          <form id="create-playlist-form" onsubmit="createPlaylist(event)">
            {/* Playlist Name */}
            <label for="playlist-name">
              Playlist Name <small style="color: var(--pico-del-color);">*</small>
            </label>
            <input
              type="text"
              id="playlist-name"
              name="name"
              placeholder="e.g., Energetic Synthwave, Chill Metal, Dark Moods"
              required
              maxlength="50"
            />

            {/* Genre Selection */}
            <label>
              Genres <small style="color: var(--pico-muted-color);">(Select 0-2)</small>
            </label>
            <div class="genre-mood-selector" id="genre-selector">
              {availableGenres.sort().map(genre => (
                <span
                  class="genre-mood-tag"
                  data-type="genre"
                  data-value={genre}
                  onclick="toggleTag(this, 'genre')"
                >
                  {genre}
                </span>
              ))}
            </div>
            {availableGenres.length === 0 && (
              <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-top: 0.5rem;">
                No genres available. Run cache warming to populate genre data.
              </p>
            )}

            {/* Mood Selection */}
            <label style="margin-top: 1rem;">
              Moods <small style="color: var(--pico-muted-color);">(Select 0-2)</small>
            </label>
            <div class="genre-mood-selector" id="mood-selector">
              {availableMoods.sort().map(mood => (
                <span
                  class="genre-mood-tag"
                  data-type="mood"
                  data-value={mood}
                  onclick="toggleTag(this, 'mood')"
                >
                  {mood}
                </span>
              ))}
            </div>
            {availableMoods.length === 0 && (
              <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-top: 0.5rem;">
                No moods available. Moods come from Plex metadata.
              </p>
            )}

            {/* Target Size */}
            <label for="target-size" style="margin-top: 1rem;">
              Target Size <small style="color: var(--pico-muted-color);">(Number of tracks)</small>
            </label>
            <input
              type="number"
              id="target-size"
              name="targetSize"
              value="50"
              min="10"
              max="200"
            />

            {/* Description */}
            <label for="description">
              Description <small style="color: var(--pico-muted-color);">(Optional)</small>
            </label>
            <textarea
              id="description"
              name="description"
              placeholder="Optional notes about this playlist..."
              rows="2"
            ></textarea>

            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
              <button type="submit" style="flex: 1;">Create Playlist</button>
              <button type="button" onclick="toggleBuilder()" class="secondary" style="flex: 0;">Cancel</button>
            </div>
          </form>
        </div>

        {/* Recommendations Section */}
        <section id="recommendations-section" style="margin-bottom: 3rem; display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin-bottom: 0.5rem;">💡 Recommended Playlists</h3>
              <p style="color: var(--pico-muted-color); margin: 0; font-size: 0.875rem;">
                Based on your listening history, ratings, and library analysis
              </p>
            </div>
            <button id="refresh-recommendations-btn" onclick="loadRecommendations()" class="outline" style="font-size: 0.875rem; padding: 0.375rem 0.75rem;">
              🔄 Refresh
            </button>
          </div>

          <div id="recommendations-loading" style="text-align: center; padding: 2rem;">
            <p style="color: var(--pico-muted-color);">
              <span class="spinner" style="display: inline-block; width: 1rem; height: 1rem; border: 2px solid var(--pico-muted-color); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
              Analyzing your library...
            </p>
          </div>

          <div id="recommendations-content" style="display: none;"></div>

          <div id="recommendations-error" style="display: none;">
            <div class="playlist-builder-card" style="border-color: var(--pico-del-color);">
              <p style="color: var(--pico-del-color); margin: 0;">
                Failed to load recommendations. Make sure you have enough cache data and listening history.
              </p>
            </div>
          </div>
        </section>

        {/* Existing Playlists */}
        <section>
          <h3>Your Custom Playlists ({customPlaylists.length})</h3>

          {customPlaylists.length === 0 ? (
            <div class="playlist-builder-card">
              <p style="color: var(--pico-muted-color); margin: 0;">
                No custom playlists yet. Click "Create Playlist" to get started!
              </p>
            </div>
          ) : (
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              {customPlaylists.map(playlist => (
                <article class="playlist-builder-card" style="margin: 0;">
                  <div style="display: flex; justify-content: space-between; align-items: start; gap: 1rem;">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <h4 style="margin: 0;">{playlist.name}</h4>
                        <span class={`status-badge ${playlist.enabled ? 'status-success' : 'status-muted'}`} style="font-size: 0.7rem;">
                          {playlist.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>

                      {/* Genres & Moods */}
                      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                        {playlist.genres.map(genre => (
                          <span style="padding: 0.25rem 0.5rem; background: var(--pico-primary); color: var(--pico-primary-inverse); border-radius: 0.25rem; font-size: 0.75rem;">
                            🎵 {genre}
                          </span>
                        ))}
                        {playlist.moods.map(mood => (
                          <span style="padding: 0.25rem 0.5rem; background: var(--pico-ins-color); color: var(--pico-background-color); border-radius: 0.25rem; font-size: 0.75rem;">
                            ✨ {mood}
                          </span>
                        ))}
                        {playlist.genres.length === 0 && playlist.moods.length === 0 && (
                          <span style="color: var(--pico-muted-color); font-size: 0.875rem;">No filters</span>
                        )}
                      </div>

                      {/* Metadata */}
                      <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--pico-muted-color);">
                        <span>Target: {playlist.targetSize} tracks</span>
                        <span>Created: {new Date(playlist.createdAt).toLocaleDateString()}</span>
                      </div>

                      {playlist.description && (
                        <p style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
                          {playlist.description}
                        </p>
                      )}
                    </div>

                    <div style="display: flex; gap: 0.5rem;">
                      <button
                        onclick={`togglePlaylist(${playlist.id}, ${!playlist.enabled})`}
                        class="secondary action-btn"
                        title={playlist.enabled ? 'Disable' : 'Enable'}
                      >
                        {playlist.enabled ? '⏸️' : '▶️'}
                      </button>
                      <button
                        onclick={`generatePlaylist(${playlist.id})`}
                        class="secondary action-btn"
                        title="Generate now"
                      >
                        🔄
                      </button>
                      <button
                        onclick={`deletePlaylist(${playlist.id}, '${playlist.name}')`}
                        class="outline action-btn"
                        title="Delete"
                        style="color: var(--pico-del-color);"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Help Panel */}
        <div style="background: linear-gradient(135deg, rgba(74, 143, 201, 0.1) 0%, rgba(74, 143, 201, 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.5rem; padding: 1.5rem; margin-top: 2rem;">
          <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.25rem;">💡</span>
            <span>How Custom Playlists Work</span>
          </h4>
          <ul style="margin: 0; padding-left: 1.5rem;">
            <li style="margin-bottom: 0.5rem;">
              <strong>Genres</strong> filter tracks by music style (from Spotify/Last.fm/Plex)
            </li>
            <li style="margin-bottom: 0.5rem;">
              <strong>Moods</strong> filter by emotional vibe (from Plex metadata)
            </li>
            <li style="margin-bottom: 0.5rem;">
              Combine both for precise targeting (e.g., "energetic" + "metal" = high-energy metal)
            </li>
            <li style="margin-bottom: 0.5rem;">
              Custom playlists regenerate weekly based on your recent listening history
            </li>
            <li>
              Use the 🔄 button to generate a playlist immediately without waiting for the schedule
            </li>
          </ul>
        </div>
      </div>

      <script src="/js/playlist-builder.js"></script>
    </Layout>
  );
}
