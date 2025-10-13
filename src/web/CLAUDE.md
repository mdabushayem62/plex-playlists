# Web UI Architecture

**For development guidance on routes, views, SSE streaming, and frontend patterns.**

See [root CLAUDE.md](../../CLAUDE.md) for project overview.

---

## Tech Stack

- **Backend**: Express.js with Hono-style routing
- **Views**: Kitajs/html (TSX without React - server-rendered)
- **CSS**: Pico CSS framework (classless semantic HTML)
- **Real-time**: Server-Sent Events (SSE) for progress streaming
- **Forms**: Standard HTML forms with progressive enhancement

**Philosophy**: Works without JavaScript, enhanced with JavaScript.

---

## Routes Structure (routes/)

### Dashboard (`dashboard.ts`)

**Endpoint**: `GET /`

**Purpose**: Main landing page showing system overview

**Features:**
- Recent playlist history with status indicators
- Active jobs with progress bars
- Quick action buttons (generate playlists, warm cache)
- Setup wizard integration for first-time users

**View**: `views/dashboard.tsx`

---

### Actions (`actions.ts`)

**Endpoints:**
- `GET /actions` - Action dashboard (cache management, playlist generation)
- `GET /actions/cache` - Cache management page with stats
- `POST /actions/cache/warm` - Start artist cache warming
- `POST /actions/cache/warm-albums` - Start album cache warming
- `POST /actions/cache/clear` - Clear expired or all cache entries
- `POST /actions/playlist/:window` - Generate single playlist
- `POST /actions/audiomuse/sync` - Sync AudioMuse features

**Features:**
- Real-time progress via SSE (`/jobs/:jobId/stream`)
- Background job queueing (max 2 concurrent)
- Cancellation support via AbortSignal
- Source tracking for cache warming (Plex/Last.fm/Spotify breakdown)

**Views**: `views/actions/index.tsx`, `views/actions/cache.tsx`

---

### Playlists (`playlists.ts`)

**Endpoints:**
- `GET /playlists` - List all generated playlists
- `GET /playlists/:id` - Playlist detail with tracks
- `GET /playlists/builder` - Custom playlist builder UI
- `POST /playlists/custom` - Create custom genre/mood playlist
- `PUT /playlists/custom/:id` - Update custom playlist
- `DELETE /playlists/custom/:id` - Delete custom playlist

**Features:**
- Playlist history with generation timestamps
- Track listings with metadata (artist, album, genres, score)
- Custom playlist builder with genre/mood selection
- Scoring strategy selection dropdown

**Views**: `views/playlists/index.tsx`, `views/playlists/detail.tsx`, `views/playlists/builder.tsx`

---

### Configuration (`config.ts`)

**Endpoints:**
- `GET /config` - Configuration dashboard (tabs: General, Scheduling, Settings)
- `GET /config/settings` - Settings editor (env var overrides)
- `GET /config/scheduling` - Cron schedule editor
- `POST /config/settings` - Save setting
- `DELETE /config/settings/:key` - Reset setting to env default

**Features:**
- Live validation of cron expressions
- Setting preview (shows current and env default)
- Settings history audit trail
- Inline help text for each setting

**Views**: `views/config/index.tsx`, `views/config/settings.tsx`, `views/config/scheduling.tsx`

---

### Analytics (`analytics.ts`)

**Endpoints:**
- `GET /analytics` - Analytics dashboard
- `GET /analytics/job-history` - Job execution history with filters
- `GET /analytics/cache-stats` - Cache statistics and trends

**Features:**
- Job success/failure rates over time
- Cache coverage metrics (Plex/Last.fm/Spotify breakdown)
- Playlist generation trends
- Export data as JSON/CSV

**Views**: `views/analytics/index.tsx`

---

### Setup Wizard (`setup.ts`)

**Endpoints:**
- `GET /setup` - Setup wizard (multi-step)
- `POST /setup/step/:step` - Save step and advance
- `POST /setup/complete` - Mark setup complete

**Steps:**
1. Welcome & Prerequisites
2. Plex connection test
3. Optional rating import
4. Optional cache warming
5. API key configuration (Last.fm/Spotify)
6. First playlist generation
7. Complete & redirect to dashboard

**Features:**
- Progress indicator (step X of 7)
- Skip optional steps
- Validation with inline errors
- Test connections before advancing

**Views**: `views/setup/*.tsx`

---

## Views Architecture (views/)

### Layout (`layout.tsx`)

Base layout for all pages:

```tsx
export function Layout({
  title,
  page,
  setupComplete,
  children
}: LayoutProps): JSX.Element {
  return (
    <html>
      <head>
        <title>{title} - Plex Playlist Enhancer</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />
      </head>
      <body>
        <nav>...</nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

**Features:**
- Semantic HTML with Pico CSS classes
- Active page indicator in nav
- Setup state awareness (redirects incomplete setups)
- Responsive layout (mobile-first)

---

### Component Patterns

**Editable Fields** (`components/editable-field.tsx`):
```tsx
<EditableField
  label="Plex Base URL"
  value={config.plexBaseUrl}
  onSave={async (value) => {
    await fetch('/config/settings', {
      method: 'POST',
      body: JSON.stringify({ key: 'plex_base_url', value })
    });
  }}
/>
```

**Progress Bars** (inline in pages):
```tsx
<div id="progress" style="display: none;">
  <progress id="progress-bar" value="0" max="100"></progress>
  <div id="progress-message">Starting...</div>
  <div id="progress-eta">Calculating...</div>
</div>
```

**Stat Cards** (`components/stat-card.tsx`):
```tsx
<div class="stat-card">
  <h3>{stats.total}</h3>
  <p>Total Entries</p>
</div>
```

---

## Frontend JavaScript (public/js/)

### Job Monitoring (`job-monitor.js`)

Shared utility for SSE progress streaming:

```javascript
function monitorJob(jobId, options) {
  const eventSource = new EventSource(`/jobs/${jobId}/stream`);

  eventSource.onmessage = (event) => {
    const progress = JSON.parse(event.data);

    // Update progress bar
    options.onProgress(progress.current, progress.total, progress.message);

    // Update ETA
    if (progress.eta) {
      options.onEta(progress.eta);
    }

    // Handle completion
    if (progress.status === 'completed') {
      eventSource.close();
      options.onComplete();
    }
  };

  return eventSource; // Return for cleanup
}
```

**Usage in page JS:**
```javascript
const eventSource = monitorJob(jobId, {
  onProgress: (current, total, message) => {
    document.getElementById('progress-bar').value = (current / total) * 100;
    document.getElementById('progress-message').textContent = message;
  },
  onComplete: () => {
    showSuccess('Cache warming completed!');
    setTimeout(() => location.reload(), 2000);
  }
});
```

### Page-Specific Scripts

**Cache Management** (`cache.js`):
- `warmCache()` - Start artist cache warming
- `warmAlbumCache()` - Start album cache warming
- `syncAudioMuse()` - Start AudioMuse sync
- `confirmClearAll()` - Confirm before clearing cache

**Playlist Builder** (`playlist-builder.js`):
- Genre/mood tag input with autocomplete
- Strategy selection with formula preview
- Target size slider with validation

**Playlist Detail** (`playlist-detail.js`):
- Track filtering by artist/genre
- Sort by score/position/artist
- Export playlist as JSON/M3U

---

## Server-Sent Events (SSE)

### Progress Streaming

**Endpoint**: `GET /jobs/:jobId/stream`

**Implementation** (`routes/actions.ts`):
```typescript
app.get('/jobs/:jobId/stream', (req, res) => {
  const jobId = parseInt(req.params.jobId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const listener = (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  progressTracker.on(`progress:${jobId}`, listener);

  req.on('close', () => {
    progressTracker.off(`progress:${jobId}`, listener);
  });
});
```

**Benefits:**
- Real-time progress updates (no polling)
- Survives page refreshes (reconnects automatically)
- Server-to-client push (efficient)
- Standard browser EventSource API

---

## Form Handling

### Standard Forms (No JS Required)

```tsx
<form method="POST" action="/config/settings">
  <label>
    Plex Base URL
    <input type="url" name="plex_base_url" value={config.plexBaseUrl} required />
  </label>
  <button type="submit">Save</button>
</form>
```

**Progressive Enhancement:**
```javascript
// Enhance with AJAX if JS available
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(form);
  const response = await fetch(form.action, {
    method: 'POST',
    body: formData
  });
  if (response.ok) {
    showSuccess('Saved!');
  }
});
```

---

## Common Development Patterns

### Adding a New Page

1. Create route file: `routes/my-page.ts`
```typescript
export function registerMyPageRoutes(app: Express) {
  app.get('/my-page', async (req, res) => {
    const data = await fetchData();
    res.send(MyPageView({ data, page: 'my-page', setupComplete: true }));
  });
}
```

2. Create view: `views/my-page.tsx`
```tsx
export function MyPageView({ data, page, setupComplete }: Props): JSX.Element {
  return (
    <Layout title="My Page" page={page} setupComplete={setupComplete}>
      <h1>My Page</h1>
      <p>{data.message}</p>
    </Layout>
  );
}
```

3. Register routes in `index.ts`:
```typescript
import { registerMyPageRoutes } from './routes/my-page.js';
registerMyPageRoutes(app);
```

4. Add nav link in `layout.tsx`:
```tsx
<a href="/my-page" class={page === 'my-page' ? 'active' : ''}>
  My Page
</a>
```

### Adding Real-Time Job

1. Add job type to queue (see [queue/CLAUDE.md](../queue/CLAUDE.md))

2. Create endpoint to start job:
```typescript
app.post('/my-job/start', async (req, res) => {
  const jobId = await jobQueue.enqueue({ type: 'my-job' });
  res.json({ jobId });
});
```

3. Add progress UI in view:
```tsx
<div id="my-job-progress" style="display: none;">
  <progress id="my-job-bar" value="0" max="100"></progress>
  <div id="my-job-message">Starting...</div>
</div>
```

4. Add JS handler in page script:
```javascript
async function startMyJob() {
  const response = await fetch('/my-job/start', { method: 'POST' });
  const { jobId } = await response.json();

  document.getElementById('my-job-progress').style.display = 'block';

  monitorJob(jobId, {
    onProgress: (current, total, message) => {
      updateProgressUI(current, total, message);
    },
    onComplete: () => {
      showSuccess('Job completed!');
    }
  });
}
```

### Adding Editable Config

1. Add setting to database (via web UI or migration)

2. Add form field in `views/config/settings.tsx`:
```tsx
<EditableField
  label="My Setting"
  value={settings.mySetting}
  type="number"
  help="Description of what this does"
  onSave={async (value) => {
    await saveSetting('my_setting', value);
  }}
/>
```

3. Backend uses setting (check `settings` table first, fallback to env var)

---

## Styling with Pico CSS

### Semantic HTML Classes

Pico CSS provides automatic styling for semantic HTML:

```tsx
// Buttons
<button>Primary</button>
<button class="secondary">Secondary</button>
<button class="contrast">Contrast</button>

// Forms
<input type="text" placeholder="Text input" />
<select><option>Option</option></select>
<progress value="50" max="100"></progress>

// Cards
<article>
  <header>Card Header</header>
  <p>Card content</p>
  <footer>Card footer</footer>
</article>

// Grid
<div class="grid">
  <div>Column 1</div>
  <div>Column 2</div>
</div>
```

### Custom Styles

Add to `public/css/custom.css` for project-specific styles:

```css
.stat-card {
  text-align: center;
  padding: 1rem;
  background: var(--pico-card-background-color);
  border-radius: var(--pico-border-radius);
}

.stat-card h3 {
  margin: 0;
  font-size: 2rem;
  color: var(--pico-primary);
}
```

---

## Testing & Debugging

### Manual Testing

1. Start server: `npm run dev`
2. Navigate to http://localhost:8687
3. Test features:
   - Forms: Submit and verify server response
   - Jobs: Start job and monitor progress via SSE
   - Navigation: Click all nav links, verify active state

### SSE Debugging

**Browser DevTools**:
- Network tab → Filter by "EventStream"
- See real-time SSE messages
- Verify format: `data: {...}\n\n`

**Server logs**:
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev
```

### View Rendering

Test TSX views in isolation:
```typescript
import { MyPageView } from './views/my-page.tsx';

const html = MyPageView({ data: mockData, page: 'my-page', setupComplete: true });
console.log(html); // Raw HTML string
```

---

## Security Considerations

### Input Validation

- All form inputs validated on server-side
- SQL injection prevented by Drizzle ORM parameterized queries
- XSS prevented by JSX auto-escaping

### Authentication

**Current**: No authentication (assumes trusted network)

**Future** (planned):
- Optional Plex OAuth for authentication
- API key for external access
- Session-based auth with cookies

### CORS

Disabled by default (same-origin only).

---

## Performance Optimization

### Server-Rendered HTML

- No client-side framework overhead
- Fast initial page load
- Progressive enhancement for interactions

### Lazy Loading

- JS loaded only when needed (per-page scripts)
- SSE connections closed when component unmounts
- Database queries optimized with indexes

### Caching

- Static assets served with cache headers
- Pico CSS loaded from CDN (browser cached)
- Database queries use indexes for fast lookups
