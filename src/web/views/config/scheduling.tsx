/**
 * Scheduling Configuration Page - TSX version
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface Schedule {
  cron: string;
  description: string;
  default: string;
}

interface Breadcrumb {
  label: string;
  url: string | null;
}

export interface SchedulingPageProps {
  schedules: Record<string, Schedule>;
  page: string;
  setupComplete: boolean;
  breadcrumbs?: Breadcrumb[];
}

export function SchedulingPage(props: SchedulingPageProps): JSX.Element {
  const { schedules, page, setupComplete, breadcrumbs } = props;

  return (
    <Layout title="Scheduling" page={page} setupComplete={setupComplete}>
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

        <h2>Scheduling Configuration</h2>
        <p style="color: var(--pico-muted-color);">
          Cron schedules for automatic playlist generation. All times are in server local time.
        </p>
        <div style="background: var(--pico-background-color); padding: 0.75rem; border-radius: 0.25rem; margin-bottom: 1rem; border-left: 3px solid var(--pico-primary);">
          <p style="margin: 0; font-size: 0.875rem;">
            ⚠️ <strong>Note:</strong> Schedule changes require an application restart to take effect. The scheduler is initialized at startup.
          </p>
        </div>

        {/* Editable Form */}
        <form id="schedulingForm" hx-post="/config/scheduling/save" hx-swap="innerHTML" hx-target="#save-response">
          <div style="display: grid; gap: 2rem; margin-top: 2rem;">
            {Object.entries(schedules).map(([name, schedule]) => (
              <article>
                <header>
                  <h3 style="margin: 0; text-transform: capitalize;">{name} Playlist</h3>
                </header>
                <p style="margin: 0.5rem 0;">
                  {schedule.description}
                </p>
                <label>
                  Cron Schedule
                  <input
                    type="text"
                    name={`${name}Cron`}
                    value={schedule.cron}
                    placeholder={schedule.default}
                    pattern="^(\*|[0-9]{1,2}|\*/[0-9]+)\s+(\*|[0-9]{1,2}|\*/[0-9]+)\s+(\*|[0-9]{1,2}|\*/[0-9]+)\s+(\*|[0-9]{1,2}|\*/[0-9]+)\s+(\*|[0-7]|\*/[0-9]+)$"
                    required
                  />
                  <small>Default: <code>{schedule.default}</code></small>
                </label>
              </article>
            ))}
          </div>

          <div style="margin-top: 2rem; display: flex; gap: 1rem;">
            <button type="submit">Save Changes</button>
            <button type="button" onclick="window.location.reload()" class="secondary">Reset</button>
          </div>
        </form>

        <div id="save-response" style="margin-top: 1rem;"></div>

        {/* Custom Playlists */}
        <section style="margin-top: 3rem; margin-bottom: 2rem;">
          <h3>Custom Playlists</h3>
          <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem;">
            <p style="margin: 0 0 0.5rem 0;">
              Custom genre/mood playlists are managed through the playlist builder.
            </p>
            <p style="margin: 0;">
              <a href="/playlists/builder">Create & manage custom playlists →</a>
            </p>
          </div>
        </section>

        {/* Cron Format Help */}
        <section style="margin-bottom: 2rem;">
          <h3>Cron Format</h3>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Values</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Minute</strong></td>
                <td>0-59</td>
                <td><code>0</code> = top of the hour</td>
              </tr>
              <tr>
                <td><strong>Hour</strong></td>
                <td>0-23</td>
                <td><code>6</code> = 6:00 AM</td>
              </tr>
              <tr>
                <td><strong>Day of Month</strong></td>
                <td>1-31</td>
                <td><code>*</code> = every day</td>
              </tr>
              <tr>
                <td><strong>Month</strong></td>
                <td>1-12</td>
                <td><code>*</code> = every month</td>
              </tr>
              <tr>
                <td><strong>Day of Week</strong></td>
                <td>0-7 (0/7=Sun)</td>
                <td><code>*</code> = every day</td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top: 1rem; color: var(--pico-muted-color); font-size: 0.875rem;">
            <strong>Examples:</strong>
            <ul style="margin-top: 0.5rem;">
              <li><code>0 6 * * *</code> - Every day at 6:00 AM</li>
              <li><code>0 */6 * * *</code> - Every 6 hours</li>
              <li><code>0 23 * * 0</code> - Every Sunday at 11:00 PM</li>
            </ul>
          </p>
        </section>
      </div>

      <script>{`
        // Handle save response
        document.body.addEventListener('htmx:afterSwap', function(event) {
          if (event.detail.target.id === 'save-response') {
            try {
              const response = JSON.parse(event.detail.xhr.responseText);
              if (response.success) {
                event.detail.target.innerHTML = '<p style="color: var(--pico-ins-color);">✓ Schedules saved successfully! <strong>Restart the application</strong> for changes to take effect.</p>';
                setTimeout(() => {
                  event.detail.target.innerHTML += '<p style="margin-top: 0.5rem; color: var(--pico-muted-color); font-size: 0.875rem;">Docker: <code>docker-compose restart</code> • Local: restart the process</p>';
                }, 1000);
              } else if (response.error) {
                event.detail.target.innerHTML = '<p style="color: var(--pico-del-color);">✗ ' + response.error + '</p>';
              }
            } catch (e) {
              event.detail.target.innerHTML = '<p style="color: var(--pico-del-color);">✗ Error saving schedules</p>';
            }
          }
        });
      `}</script>
    </Layout>
  );
}
