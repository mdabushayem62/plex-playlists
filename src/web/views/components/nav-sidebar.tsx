/**
 * Sidebar navigation component with HTMX support
 * Type-safe HTML using @kitajs/html JSX
 */

import Html from '@kitajs/html';

export interface NavSidebarProps {
  page: string;
  setupComplete?: boolean;
  oob?: boolean; // Out-of-band swap for HTMX updates
}

/**
 * Render the sidebar navigation content (links and structure)
 * Extracted for reuse in both full page and OOB swap modes
 */
function renderSidebarContent(page: string, setupComplete?: boolean): JSX.Element {
  return (
    <>
      {/* App Title */}
      <div style="padding: 0 1rem 1rem 1rem; border-bottom: 1px solid var(--pico-muted-border-color);">
        <h1 style="margin: 0; font-size: 1.125rem; line-height: 1.3;">🎵 Plex Playlist</h1>
        <p style="margin: 0; font-size: 0.75rem; color: var(--pico-muted-color);">Enhancer</p>
      </div>

      <nav style="margin-top: 0.75rem;">
        <ul style="list-style: none; padding: 0; margin: 0;">
          {/* Dashboard */}
          <li>
            <a
              href="/"
              hx-get="/"
              aria-current={page === 'dashboard' ? 'page' : undefined}
              style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease; ${page === 'dashboard' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
            >
              📊 Dashboard
            </a>
          </li>

          {/* Playlists */}
          <li>
            <a
              href="/playlists"
              hx-get="/playlists"
              aria-current={page === 'playlists' ? 'page' : undefined}
              style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease; ${page === 'playlists' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
            >
              🎵 Playlists
            </a>
          </li>

          {/* Nerd Lines (Analytics) */}
          <li>
            <a
              href="/analytics"
              hx-get="/analytics"
              hx-indicator="#global-loading-indicator"
              aria-current={page === 'analytics' ? 'page' : undefined}
              style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease; ${page === 'analytics' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
            >
              📈 Nerd Lines
            </a>
          </li>

          {/* Job History */}
          <li>
            <a
              href="/actions/history"
              hx-get="/actions/history"
              aria-current={page === 'history' ? 'page' : undefined}
              style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease; ${page === 'history' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
            >
              📜 Job History
            </a>
          </li>

          {/* Configuration */}
          <li style="margin-top: 0.75rem;">
            <a
              href="/config?tab=general"
              hx-get="/config?tab=general"
              aria-current={page === 'config' ? 'page' : undefined}
              style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease; ${page === 'config' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
            >
              ⚙️ Config
            </a>
          </li>
          <li>
            <a
              href="/config/adaptive"
              hx-get="/config/adaptive"
              aria-current={page === 'config-adaptive' ? 'page' : undefined}
              style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease; ${page === 'config-adaptive' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
            >
              🧠 Adaptive
            </a>
          </li>

          {/* Setup (conditional) */}
          {!setupComplete && (
            <li style="margin-top: 0.75rem;">
              <a
                href="/setup"
                hx-get="/setup"
                aria-current={page === 'setup' ? 'page' : undefined}
                style={`display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-primary); transition: all 0.2s ease; ${page === 'setup' ? 'background: var(--pico-card-background-color); border-left: 3px solid var(--pico-primary); font-weight: 600;' : ''}`}
              >
                ⚙️ Setup
              </a>
            </li>
          )}

          {/* Help */}
          <li style="margin-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color); padding-top: 0.75rem;">
            <a
              href="https://github.com/aceofaces/plex-playlists#readme"
              target="_blank"
              rel="noopener noreferrer"
              style="display: block; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.875rem; color: var(--pico-color); transition: all 0.2s ease;"
              title="Documentation & Help"
            >
              📖 Help
            </a>
          </li>
        </ul>
      </nav>

      {/* Hover effect CSS */}
      <style>{`
        #sidebar nav a:hover {
          background: var(--pico-card-background-color);
        }
      `}</style>
    </>
  );
}

export function NavSidebar({ page, setupComplete, oob = false }: NavSidebarProps): JSX.Element {
  // For OOB swaps, only return the <aside> element with hx-swap-oob
  // The checkbox, hamburger, and backdrop are static and don't need updating
  if (oob) {
    return (
      <aside
        id="sidebar"
        hx-swap-oob="true"
        hx-target="#main"
        hx-push-url="true"
        style="width: 220px; position: fixed; top: 0; left: 0; height: 100vh; overflow-y: auto; border-right: 1px solid var(--pico-muted-border-color); padding: 1rem 0; background: var(--pico-background-color);"
      >
        {renderSidebarContent(page, setupComplete)}
      </aside>
    );
  }

  // For full page renders, return complete sidebar with mobile controls
  return (
    <>
      {/* CSS Checkbox Hack for Mobile Hamburger Menu - Progressive Enhancement */}
      {/* Checkbox must come first in DOM for CSS sibling selectors (~) to work */}
      <input type="checkbox" id="nav-toggle" class="nav-toggle" style="display: none;" />

      {/* Hamburger icon - visible only on mobile (<768px) */}
      <label
        for="nav-toggle"
        class="hamburger-icon"
        aria-label="Toggle navigation menu"
        style="display: none; position: fixed; top: 1rem; left: 1rem; font-size: 2rem; cursor: pointer; z-index: 1001; width: 44px; height: 44px; line-height: 44px; text-align: center; background: var(--pico-card-background-color); border-radius: 0.25rem; user-select: none;"
      >
        ☰
      </label>

      {/* Sidebar navigation */}
      <aside
        id="sidebar"
        hx-target="#main"
        hx-push-url="true"
        style="width: 220px; position: fixed; top: 0; left: 0; height: 100vh; overflow-y: auto; border-right: 1px solid var(--pico-muted-border-color); padding: 1rem 0; background: var(--pico-background-color);"
      >
        {renderSidebarContent(page, setupComplete)}
      </aside>

      {/* Backdrop overlay - appears on mobile when sidebar is open */}
      {/* Clicking backdrop closes sidebar (unchecks checkbox via label) */}
      <label for="nav-toggle" class="sidebar-backdrop" aria-label="Close navigation menu"></label>
    </>
  );
}
