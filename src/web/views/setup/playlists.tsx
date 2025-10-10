/**
 * Setup Wizard - Playlists Preview Page
 * Shows what playlists will be generated and their schedules
 */

import Html from '@kitajs/html';
import { SetupLayout } from '../setup-layout.tsx';

interface SetupStep {
  id: string;
  title: string;
  path: string;
}

interface GenrePreview {
  genre: string;
  artistCount: number;
}

export interface PlaylistsPageProps {
  step: string;
  steps: readonly SetupStep[];
  currentStepIndex: number;
  state: unknown;
  topGenres: GenrePreview[];
  totalGenres: number;
  totalArtists: number;
  dailyPlaylistsCron?: string;
}

export function PlaylistsPage(props: PlaylistsPageProps): JSX.Element {
  const {
    steps,
    currentStepIndex,
    topGenres,
    totalGenres,
    totalArtists,
    dailyPlaylistsCron = '0 5 * * *'
  } = props;

  return (
    <SetupLayout title="Generate Playlists" steps={steps} currentStepIndex={currentStepIndex}>
      <div class="step-content">
        <h2>Ready to Generate Playlists!</h2>
        <p>
          Your Plex Playlist Enhancer is configured and ready. Here's a preview of what will be created automatically.
        </p>

        {/* Preview Section - Daily Playlists */}
        <div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem 0;">
          <h3 style="margin-top: 0;">📅 Daily Playlists (3)</h3>
          <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
            Generated automatically based on your listening patterns throughout the day
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌅</div>
              <strong>Morning Mix</strong>
              <p style="margin: 0.25rem 0 0 0; color: var(--pico-muted-color); font-size: 0.875rem;">
                6:00 AM - 11:59 AM
              </p>
            </div>
            <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">☀️</div>
              <strong>Afternoon Mix</strong>
              <p style="margin: 0.25rem 0 0 0; color: var(--pico-muted-color); font-size: 0.875rem;">
                12:00 PM - 5:59 PM
              </p>
            </div>
            <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌙</div>
              <strong>Evening Mix</strong>
              <p style="margin: 0.25rem 0 0 0; color: var(--pico-muted-color); font-size: 0.875rem;">
                6:00 PM - 11:59 PM
              </p>
            </div>
          </div>

          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer; font-size: 0.875rem;">Schedule details</summary>
            <div style="padding: 0.5rem 0 0 1rem; font-size: 0.875rem; color: var(--pico-muted-color);">
              <p style="margin: 0;">
                All three playlists generated sequentially at: <code>{dailyPlaylistsCron}</code>
              </p>
              <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem;">
                Each playlist filters by time window (morning: 6-11am, afternoon: 12-5pm, evening: 6-11pm)
                to match your listening patterns throughout the day.
              </p>
            </div>
          </details>
        </div>

        {/* Genre Playlists Preview */}
        {topGenres && topGenres.length > 0 ? (
          <div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem 0;">
            <h3 style="margin-top: 0;">🎵 Genre Playlists ({totalGenres > 5 ? `up to ${Math.min(totalGenres, 20)}` : totalGenres})</h3>
            <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
              Weekly playlists automatically created for your most popular genres
            </p>

            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
              {topGenres.map(g => (
                <span style="padding: 0.5rem 1rem; background: var(--pico-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color); font-size: 0.875rem;">
                  🎵 {g.genre}
                  {' '}<small style="color: var(--pico-muted-color);">({g.artistCount} artists)</small>
                </span>
              ))}
              {totalGenres > 10 && (
                <span style="padding: 0.5rem 1rem; color: var(--pico-muted-color); font-size: 0.875rem;">
                  + {totalGenres - 10} more
                </span>
              )}
            </div>

            <p style="margin: 0; font-size: 0.875rem; color: var(--pico-muted-color);">
              💡 Auto-discovery will create playlists for genres with 5+ artists. You can configure this in the settings later.
            </p>
          </div>
        ) : (
          <div style="background: var(--pico-background-color); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem 0; border-left: 3px solid var(--pico-primary);">
            <p style="margin: 0;">
              <strong>ℹ️ Note:</strong> Genre playlists require genre metadata from your library.
              {' '}{totalArtists > 0
                ? `You have ${totalArtists} artists cached. Genre playlists will be available once the cache is warmed.`
                : 'Go back to the previous step to add API keys and warm the cache for genre-based playlists.'}
            </p>
          </div>
        )}

        {/* Estimated Stats */}
        <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem; margin: 2rem 0;">
          <h4 style="margin: 0 0 0.5rem 0;">📊 What to Expect</h4>
          <ul style="margin: 0; font-size: 0.875rem;">
            <li><strong>~50 tracks</strong> per playlist (configurable)</li>
            <li><strong>Smart selection:</strong> Recent plays favored with exponential decay</li>
            <li><strong>Genre diversity:</strong> Max 40% of tracks from any single genre</li>
            <li><strong>Artist variety:</strong> Max 2 tracks per artist</li>
            <li><strong>Sonic expansion:</strong> Similar tracks added when needed</li>
          </ul>
        </div>

        {/* What Happens Next */}
        <div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem 0; border-left: 4px solid var(--pico-primary);">
          <h4 style="margin-top: 0;">⏭️ Next Steps</h4>
          <p style="margin-bottom: 0.5rem;">After completing setup:</p>
          <ol style="margin: 0.5rem 0;">
            <li>Playlists will appear in your <strong>Plex app</strong> under "Playlists"</li>
            <li>First generation happens at the next scheduled time (or generate manually)</li>
            <li>Check the <a href="/playlists">Playlists page</a> to see generated playlists</li>
            <li>Customize settings anytime from the <a href="/config">Configuration page</a></li>
          </ol>
        </div>

        <p style="margin-top: 2rem; text-align: center; color: var(--pico-muted-color); font-size: 0.875rem;">
          💡 <strong>Tip:</strong> You can generate playlists immediately from the <a href="/actions">Actions page</a> after setup
        </p>
      </div>

      <div class="button-group">
        <form method="POST" action="/setup/library-analysis/back">
          <button type="submit" class="secondary">← Back</button>
        </form>
        <form method="POST" action="/setup/complete">
          <button type="submit">Complete Setup →</button>
        </form>
      </div>
    </SetupLayout>
  );
}
