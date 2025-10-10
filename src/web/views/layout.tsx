/**
 * Main layout component
 * Type-safe HTML using @kitajs/html JSX
 */

import Html from '@kitajs/html';

export interface LayoutProps {
  title?: string;
  page?: string;
  setupComplete?: boolean;
  children: JSX.Element | JSX.Element[];
}

export function Layout({ title, page, setupComplete, children }: LayoutProps): JSX.Element {
  return (
    <>
      {'<!DOCTYPE html>'}
      <html lang="en" data-theme="dark">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{title ? `${title} - ` : ''}Plex Playlist Enhancer</title>

          {/* PicoCSS - Classless dark theme */}
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
          />

          {/* HTMX for interactivity */}
          <script src="https://unpkg.com/htmx.org@2.0.0"></script>

          <style>{`
            /* *arr-Style High Density Design - Optimized for 1080p homelab displays */
            :root {
              --spacing-compact: 0.25rem;   /* 4px - aggressive */
              --spacing-normal: 0.5rem;     /* 8px */
              --spacing-section: 0.75rem;   /* 12px */
              --spacing-large: 1rem;        /* 16px */
            }

            /* Override PicoCSS defaults for maximum density */
            * {
              --pico-spacing: 0.5rem;
              --pico-typography-spacing-vertical: 0.75rem;
            }

            /* Custom styles */
            .status-badge {
              display: inline-block;
              padding: 0.125rem 0.375rem;
              border-radius: 0.25rem;
              font-size: 0.75rem;
              font-weight: 500;
              line-height: 1.4;
            }
            .status-success {
              background-color: var(--pico-ins-color);
              color: var(--pico-background-color);
            }
            .status-failed {
              background-color: var(--pico-del-color);
              color: var(--pico-background-color);
            }
            .status-running {
              background-color: var(--pico-primary);
              color: var(--pico-primary-inverse);
            }
            .playlist-emoji {
              font-size: 1.25rem;
              margin-right: 0.25rem;
            }

            /* High-density stat cards */
            .stat-card {
              background: var(--pico-card-background-color);
              padding: 0.5rem;
              border-radius: 0.25rem;
              margin-bottom: 0.5rem;
            }
            .stat-card h3 {
              margin: 0 0 0.125rem 0;
              font-size: 1.25rem;
              line-height: 1.2;
              font-weight: 600;
            }
            .stat-card p {
              margin: 0;
              color: var(--pico-muted-color);
              font-size: 0.75rem;
              line-height: 1.3;
            }
            .stat-card small {
              font-size: 0.7rem;
              line-height: 1.2;
            }

            /* Compact header */
            header {
              padding: 0.5rem 0;
              border-bottom: 1px solid var(--pico-muted-border-color);
              margin-bottom: 0.75rem;
            }
            header h1 {
              margin: 0;
              font-size: 1.25rem;
              line-height: 1.3;
              font-weight: 600;
            }

            /* Compact navigation */
            nav.main-nav {
              margin-top: 0.5rem;
            }
            nav.main-nav ul {
              display: flex;
              gap: 0.5rem;
              list-style: none;
              padding: 0;
              margin: 0;
            }
            nav.main-nav a {
              font-size: 0.8125rem;
              text-decoration: none;
              padding: 0.25rem 0.5rem;
            }
            nav.main-nav a:hover {
              background: var(--pico-card-background-color);
              border-radius: 0.25rem;
            }
            nav.main-nav a.active {
              font-weight: 600;
              background: var(--pico-card-background-color);
              border-radius: 0.25rem;
            }

            /* Compact sections */
            section {
              margin-top: 1rem !important;
              margin-bottom: 1rem !important;
            }

            /* Compact articles/cards */
            article {
              margin-bottom: 0.75rem !important;
              padding: 0.75rem;
            }

            /* High-density tables */
            table {
              margin-top: 0.5rem;
              margin-bottom: 0.5rem;
              font-size: 0.875rem;
            }
            table th,
            table td {
              padding: 0.375rem 0.5rem;
              line-height: 1.4;
            }
            table th {
              font-size: 0.8125rem;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.025em;
            }

            /* Compact forms */
            form label {
              margin-bottom: 0.5rem;
              font-size: 0.875rem;
            }
            input, select, textarea {
              margin-bottom: 0.5rem;
              padding: 0.375rem 0.5rem;
              font-size: 0.875rem;
            }

            /* Compact headings */
            h2 {
              margin: 0 0 0.5rem 0;
              line-height: 1.3;
              font-size: 1.5rem;
              font-weight: 600;
            }
            h3 {
              margin: 0 0 0.375rem 0;
              font-size: 1.125rem;
              line-height: 1.3;
              font-weight: 600;
            }
            h4 {
              margin: 0 0 0.25rem 0;
              font-size: 0.9375rem;
              line-height: 1.3;
              font-weight: 600;
            }

            /* Compact buttons */
            button, [role="button"] {
              padding: 0.375rem 0.75rem;
              font-size: 0.8125rem;
              margin: 0.25rem 0;
            }
            button.action-btn, .action-btn {
              padding: 0.25rem 0.5rem;
              font-size: 0.75rem;
            }

            /* Compact paragraphs */
            p {
              margin-bottom: 0.5rem;
              line-height: 1.5;
            }
            p:last-child {
              margin-bottom: 0;
            }

            /* Collapsible sections for dense settings pages */
            details {
              margin-bottom: 0.75rem;
              border: 1px solid var(--pico-muted-border-color);
              border-radius: 0.25rem;
              padding: 0;
            }
            details summary {
              padding: 0.5rem 0.75rem;
              cursor: pointer;
              font-weight: 600;
              font-size: 0.9375rem;
              user-select: none;
              background: var(--pico-card-background-color);
              border-radius: 0.25rem;
            }
            details summary:hover {
              background: var(--pico-background-color);
            }
            details[open] summary {
              border-bottom: 1px solid var(--pico-muted-border-color);
              border-radius: 0.25rem 0.25rem 0 0;
              margin-bottom: 0.5rem;
            }
            details > *:not(summary) {
              padding: 0 0.75rem 0.75rem 0.75rem;
            }

            /* Grid utilities for dense layouts */
            .grid-dense {
              display: grid;
              gap: 0.5rem;
            }
            .grid-2 { grid-template-columns: repeat(2, 1fr); }
            .grid-3 { grid-template-columns: repeat(3, 1fr); }
            .grid-4 { grid-template-columns: repeat(4, 1fr); }
            .grid-auto { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }

            /* Toast notifications */
            #toast-container {
              position: fixed;
              top: 1rem;
              right: 1rem;
              z-index: 9999;
              display: flex;
              flex-direction: column;
              gap: 0.5rem;
              max-width: 400px;
            }
            .toast {
              padding: 1rem;
              border-radius: 0.5rem;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
              opacity: 0;
              transform: translateX(100%);
              transition: all 0.3s ease-in-out;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            }
            .toast.show {
              opacity: 1;
              transform: translateX(0);
            }
            .toast-success {
              background: var(--pico-ins-color);
              color: var(--pico-background-color);
            }
            .toast-error {
              background: var(--pico-del-color);
              color: var(--pico-background-color);
            }
            .toast-info {
              background: var(--pico-primary);
              color: var(--pico-primary-inverse);
            }
            .toast-warning {
              background: #ff9800;
              color: var(--pico-background-color);
            }

            /* Responsive tables - horizontal scroll on mobile */
            table {
              display: block;
              overflow-x: auto;
              white-space: nowrap;
            }
            @media (min-width: 768px) {
              table {
                display: table;
                overflow-x: visible;
                white-space: normal;
              }
            }

            /* Mobile navigation - hamburger for smaller screens */
            @media (max-width: 767px) {
              nav.main-nav ul {
                flex-wrap: wrap;
              }
              nav.main-nav a {
                font-size: 0.8rem;
              }
              .stat-card {
                min-width: 150px;
              }
            }
          `}</style>
        </head>
        <body>
          {/* Toast container */}
          <div id="toast-container"></div>

          <header class="container">
            <h1>🎵 Plex Playlist Enhancer</h1>
            <nav class="main-nav">
              <ul>
                <li>
                  <a href="/" class={page === 'dashboard' ? 'active' : ''}>
                    Dashboard
                  </a>
                </li>
                <li>
                  <a href="/playlists" class={page === 'playlists' ? 'active' : ''}>
                    Playlists
                  </a>
                </li>
                <li>
                  <a href="/actions" class={page === 'actions' ? 'active' : ''}>
                    Actions
                  </a>
                </li>
                <li>
                  <a href="/config" class={page === 'config' ? 'active' : ''}>
                    Configuration
                  </a>
                </li>
                {!setupComplete && (
                  <li>
                    <a
                      href="/setup"
                      class={page === 'setup' ? 'active' : ''}
                      style="color: var(--pico-primary);"
                    >
                      ⚙️ Setup
                    </a>
                  </li>
                )}
                <li>
                  <a
                    href="https://github.com/aceofaces/plex-playlists#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Documentation & Help"
                  >
                    📖 Help
                  </a>
                </li>
              </ul>
            </nav>
          </header>

          <main class="container">{children}</main>

          <footer
            class="container"
            style="margin-top: var(--spacing-large); padding: var(--spacing-section) 0; border-top: 1px solid var(--pico-muted-border-color); color: var(--pico-muted-color);"
          >
            <p style="margin: 0;">
              <small>
                Plex Playlist Enhancer v0.1.0 •{' '}
                <a href="https://github.com/aceofaces/plex-playlists">GitHub</a>
              </small>
            </p>
          </footer>

          <script>{`
            // Toast notification system
            function showToast(message, type = 'info', duration = null) {
              // Default durations by type (errors/warnings stay longer)
              if (duration === null) {
                duration = (type === 'error' || type === 'warning') ? 10000 : 5000;
              }

              const container = document.getElementById('toast-container');
              const toast = document.createElement('div');
              toast.className = \`toast toast-\${type}\`;

              // Add icon based on type
              const icons = {
                success: '✓',
                error: '✗',
                warning: '⚠',
                info: 'ℹ'
              };

              toast.innerHTML = \`<strong>\${icons[type] || icons.info}</strong> <span>\${message}</span>\`;
              container.appendChild(toast);

              // Trigger animation
              setTimeout(() => toast.classList.add('show'), 10);

              // Auto-remove
              setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
              }, duration);

              return toast;
            }

            // HTMX integration for automatic toast notifications
            document.body.addEventListener('htmx:afterRequest', function(event) {
              const xhr = event.detail.xhr;

              // Check for toast message header
              const toastMessage = xhr.getResponseHeader('X-Toast-Message');
              const toastType = xhr.getResponseHeader('X-Toast-Type') || 'info';

              if (toastMessage) {
                showToast(toastMessage, toastType);
              }

              // Handle errors
              if (!event.detail.successful && !toastMessage) {
                const status = xhr.status;
                if (status === 400) {
                  showToast('Invalid request. Please check your input.', 'error');
                } else if (status === 500) {
                  showToast('Server error. Please try again.', 'error');
                } else if (status >= 400) {
                  showToast('Request failed. Please try again.', 'error');
                }
              }
            });

            // Expose globally for use in inline scripts
            window.showToast = showToast;
          `}</script>
        </body>
      </html>
    </>
  );
}
