/**
 * Client-side JavaScript for actions page
 * Handles SSE job monitoring, form submissions, and real-time updates
 */

// Job event sources for SSE connections
const jobEventSources = new Map();

/**
 * Initialize job monitoring on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  // Monitor active jobs if any exist
  if (window.activeJobIds && Array.isArray(window.activeJobIds)) {
    window.activeJobIds.forEach(jobId => {
      monitorJob(jobId);
    });
  }

  // Set up playlist generation form handlers
  setupPlaylistFormHandlers();
});

/**
 * Monitor a job via Server-Sent Events
 */
function monitorJob(jobId) {
  const eventSource = new EventSource('/actions/jobs/' + jobId + '/stream');
  jobEventSources.set(jobId, eventSource);

  eventSource.onmessage = (event) => {
    const job = JSON.parse(event.data);
    updateJobDisplay(jobId, job);

    // If job is complete, reload page after a delay
    if (job.status !== 'running') {
      setTimeout(() => {
        eventSource.close();
        jobEventSources.delete(jobId);

        // Reload if all jobs are complete
        if (jobEventSources.size === 0) {
          window.location.reload();
        }
      }, 2000);
    }
  };

  eventSource.onerror = () => {
    console.error('SSE connection error for job', jobId);
    eventSource.close();
    jobEventSources.delete(jobId);
  };
}

/**
 * Update job display in real-time
 */
function updateJobDisplay(jobId, job) {
  const jobElement = document.getElementById('job-' + jobId);
  if (!jobElement) return;

  const statusBadge = jobElement.querySelector('.status-badge');
  if (statusBadge) {
    statusBadge.className = 'status-badge status-' + job.status;
    statusBadge.textContent = job.status;
  }

  // Add progress indicator if available
  if (job.progress !== undefined) {
    let progressBar = jobElement.querySelector('.progress-bar');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.style.cssText = 'background: var(--pico-muted-border-color); height: 4px; border-radius: 2px; margin-top: 0.5rem; overflow: hidden;';
      progressBar.innerHTML = '<div class="progress-fill" style="background: var(--pico-primary); height: 100%; transition: width 0.3s;"></div>';
      jobElement.appendChild(progressBar);
    }

    const progressFill = progressBar.querySelector('.progress-fill');
    if (progressFill) {
      progressFill.style.width = job.progress + '%';
    }
  }
}

/**
 * Set up playlist generation form handlers
 */
function setupPlaylistFormHandlers() {
  document.querySelectorAll('form[action^="/actions/generate/"]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button');
      const originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '⏳ Generating...';

      try {
        const response = await fetch(form.action, { method: 'POST' });
        if (response.ok) {
          const data = await response.json();
          button.innerHTML = '✓ Started';
          showToast('Playlist generation started', 'success');

          // Start monitoring the new job via SSE
          if (data.jobId) {
            setTimeout(() => window.location.reload(), 1000);
          }
        } else {
          throw new Error('Failed');
        }
      } catch (err) {
        button.innerHTML = '✗ Failed';
        button.disabled = false;
        showToast('Failed to start playlist generation', 'error');
        setTimeout(() => { button.innerHTML = originalText; }, 2000);
      }
    });
  });
}

/**
 * Cache warming function with progress tracking
 * Uses shared job-monitor module
 */
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

/**
 * Album cache warming function with progress tracking
 * Uses shared job-monitor module
 */
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

/**
 * Clean up event sources on page unload
 */
window.addEventListener('beforeunload', () => {
  jobEventSources.forEach(es => es.close());
});

// Expose functions globally for inline onclick handlers
window.warmCache = warmCache;
window.warmAlbumCache = warmAlbumCache;
