/**
 * Playlist Builder - Client-side functionality
 */

// Track selected genres and moods
const selectedGenres = new Set();
const selectedMoods = new Set();
const MAX_SELECTIONS = 2;

/**
 * Toggle builder form visibility
 */
function toggleBuilder() {
  const form = document.getElementById('builder-form');
  const btn = document.getElementById('new-playlist-btn');

  if (form.classList.contains('active')) {
    form.classList.remove('active');
    btn.textContent = '➕ Create Playlist';
    // Reset form
    document.getElementById('create-playlist-form').reset();
    selectedGenres.clear();
    selectedMoods.clear();
    updateTagStates();
  } else {
    form.classList.add('active');
    btn.textContent = '✗ Cancel';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Toggle genre/mood tag selection
 */
function toggleTag(element, type) {
  const value = element.dataset.value;
  const selectedSet = type === 'genre' ? selectedGenres : selectedMoods;

  if (element.classList.contains('selected')) {
    // Deselect
    element.classList.remove('selected');
    selectedSet.delete(value);
  } else {
    // Check if we've reached the limit
    if (selectedSet.size >= MAX_SELECTIONS) {
      showToast(`Maximum ${MAX_SELECTIONS} ${type}s allowed`, 'warning');
      return;
    }
    // Select
    element.classList.add('selected');
    selectedSet.add(value);
  }

  updateTagStates();
}

/**
 * Update tag states (disable if limit reached)
 */
function updateTagStates() {
  // Update genres
  const genreTags = document.querySelectorAll('[data-type="genre"]');
  genreTags.forEach(tag => {
    if (!tag.classList.contains('selected') && selectedGenres.size >= MAX_SELECTIONS) {
      tag.classList.add('disabled');
    } else {
      tag.classList.remove('disabled');
    }
  });

  // Update moods
  const moodTags = document.querySelectorAll('[data-type="mood"]');
  moodTags.forEach(tag => {
    if (!tag.classList.contains('selected') && selectedMoods.size >= MAX_SELECTIONS) {
      tag.classList.add('disabled');
    } else {
      tag.classList.remove('disabled');
    }
  });
}

/**
 * Create a new custom playlist
 */
async function createPlaylist(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  // Validation
  if (selectedGenres.size === 0 && selectedMoods.size === 0) {
    showToast('Please select at least one genre or mood', 'warning');
    return;
  }

  const data = {
    name: formData.get('name'),
    genres: Array.from(selectedGenres),
    moods: Array.from(selectedMoods),
    targetSize: parseInt(formData.get('targetSize')),
    description: formData.get('description') || null
  };

  // Disable submit button
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Creating...';

  try {
    const response = await fetch('/playlists/builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok) {
      showToast('Playlist created successfully!', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      throw new Error(result.error || 'Failed to create playlist');
    }
  } catch (error) {
    showToast(error.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

/**
 * Toggle playlist enabled/disabled
 */
async function togglePlaylist(id, enabled) {
  try {
    const response = await fetch(`/playlists/builder/${id}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (response.ok) {
      showToast(`Playlist ${enabled ? 'enabled' : 'disabled'}`, 'success');
      setTimeout(() => window.location.reload(), 500);
    } else {
      throw new Error('Failed to toggle playlist');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/**
 * Generate a playlist immediately
 */
async function generatePlaylist(id) {
  const btn = event.target;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳';

  try {
    const response = await fetch(`/playlists/builder/${id}/generate`, {
      method: 'POST'
    });

    if (response.ok) {
      btn.innerHTML = '✓';
      showToast('Playlist generation started! This may take a few minutes.', 'success');
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error('Failed to start generation');
    }
  } catch (error) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    showToast(error.message, 'error');
  }
}

/**
 * Delete a playlist (with confirmation)
 */
async function deletePlaylist(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/playlists/builder/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Playlist deleted', 'success');
      setTimeout(() => window.location.reload(), 500);
    } else {
      throw new Error('Failed to delete playlist');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Expose functions globally
window.toggleBuilder = toggleBuilder;
window.toggleTag = toggleTag;
window.createPlaylist = createPlaylist;
window.togglePlaylist = togglePlaylist;
window.generatePlaylist = generatePlaylist;
window.deletePlaylist = deletePlaylist;
