/**
 * Main layout component
 * Type-safe HTML using @kitajs/html JSX
 */

import Html from '@kitajs/html';
import { NavSidebar } from './components/nav-sidebar.tsx';

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

          {/* Custom desktop-first styles */}
          <link rel="stylesheet" href="/css/styles.css" />

          {/* HTMX for interactivity */}
          <script src="https://unpkg.com/htmx.org@2.0.0"></script>

          {/* Chart.js for analytics (loaded globally for HTMX compatibility) */}
          <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

          <style>{`
            /* Page-specific overrides only - all global styles moved to /css/styles.css */
          `}</style>
        </head>
        <body>
          {/* Toast container */}
          <div id="toast-container"></div>

          {/* Global loading indicator for HTMX requests */}
          <div id="global-loading-indicator" class="htmx-indicator" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999; background: var(--pico-card-background-color); padding: 2rem 3rem; border-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3); text-align: center;">
            <div class="loading" style="margin: 0 auto 1rem auto;"></div>
            <p style="margin: 0; color: var(--pico-muted-color);">Loading...</p>
          </div>

          {/* Sidebar navigation */}
          <NavSidebar page={page || 'dashboard'} setupComplete={setupComplete} />

          {/* Main content wrapper */}
          <div id="main-wrapper">
            <main id="main" class="container">
              {children}
            </main>

            <footer class="container mt-5 py-3 border-top text-muted">
              <p class="m-0">
                <small>
                  Plex Playlist Enhancer •{' '}
                  <a href="https://github.com/aceofaces/plex-playlists">GitHub</a>
                </small>
              </p>
            </footer>
          </div>

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
