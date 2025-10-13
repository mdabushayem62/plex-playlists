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
    scoringStrategy: formData.get('scoringStrategy') || 'quality',
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

/**
 * Load playlist recommendations
 */
async function loadRecommendations() {
  const section = document.getElementById('recommendations-section');
  const loading = document.getElementById('recommendations-loading');
  const content = document.getElementById('recommendations-content');
  const error = document.getElementById('recommendations-error');
  const btn = document.getElementById('show-recommendations-btn');

  // Show section and loading state
  section.style.display = 'block';
  loading.style.display = 'block';
  content.style.display = 'none';
  error.style.display = 'none';
  btn.disabled = true;

  // Scroll to section
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const response = await fetch('/playlists/recommendations');
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error('Failed to load recommendations');
    }

    const recommendations = result.recommendations;

    if (recommendations.length === 0) {
      content.innerHTML = `
        <div class="playlist-builder-card">
          <p style="color: var(--pico-muted-color); margin: 0;">
            No recommendations available yet. Make sure you have:
            <ul style="margin: 0.5rem 0 0 1.5rem;">
              <li>Listened to some music</li>
              <li>Rated some tracks</li>
              <li>Run cache warming to populate genre data</li>
            </ul>
          </p>
        </div>
      `;
    } else {
      // Render recommendations
      content.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1rem;">
          ${recommendations.map(rec => `
            <div class="recommendation-card">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                <h4 style="margin: 0; flex: 1;">${rec.name}</h4>
                <span class="category-badge category-${rec.category}">${rec.category}</span>
              </div>

              <p style="margin: 0 0 0.75rem 0; font-size: 0.875rem; color: var(--pico-muted-color);">
                ${rec.description}
              </p>

              ${rec.genres.length > 0 || rec.moods.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 0.375rem; margin-bottom: 0.75rem;">
                  ${rec.genres.map(g => `<span style="padding: 0.25rem 0.5rem; background: var(--pico-primary); color: var(--pico-primary-inverse); border-radius: 0.25rem; font-size: 0.75rem;">🎵 ${g}</span>`).join('')}
                  ${rec.moods.map(m => `<span style="padding: 0.25rem 0.5rem; background: var(--pico-ins-color); color: white; border-radius: 0.25rem; font-size: 0.75rem;">✨ ${m}</span>`).join('')}
                </div>
              ` : ''}

              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color);">
                <small style="color: var(--pico-muted-color);">${rec.reason}</small>
                <button
                  onclick='createFromRecommendation(${JSON.stringify(rec).replace(/'/g, "\\'").replace(/"/g, "&quot;")})'
                  class="secondary"
                  style="font-size: 0.875rem; padding: 0.375rem 0.75rem; margin: 0; white-space: nowrap;"
                >
                  ➕ Create
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    loading.style.display = 'none';
    content.style.display = 'block';
  } catch (err) {
    console.error('Failed to load recommendations:', err);
    loading.style.display = 'none';
    error.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

/**
 * Create a playlist from a recommendation
 */
async function createFromRecommendation(recommendation) {
  const data = {
    name: recommendation.name,
    genres: recommendation.genres,
    moods: recommendation.moods,
    targetSize: recommendation.targetSize,
    scoringStrategy: recommendation.scoringStrategy || 'quality',
    description: recommendation.description
  };

  try {
    const response = await fetch('/playlists/builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok) {
      showToast(`Created "${recommendation.name}" playlist!`, 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      throw new Error(result.error || 'Failed to create playlist');
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
window.loadRecommendations = loadRecommendations;
window.createFromRecommendation = createFromRecommendation;
