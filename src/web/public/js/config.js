/**
 * Configuration Page - Client-side functionality
 */

/**
 * Test Plex connection
 */
async function testPlexConnection() {
  const btn = document.getElementById('testPlexBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Testing...';

  try {
    const response = await fetch('/config/api/test-plex-connection');
    const data = await response.json();

    if (response.ok && data.success) {
      btn.innerHTML = '✓ Connected';
      btn.style.background = 'var(--pico-ins-color)';
      showToast(`Plex connection successful: ${data.serverName || 'Connected'}`, 'success');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = '';
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.error || 'Connection failed');
    }
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    btn.style.background = 'var(--pico-del-color)';
    showToast('Plex connection failed: ' + err.message, 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  }
}

/**
 * Test Last.fm connection
 */
async function testLastfm() {
  const btn = event.target;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳';

  try {
    const response = await fetch('/config/api/test-lastfm');
    const data = await response.json();

    if (response.ok && data.success) {
      btn.innerHTML = '✓';
      showToast('Last.fm connection successful', 'success');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.error || 'Test failed');
    }
  } catch (err) {
    btn.innerHTML = '✗';
    showToast('Last.fm test failed: ' + err.message, 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 3000);
  }
}

/**
 * Test Spotify connection
 */
async function testSpotify() {
  const btn = event.target;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳';

  try {
    const response = await fetch('/config/api/test-spotify');
    const data = await response.json();

    if (response.ok && data.success) {
      btn.innerHTML = '✓';
      showToast('Spotify connection successful', 'success');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.error || 'Test failed');
    }
  } catch (err) {
    btn.innerHTML = '✗';
    showToast('Spotify test failed: ' + err.message, 'error');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 3000);
  }
}

/**
 * Reset setup wizard (two-click confirmation)
 */
async function resetSetupWizard() {
  const btn = document.getElementById('resetSetupBtn');
  const originalText = btn.innerHTML;

  // First click: confirm
  if (btn.innerHTML === originalText) {
    btn.innerHTML = '⚠️ Confirm?';
    btn.style.background = 'var(--pico-del-color)';
    btn.setAttribute('data-confirming', 'true');

    setTimeout(() => {
      if (btn.getAttribute('data-confirming') === 'true') {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.removeAttribute('data-confirming');
      }
    }, 3000);
    return;
  }

  // Second click: execute
  if (btn.getAttribute('data-confirming') === 'true') {
    btn.disabled = true;
    btn.innerHTML = '⏳ Resetting...';
    btn.style.background = '';
    btn.removeAttribute('data-confirming');

    try {
      const response = await fetch('/config/reset-setup', { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        btn.innerHTML = '✓ Complete';
        showToast('Setup wizard reset. Redirecting...', 'success');
        setTimeout(() => window.location.href = '/setup', 1500);
      } else {
        throw new Error(data.error || 'Failed to reset');
      }
    } catch (err) {
      btn.innerHTML = '✗ Failed';
      btn.disabled = false;
      showToast('Failed to reset: ' + err.message, 'error');
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 3000);
    }
  }
}

/**
 * URL hash support for tabs
 * Update hash when tab switches, and load correct tab on page load
 */
function initializeTabHashSupport() {
  // Update URL hash when tab is clicked
  document.body.addEventListener('htmx:afterSettle', function(event) {
    // Only handle tab content updates
    if (event.detail.target.id === 'tab-content') {
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
      if (activeTab && activeTab.dataset.tabId) {
        // Update URL hash without scrolling
        history.replaceState(null, '', '#' + activeTab.dataset.tabId);
      }
    }
  });

  // Load correct tab based on URL hash on page load
  window.addEventListener('DOMContentLoaded', function() {
    const hash = window.location.hash.substring(1); // Remove # character

    if (hash) {
      // Find tab button with matching ID
      const tabButton = document.querySelector(`[role="tab"][data-tab-id="${hash}"]`);

      if (tabButton) {
        // Trigger HTMX to load the tab
        tabButton.click();
      }
    }
  });

  // Handle browser back/forward navigation
  window.addEventListener('hashchange', function() {
    const hash = window.location.hash.substring(1);

    if (hash) {
      const tabButton = document.querySelector(`[role="tab"][data-tab-id="${hash}"]`);

      if (tabButton) {
        tabButton.click();
      }
    }
  });
}

// Initialize tab hash support if on settings page
if (window.location.pathname === '/config/settings') {
  initializeTabHashSupport();
}

// Expose functions globally
window.testPlexConnection = testPlexConnection;
window.testLastfm = testLastfm;
window.testSpotify = testSpotify;
window.resetSetupWizard = resetSetupWizard;
