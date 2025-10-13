/**
 * Editable field component with inline editing
 * Type-safe HTML using @kitajs/html JSX
 */

import Html from '@kitajs/html';

export interface FieldMetadata {
  value: string | number | boolean | string[];
  type: 'text' | 'password' | 'number' | 'url' | 'json' | 'cron';
  source: 'env' | 'database' | 'default';
  description: string;
  category: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
  };
}

export interface EditableFieldProps {
  fieldKey: string;
  metadata: FieldMetadata;
}

export function EditableField({ fieldKey, metadata }: EditableFieldProps): JSX.Element {
  return (
    <div class="editable-field" data-key={fieldKey} id={`field-${fieldKey}`}>
      {/* Display Mode */}
      <div class="field-display">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <code class="value" style="font-size: 1rem; font-weight: 500;">
              {metadata.value}
            </code>
            <small style="margin-left: 0.5rem;">
              {metadata.source === 'database' ? (
                <span style="color: var(--pico-primary); font-size: 0.75rem;">
                  💾 from database
                </span>
              ) : (
                <span style="color: var(--pico-muted-color); font-size: 0.75rem;">
                  📄 from .env
                </span>
              )}
            </small>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button
              class="edit-btn"
              onclick={`editField('${fieldKey}')`}
              style="padding: 0.25rem 0.75rem; font-size: 0.875rem;"
            >
              ✏️ Edit
            </button>
            {metadata.source === 'database' && (
              <button
                class="reset-btn secondary"
                onclick={`resetField('${fieldKey}')`}
                style="padding: 0.25rem 0.75rem; font-size: 0.875rem;"
                title="Reset to default from .env"
              >
                ↺
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Mode (hidden by default) */}
      <div class="field-edit" style="display: none;">
        <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
          <div style="flex: 1;">
            <input
              type={
                metadata.type === 'password'
                  ? 'password'
                  : metadata.type === 'number'
                    ? 'number'
                    : 'text'
              }
              class="edit-input"
              value={metadata.type === 'password' ? '' : String(metadata.value)}
              placeholder={
                metadata.type === 'password'
                  ? 'Enter new value (leave blank to keep current)'
                  : String(metadata.value)
              }
              min={metadata.validation?.min}
              max={metadata.validation?.max}
              pattern={metadata.validation?.pattern}
              required={metadata.validation?.required}
              style="margin: 0;"
            />
            {metadata.validation?.min !== undefined &&
              metadata.validation?.max !== undefined && (
                <small
                  style="color: var(--pico-muted-color); display: block; margin-top: 0.25rem;"
                >
                  Range: {metadata.validation.min} - {metadata.validation.max}
                </small>
              )}
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button
              onclick={`saveField('${fieldKey}')`}
              class="secondary"
              style="padding: 0.5rem 1rem; margin: 0; white-space: nowrap;"
            >
              ✓ Save
            </button>
            <button
              onclick={`cancelEdit('${fieldKey}')`}
              class="outline"
              style="padding: 0.5rem 1rem; margin: 0; white-space: nowrap;"
            >
              ✗ Cancel
            </button>
          </div>
        </div>
        <div
          class="validation-error"
          style="color: var(--pico-del-color); font-size: 0.875rem; margin-top: 0.5rem;"
        ></div>
      </div>
    </div>
  );
}

/**
 * JavaScript for editable field functionality
 * Returns a script tag with all the necessary client-side code
 */
export function EditableFieldScript(): JSX.Element {
  return (
    <script>{`
// Store field metadata globally
const fieldsMetadata = new Map();

/**
 * Register field metadata (called during page load)
 */
function registerField(key, metadata) {
  fieldsMetadata.set(key, metadata);
}

/**
 * Enter edit mode for a field
 */
function editField(key) {
  const fieldEl = document.getElementById(\`field-\${key}\`);
  if (!fieldEl) return;

  fieldEl.querySelector('.field-display').style.display = 'none';
  fieldEl.querySelector('.field-edit').style.display = 'block';

  const input = fieldEl.querySelector('.edit-input');
  input.focus();

  // For non-password fields, select all text
  if (input.type !== 'password') {
    input.select();
  }
}

/**
 * Cancel edit mode
 */
function cancelEdit(key) {
  const fieldEl = document.getElementById(\`field-\${key}\`);
  if (!fieldEl) return;

  fieldEl.querySelector('.field-display').style.display = 'block';
  fieldEl.querySelector('.field-edit').style.display = 'none';

  // Clear validation error
  fieldEl.querySelector('.validation-error').textContent = '';

  // Reset input value
  const metadata = fieldsMetadata.get(key);
  if (metadata) {
    const input = fieldEl.querySelector('.edit-input');
    if (input.type !== 'password') {
      input.value = metadata.value;
    } else {
      input.value = '';
    }
  }
}

/**
 * Save field value
 */
async function saveField(key) {
  const fieldEl = document.getElementById(\`field-\${key}\`);
  if (!fieldEl) return;

  const input = fieldEl.querySelector('.edit-input');
  const errorDiv = fieldEl.querySelector('.validation-error');
  const metadata = fieldsMetadata.get(key);

  let newValue = input.value;

  // For password fields, skip if empty (keep existing)
  if (input.type === 'password' && !newValue) {
    errorDiv.textContent = 'Please enter a new value or cancel to keep the current value';
    return;
  }

  // Client-side validation
  if (metadata && metadata.validation) {
    if (metadata.validation.required && !newValue) {
      errorDiv.textContent = 'This field is required';
      return;
    }

    if (metadata.type === 'number') {
      const num = parseFloat(newValue);
      if (isNaN(num)) {
        errorDiv.textContent = 'Must be a valid number';
        return;
      }
      if (metadata.validation.min !== undefined && num < metadata.validation.min) {
        errorDiv.textContent = \`Must be at least \${metadata.validation.min}\`;
        return;
      }
      if (metadata.validation.max !== undefined && num > metadata.validation.max) {
        errorDiv.textContent = \`Must be at most \${metadata.validation.max}\`;
        return;
      }
    }
  }

  // Disable button during save
  const saveBtn = fieldEl.querySelector('.field-edit button');
  const originalBtnText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '⏳ Saving...';

  try {
    const response = await fetch(\`/config/api/settings/\${key}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newValue })
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Failed to save';
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalBtnText;
      return;
    }

    // Success! Update metadata and UI
    if (metadata) {
      metadata.value = input.type !== 'password' ? newValue : '***' + newValue.slice(-4);
      metadata.source = 'database';
    }

    // Update display value
    const valueEl = fieldEl.querySelector('.value');
    valueEl.textContent = metadata.value;

    // Update source indicator
    const displayDiv = fieldEl.querySelector('.field-display > div');
    displayDiv.innerHTML = displayDiv.innerHTML.replace(
      /<small[^>]*>.*?<\\/small>/,
      '<small style="margin-left: 0.5rem;"><span style="color: var(--pico-primary); font-size: 0.75rem;">💾 from database</span></small>'
    );

    // Add reset button if not present
    if (!fieldEl.querySelector('.reset-btn')) {
      const buttonsDiv = fieldEl.querySelector('.field-display button').parentElement;
      const resetBtn = document.createElement('button');
      resetBtn.className = 'reset-btn secondary';
      resetBtn.onclick = () => resetField(key);
      resetBtn.style.cssText = 'padding: 0.25rem 0.75rem; font-size: 0.875rem;';
      resetBtn.title = 'Reset to default from .env';
      resetBtn.innerHTML = '↺';
      buttonsDiv.appendChild(resetBtn);
    }

    // Exit edit mode
    cancelEdit(key);

    // Show success toast
    showToast(\`\${key} updated successfully\`, 'success');

    // Show restart warning if needed
    if (data.requiresRestart) {
      showToast('⚠️ Restart required for this change to take effect', 'warning', 10000);
    }

  } catch (error) {
    errorDiv.textContent = 'Network error - please try again';
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalBtnText;
  }
}

/**
 * Reset field to default value
 */
async function resetField(key) {
  if (!confirm(\`Reset \${key} to default value from .env?\`)) {
    return;
  }

  try {
    const response = await fetch(\`/config/api/settings/\${key}\`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast(\`\${key} reset to default\`, 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast('Failed to reset setting', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  }
}

/**
 * Support Enter key to save
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('edit-input')) {
    const fieldEl = e.target.closest('.editable-field');
    if (fieldEl) {
      const key = fieldEl.dataset.key;
      saveField(key);
    }
  }

  if (e.key === 'Escape' && e.target.classList.contains('edit-input')) {
    const fieldEl = e.target.closest('.editable-field');
    if (fieldEl) {
      const key = fieldEl.dataset.key;
      cancelEdit(key);
    }
  }
});
`}</script>
  );
}
