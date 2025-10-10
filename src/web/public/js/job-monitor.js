/**
 * Shared SSE Job Monitoring Module
 * Provides reusable functions for monitoring long-running jobs with progress tracking
 */

/**
 * Monitor a job via Server-Sent Events with progress updates
 * @param {number} jobId - The job ID to monitor
 * @param {Object} elements - DOM elements for UI updates
 * @param {HTMLElement} elements.button - The trigger button
 * @param {HTMLElement} elements.progressContainer - Container for progress UI
 * @param {HTMLProgressElement} elements.progressBar - Progress bar element
 * @param {HTMLElement} elements.progressPercent - Element for percentage display
 * @param {HTMLElement} elements.progressMessage - Element for status message
 * @param {HTMLElement} elements.progressEta - Element for ETA display
 * @param {Function} [onComplete] - Optional callback when job completes successfully
 * @param {Function} [onError] - Optional callback when job fails
 */
function monitorJob(jobId, elements, onComplete, onError) {
  const {
    button,
    progressContainer,
    progressBar,
    progressPercent,
    progressMessage,
    progressEta
  } = elements;

  const originalButtonText = button.innerHTML;

  // Show progress container
  if (progressContainer) {
    progressContainer.style.display = 'block';
  }

  // Connect to SSE endpoint
  const eventSource = new EventSource(`/actions/jobs/${jobId}/stream`);

  // Handle messages (progress updates and status changes)
  eventSource.onmessage = (event) => {
    const job = JSON.parse(event.data);

    // Update progress if available
    if (job.progress) {
      if (progressBar) {
        progressBar.value = job.progress.percent || 0;
      }
      if (progressPercent) {
        progressPercent.textContent = Math.round(job.progress.percent || 0) + '%';
      }

      // Build progress message with source breakdown if available
      if (progressMessage) {
        let message = job.progress.message || 'Processing...';

        if (job.progress.sourceCounts) {
          const counts = job.progress.sourceCounts;
          const parts = [];

          if (counts.cached > 0) parts.push(`✓ ${counts.cached} cached`);
          if (counts.spotify > 0) parts.push(`🎧 ${counts.spotify} Spotify`);
          if (counts.lastfm > 0) parts.push(`🎵 ${counts.lastfm} Last.fm`);
          if (counts.plex > 0) parts.push(`📀 ${counts.plex} Plex`);
          if (counts.manual > 0) parts.push(`📝 ${counts.manual} manual`);

          if (parts.length > 0) {
            message += ' • ' + parts.join('  ');
          }
        }

        progressMessage.textContent = message;
      }

      if (progressEta) {
        progressEta.textContent = job.progress.eta || 'calculating...';
      }
    }

    // Handle completion
    if (job.status !== 'running') {
      eventSource.close();

      if (job.status === 'success') {
        if (progressMessage) progressMessage.textContent = '✓ Complete!';
        if (progressEta) progressEta.textContent = 'Done';

        // Call completion callback or default to reload
        if (onComplete) {
          onComplete(job);
        } else {
          setTimeout(() => window.location.reload(), 2000);
        }
      } else if (job.status === 'failed') {
        const errorMsg = job.error || 'Unknown error';
        if (progressMessage) progressMessage.textContent = '✗ Failed: ' + errorMsg;
        if (progressEta) progressEta.textContent = '';
        if (button) {
          button.disabled = false;
          button.innerHTML = originalButtonText;
        }

        // Call error callback if provided
        if (onError) {
          onError(job);
        }
      }
    }
  };

  // Handle connection errors
  eventSource.onerror = () => {
    console.error('SSE connection error for job', jobId);
    eventSource.close();

    if (progressMessage) progressMessage.textContent = '✗ Connection lost';
    if (button) {
      button.disabled = false;
      button.innerHTML = originalButtonText;
    }

    // Call error callback if provided
    if (onError) {
      onError({ error: 'Connection lost' });
    }
  };

  return eventSource;
}

/**
 * Start a cache warming job with progress tracking
 * @param {string} type - 'artist' or 'album'
 * @param {Object} elements - DOM elements (same as monitorJob)
 * @param {Function} [onComplete] - Optional completion callback
 * @param {Function} [onError] - Optional error callback
 */
async function startCacheWarming(type, elements, onComplete, onError) {
  const { button, progressContainer, progressBar, progressPercent, progressMessage, progressEta } = elements;
  const originalButtonText = button.innerHTML;

  // Immediately show progress UI for better feedback
  if (progressContainer) {
    progressContainer.style.display = 'block';
  }
  if (progressBar) {
    progressBar.value = 0;
  }
  if (progressPercent) {
    progressPercent.textContent = '0%';
  }
  if (progressMessage) {
    progressMessage.textContent = 'Starting cache warming...';
  }
  if (progressEta) {
    progressEta.textContent = 'Connecting to server...';
  }

  button.disabled = true;
  button.innerHTML = '⏳ Starting...';

  try {
    const endpoint = type === 'artist' ? '/actions/cache/warm' : '/actions/cache/warm-albums';
    const response = await fetch(endpoint, { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      button.innerHTML = '🔄 Warming...';
      if (progressMessage) {
        progressMessage.textContent = 'Connecting to job stream...';
      }
      return monitorJob(data.jobId, elements, onComplete, onError);
    } else {
      throw new Error(data.error || 'Failed to start cache warming');
    }
  } catch (err) {
    button.innerHTML = '✗ Failed';
    button.disabled = false;
    if (progressContainer) progressContainer.style.display = 'none';

    setTimeout(() => {
      button.innerHTML = originalButtonText;
    }, 3000);

    if (onError) {
      onError({ error: err.message });
    }

    throw err;
  }
}

// Export for use in other modules
window.jobMonitor = { monitorJob, startCacheWarming };
