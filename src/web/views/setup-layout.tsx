/**
 * Setup wizard layout component
 * Type-safe HTML using @kitajs/html JSX
 */

import Html from '@kitajs/html';

interface SetupStep {
  id: string;
  title: string;
  path: string;
}

export interface SetupLayoutProps {
  title: string;
  steps: readonly SetupStep[];
  currentStepIndex: number;
  children: JSX.Element | JSX.Element[];
}

export function SetupLayout({ title, steps, currentStepIndex, children }: SetupLayoutProps): JSX.Element {
  return (
    <>
      {'<!DOCTYPE html>'}
      <html lang="en" data-theme="dark">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{title} - Setup Wizard - Plex Playlist Enhancer</title>

          {/* PicoCSS - Classless dark theme */}
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
          />

          {/* HTMX for interactivity */}
          <script src="https://unpkg.com/htmx.org@2.0.0"></script>

          <style>{`
            /* Setup wizard styles */
            body {
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            }

            .setup-container {
              max-width: 800px;
              margin: 2rem auto;
              padding: 0 1rem;
            }

            .setup-header {
              text-align: center;
              margin-bottom: 2rem;
            }

            .setup-header h1 {
              margin: 0;
              font-size: 1.75rem;
              font-weight: 600;
              color: var(--pico-contrast);
            }

            /* Step indicator */
            .step-indicator {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin: 2rem 0;
              padding: 0;
              list-style: none;
              counter-reset: step;
            }

            .step-indicator li {
              flex: 1;
              position: relative;
              text-align: center;
              font-size: 0.75rem;
              color: var(--pico-muted-color);
            }

            .step-indicator li::before {
              content: counter(step);
              counter-increment: step;
              display: block;
              width: 2rem;
              height: 2rem;
              line-height: 2rem;
              margin: 0 auto 0.5rem;
              background: var(--pico-card-background-color);
              border: 2px solid var(--pico-muted-border-color);
              border-radius: 50%;
              font-weight: 600;
              font-size: 0.875rem;
            }

            .step-indicator li.completed::before {
              background: var(--pico-ins-color);
              border-color: var(--pico-ins-color);
              color: var(--pico-background-color);
              content: '✓';
            }

            .step-indicator li.active::before {
              background: var(--pico-primary);
              border-color: var(--pico-primary);
              color: var(--pico-primary-inverse);
            }

            .step-indicator li.active {
              color: var(--pico-contrast);
              font-weight: 600;
            }

            .step-indicator li:not(:last-child)::after {
              content: '';
              position: absolute;
              top: 1rem;
              left: calc(50% + 1rem);
              right: calc(-50% + 1rem);
              height: 2px;
              background: var(--pico-muted-border-color);
              z-index: -1;
            }

            .step-indicator li.completed:not(:last-child)::after {
              background: var(--pico-ins-color);
            }

            /* Setup content area */
            .step-content {
              background: var(--pico-card-background-color);
              border-radius: 0.5rem;
              padding: 2rem;
              margin-bottom: 1rem;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            }

            .step-content h2 {
              margin: 0 0 1rem 0;
              font-size: 1.5rem;
              font-weight: 600;
            }

            .step-content h3 {
              margin: 1.5rem 0 0.75rem 0;
              font-size: 1.125rem;
              font-weight: 600;
            }

            .step-content h4 {
              margin: 1rem 0 0.5rem 0;
              font-size: 1rem;
              font-weight: 600;
            }

            /* Button group for navigation */
            .button-group {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 2rem;
              gap: 1rem;
            }

            .button-group form {
              margin: 0;
            }

            .button-group button,
            .button-group [role="button"] {
              margin: 0;
            }

            /* Status badges */
            .status-success {
              background: var(--pico-ins-color);
              padding: 1rem;
              border-radius: 0.25rem;
              color: var(--pico-background-color);
              margin: 1rem 0;
            }

            .status-warning {
              background: #ff9800;
              padding: 1rem;
              border-radius: 0.25rem;
              color: var(--pico-background-color);
              margin: 1rem 0;
            }

            .status-info {
              background: var(--pico-primary);
              padding: 1rem;
              border-radius: 0.25rem;
              color: var(--pico-primary-inverse);
              margin: 1rem 0;
            }

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

            /* Responsive */
            @media (max-width: 767px) {
              .step-indicator {
                font-size: 0.625rem;
              }

              .step-indicator li::before {
                width: 1.5rem;
                height: 1.5rem;
                line-height: 1.5rem;
                font-size: 0.75rem;
              }

              .step-content {
                padding: 1rem;
              }

              .button-group {
                flex-direction: column;
                width: 100%;
              }

              .button-group button,
              .button-group [role="button"] {
                width: 100%;
              }
            }
          `}</style>
        </head>
        <body>
          {/* Toast container */}
          <div id="toast-container"></div>

          <div class="setup-container">
            {/* Header */}
            <div class="setup-header">
              <h1>🎵 Plex Playlist Enhancer</h1>
              <p style="color: var(--pico-muted-color); margin: 0.5rem 0 0 0;">Setup Wizard</p>
            </div>

            {/* Step Indicator */}
            <ol class="step-indicator">
              {steps.map((step, idx) => (
                <li class={idx < currentStepIndex ? 'completed' : idx === currentStepIndex ? 'active' : ''}>
                  {step.title}
                </li>
              ))}
            </ol>

            {/* Content */}
            {children}

            {/* Footer */}
            <footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color); text-align: center; color: var(--pico-muted-color);">
              <p style="margin: 0;">
                <small>
                  Need help? Check the{' '}
                  <a href="https://github.com/aceofaces/plex-playlists#readme" target="_blank">
                    documentation
                  </a>
                </small>
              </p>
            </footer>
          </div>

          <script>{`
            // Toast notification system
            function showToast(message, type = 'info', duration = null) {
              if (duration === null) {
                duration = (type === 'error' || type === 'warning') ? 10000 : 5000;
              }

              const container = document.getElementById('toast-container');
              const toast = document.createElement('div');
              toast.className = \`toast toast-\${type}\`;

              const icons = {
                success: '✓',
                error: '✗',
                warning: '⚠',
                info: 'ℹ'
              };

              toast.innerHTML = \`<strong>\${icons[type] || icons.info}</strong> <span>\${message}</span>\`;
              container.appendChild(toast);

              setTimeout(() => toast.classList.add('show'), 10);

              setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
              }, duration);

              return toast;
            }

            // HTMX integration
            document.body.addEventListener('htmx:afterRequest', function(event) {
              const xhr = event.detail.xhr;
              const toastMessage = xhr.getResponseHeader('X-Toast-Message');
              const toastType = xhr.getResponseHeader('X-Toast-Type') || 'info';

              if (toastMessage) {
                showToast(toastMessage, toastType);
              }

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

            window.showToast = showToast;
          `}</script>
        </body>
      </html>
    </>
  );
}
