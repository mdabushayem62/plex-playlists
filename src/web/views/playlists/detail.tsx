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
  scoringMetadata: string | null; // JSON string containing full ScoringComponents
}

interface ScoringMetadata {
  skipPenalty?: number;
  timeOfDayBoost?: number;
  genreMatchScore?: number;
  moodMatchScore?: number;
  artistSpacingPenalty?: number;
  discoveryBoost?: number;
  nostalgiaWeight?: number;
  playCountPenalty?: number;
  recencyPenalty?: number;
  qualityScore?: number;
  energyAlignmentScore?: number;
  tempoMatchScore?: number;
}

interface ScoringComponents {
  finalScore?: number;
  recencyWeight?: number;
  ratingScore?: number;
  playCountScore?: number;
  fallbackScore?: number;
  metadata?: ScoringMetadata;
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
  customPlaylistData: {
    scoringStrategy: string;
    genres: string[];
    moods: string[];
  } | null;
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

function formatDate(date: Date): JSX.Element {
  return new Date(date).toLocaleString();
}

function formatScore(score: number | null): JSX.Element {
  return score ? score.toFixed(3) : '-';
}

/**
 * Playlist detail content only (for HTMX partial rendering)
 */
export function PlaylistDetailContent(props: Omit<PlaylistDetailPageProps, 'page' | 'setupComplete'>) {
  const {
    playlist,
    tracks,
    recentJobs,
    genreStats,
    prevPlaylist,
    nextPlaylist,
    customPlaylistData,
    breadcrumbs
  } = props;

  return (
    <div>
        {/* Breadcrumbs & Navigation */}
        <div class="flex-between mb-5">
          {breadcrumbs && (
            <nav aria-label="breadcrumb">
              <ol class="flex text-muted-sm m-0 p-0 gap-3" style="list-style: none;">
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
          <div class="flex gap-3">
            {prevPlaylist ? (
              <a
                href={`/playlists/${prevPlaylist.id}`}
                role="button"
                class="secondary m-0 px-5 py-3"
                title={prevPlaylist.title || prevPlaylist.window}
              >
                ← Previous
              </a>
            ) : (
              <button disabled class="m-0 px-5 py-3">← Previous</button>
            )}
            {nextPlaylist ? (
              <a
                href={`/playlists/${nextPlaylist.id}`}
                role="button"
                class="secondary m-0 px-5 py-3"
                title={nextPlaylist.title || nextPlaylist.window}
              >
                Next →
              </a>
            ) : (
              <button disabled class="m-0 px-5 py-3">Next →</button>
            )}
          </div>
        </div>

        {/* Playlist Header */}
        <div class="card p-6 rounded-lg mb-5">
          <div class="mb-5">
            <h2 class="m-0">{playlist.title || playlist.window}</h2>
            {playlist.description && (
              <p class="text-muted mt-3 m-0">
                {playlist.description}
              </p>
            )}
          </div>

          {/* Playlist Stats */}
          <div class="grid-auto-wide gap-4 mt-5">
            <div>
              <p class="text-muted-sm m-0">Tracks</p>
              <p class="m-0" style="font-size: 1.5rem; font-weight: 600;">{playlist.trackCount}</p>
            </div>
            <div>
              <p class="text-muted-sm m-0">Last Generated</p>
              <p class="m-0" style="font-size: 1rem;">{timeAgo(playlist.generatedAt)}</p>
              <p class="text-muted-xs m-0">{formatDate(playlist.generatedAt)}</p>
            </div>
            {customPlaylistData && (
              <div>
                <p class="text-muted-sm m-0">Strategy</p>
                <p class="m-0" style="font-size: 1rem; text-transform: capitalize;">
                  {customPlaylistData.scoringStrategy}
                </p>
              </div>
            )}
            {playlist.plexRatingKey && (
              <div>
                <p class="text-muted-sm m-0">Plex</p>
                <p class="m-0">
                  <a href="#" class="text-sm" title="Open in Plex (requires Plex app)">
                    View in Plex →
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Genre Tag Cloud */}
          {genreStats && genreStats.length > 0 && (
            <div class="mt-6 pt-5 border-top">
              <p class="text-muted-sm m-0 mb-4" style="font-weight: 600;">
                Genres in this playlist:
              </p>
              <div class="flex flex-wrap gap-3">
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
                    <small class="text-muted" style="margin-left: 0.25rem;">{g.count}</small>
                  </span>
                ))}
                {genreStats.length > 15 && (
                  <span class="text-muted-sm" style="padding: 0.25rem 0.5rem;">
                    +{genreStats.length - 15} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div class="flex gap-4 flex-wrap mt-6 pt-5 border-top">
            <button
              id="regenerateBtn"
              data-window={playlist.window}
              onclick="confirmRegenerate()"
              class="m-0"
              title="Regenerate this playlist"
              aria-label="Regenerate this playlist"
            >
              🔄 Regenerate
            </button>
            <a href={`/playlists/${playlist.id}/export/csv`} role="button" class="secondary m-0" title="Export playlist as CSV" aria-label="Export playlist as CSV">
              📊 Export CSV
            </a>
            <a href={`/playlists/${playlist.id}/export/m3u`} role="button" class="secondary m-0" title="Export playlist as M3U" aria-label="Export playlist as M3U">
              🎵 Export M3U
            </a>
            <a href="/playlists/builder" role="button" class="secondary m-0" title="Manage all playlists" aria-label="Manage all playlists">
              ⚙️ Manage Playlists
            </a>
            <button
              id="deleteBtn"
              data-playlist-id={playlist.id}
              onclick="confirmDelete()"
              class="secondary m-0"
              style="margin-left: auto;"
              title="Delete this playlist"
              aria-label="Delete this playlist"
            >
              🗑️ Delete
            </button>
          </div>
        </div>

        {/* Tracks Table */}
        <section>
          <h3>Tracks ({tracks.length})</h3>
          {tracks.length === 0 ? (
            <p class="text-muted">No tracks in this playlist.</p>
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
                      <th class="text-center" style="width: 120px;">Genres</th>
                      <th class="text-right" style="width: 100px;" title="Composite score from multiple factors - hover over tracks for detailed breakdown">Score</th>
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
                      } catch (_e) {
                        // Ignore parse errors
                      }

                      // Parse scoring metadata for detailed tooltip
                      let scoringComponents: ScoringComponents | null = null;
                      try {
                        if (track.scoringMetadata) {
                          scoringComponents = JSON.parse(track.scoringMetadata) as ScoringComponents;
                        }
                      } catch (_e) {
                        // Ignore parse errors
                      }

                      // Build comprehensive tooltip content
                      const tooltipLines: string[] = ['Score Breakdown:'];

                      if (scoringComponents) {
                        // Show all core components
                        tooltipLines.push('• Final Score: ' + formatScore(scoringComponents.finalScore ?? null));
                        tooltipLines.push('• Recency Weight: ' + formatScore(scoringComponents.recencyWeight ?? null));
                        tooltipLines.push('• Rating Score: ' + formatScore(scoringComponents.ratingScore ?? null));
                        tooltipLines.push('• Play Count Score: ' + formatScore(scoringComponents.playCountScore ?? null));
                        tooltipLines.push('• Fallback Score: ' + formatScore(scoringComponents.fallbackScore ?? null));

                        // Show metadata components if present
                        if (scoringComponents.metadata) {
                          const meta = scoringComponents.metadata;
                          if (meta.skipPenalty !== undefined) {
                            tooltipLines.push('• Skip Penalty: ' + formatScore(meta.skipPenalty ?? null));
                          }
                          if (meta.timeOfDayBoost !== undefined) {
                            tooltipLines.push('• Time of Day Boost: ' + formatScore(meta.timeOfDayBoost ?? null));
                          }
                          if (meta.genreMatchScore !== undefined) {
                            tooltipLines.push('• Genre Match: ' + formatScore(meta.genreMatchScore ?? null));
                          }
                          if (meta.moodMatchScore !== undefined) {
                            tooltipLines.push('• Mood Match: ' + formatScore(meta.moodMatchScore ?? null));
                          }
                          if (meta.artistSpacingPenalty !== undefined) {
                            tooltipLines.push('• Artist Spacing: ' + formatScore(meta.artistSpacingPenalty ?? null));
                          }
                          if (meta.discoveryBoost !== undefined) {
                            tooltipLines.push('• Discovery Boost: ' + formatScore(meta.discoveryBoost ?? null));
                          }
                          if (meta.nostalgiaWeight !== undefined) {
                            tooltipLines.push('• Nostalgia Weight: ' + formatScore(meta.nostalgiaWeight ?? null));
                          }
                          if (meta.playCountPenalty !== undefined) {
                            tooltipLines.push('• Play Count Penalty: ' + formatScore(meta.playCountPenalty ?? null));
                          }
                          if (meta.recencyPenalty !== undefined) {
                            tooltipLines.push('• Recency Penalty: ' + formatScore(meta.recencyPenalty ?? null));
                          }
                          if (meta.qualityScore !== undefined) {
                            tooltipLines.push('• Quality Score: ' + formatScore(meta.qualityScore ?? null));
                          }
                          if (meta.energyAlignmentScore !== undefined) {
                            tooltipLines.push('• Energy Alignment: ' + formatScore(meta.energyAlignmentScore ?? null));
                          }
                          if (meta.tempoMatchScore !== undefined) {
                            tooltipLines.push('• Tempo Match: ' + formatScore(meta.tempoMatchScore ?? null));
                          }
                        }
                      } else {
                        // Fallback to legacy format for backward compatibility
                        tooltipLines.push('• Final: ' + formatScore(track.score));
                        tooltipLines.push('• Recency: ' + formatScore(track.recencyWeight));
                        tooltipLines.push('• Fallback: ' + formatScore(track.fallbackScore));
                      }

                      // Add genres to tooltip
                      if (trackGenres.length > 0) {
                        tooltipLines.push('\nGenres: ' + trackGenres.join(', '));
                      }

                      const tooltipContent = tooltipLines.join('\n');

                      return (
                        <tr style="cursor: help;" title={tooltipContent}>
                          <td class="text-muted">{track.position + 1}</td>
                          <td><strong>{track.title || 'Unknown Title'}</strong></td>
                          <td>{track.artist || 'Unknown Artist'}</td>
                          <td class="text-muted">{track.album || '-'}</td>
                          <td class="text-xs text-center">
                            {trackGenres.length > 0 ? (
                              <div class="flex flex-wrap gap-1 justify-center">
                                {trackGenres.slice(0, 2).map(g => (
                                  <span class="px-2 py-1 rounded" style="background: var(--pico-background-color); white-space: nowrap;">{g}</span>
                                ))}
                                {trackGenres.length > 2 && (
                                  <span class="text-muted">+{trackGenres.length - 2}</span>
                                )}
                              </div>
                            ) : (
                              <span class="text-muted">-</span>
                            )}
                          </td>
                          <td class="text-sm text-right" style="font-family: monospace;">
                            <span
                              class="px-3 py-2 rounded"
                              style="display: inline-block; background: var(--pico-background-color); font-weight: 600;"
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
              <p class="text-muted-sm mt-5">
                💡 <strong>Tip:</strong> Hover over tracks to see detailed score breakdowns and full genre lists
              </p>
            </>
          )}
        </section>

        {/* Recent Generation History */}
        {recentJobs.length > 0 && (
          <section class="mt-6">
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
                      <td class="text-sm" style="color: var(--pico-del-color);">
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
  );
}

/**
 * Full playlist detail page with layout (for regular requests)
 */
export function PlaylistDetailPage(props: PlaylistDetailPageProps): JSX.Element {
  const { setupComplete, page, ...contentProps } = props;

  return (
    <Layout title={contentProps.playlist.title || contentProps.playlist.window} page={page} setupComplete={setupComplete}>
      <PlaylistDetailContent {...contentProps} />
    </Layout>
  );
}
