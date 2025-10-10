# Web UI Vision & Implementation Plan

## ✅ Implementation Status (October 2025)

**Phases 0-2 COMPLETE:**
- ✅ Express + EJS + PicoCSS
- ✅ Setup wizard (all 5 steps)
- ✅ Dashboard
- ✅ Manual actions
- ✅ Configuration UI

The Web UI is now fully functional and ready for production use!

---

## User's Vision

### Primary Goal
**Setup-first, configuration-focused web UI** that guides users from zero to working playlists in a single workflow.

### Core Philosophy
- **Onboarding over operations**: First-run experience is critical
- **Guided setup**: Don't assume users know what to do
- **Smart defaults**: 3 daily playlists + weekly refresh is good for 90% of users
- **Optional power features**: Import, API keys, genre discovery - nice to have, not required

---

## User Journey (Ideal State)

### First Visit - Setup Wizard

```
┌─────────────────────────────────────────────────┐
│  Welcome to Plex Playlist Enhancer              │
│                                                  │
│  Let's get your playlists set up in 5 minutes   │
│                                                  │
│  [Start Setup]                                   │
└─────────────────────────────────────────────────┘

Step 1: Connect to Plex
├── Plex Server URL: [http://localhost:32400    ]
├── Plex Token: [________________________] [How do I get this?]
└── [Test Connection] → ✓ Connected! Found 2,847 tracks

Step 2: Build Initial Data (Optional but Recommended)
├── [Import Ratings from Spotify/YouTube Music]
│   └── Upload CSV files or [Skip - I'll use Plex ratings]
│       └── Link to IMPORTING.md instructions
├──
├── Analyzing Your Library...
│   ├── ✓ Found 2,847 tracks
│   ├── ✓ Found 342 artists
│   ├── ✓ Found 47 genres (from Plex tags)
│   └── ⚠️ 89% of artists missing genre data
│       └── Recommendation: Add Last.fm or Spotify API keys
│           for better genre detection
│           [Add API Keys] [Skip for now]
│
└── Top Genres Found:
    ├── Synthwave (47 artists, 312 tracks)
    ├── Psytrance (23 artists, 189 tracks)
    ├── Techno (31 artists, 256 tracks)
    └── [Show all 47 genres]

Step 3: Configure Genre Playlists (Optional)
├── Auto-Discovery Settings:
│   ├── [✓] Enable auto-discovery
│   ├── Minimum artists per genre: [5     ] ← slider
│   ├── Maximum playlists: [20   ] ← slider
│   └── Exclude genres: [electronic, edm, pop] ← multi-select
│
└── Or pin specific genres:
    └── [+ Add Genre Playlist]
        Example: Synthwave (weekly, Sundays at 8pm)

Step 4: Schedule & Defaults
├── Daily Playlists:
│   ├── [✓] Morning (6:00 AM)
│   ├── [✓] Afternoon (12:00 PM)
│   └── [✓] Evening (6:00 PM)
│
├── Genre Playlists:
│   └── [✓] Weekly refresh (Sundays at 11:00 PM)
│
├── Playlist Size: [50 tracks] ← slider
├── Max tracks per artist: [2] ← slider
└── Timezone: [America/New_York] ← dropdown

Step 5: Generate First Playlists
├── Preview what will be created:
│   ├── 🌅 Daily Morning Mix (est. 48 tracks)
│   ├── ☀️ Daily Afternoon Mix (est. 50 tracks)
│   ├── 🌙 Daily Evening Mix (est. 45 tracks)
│   ├── 🎵 Weekly Synthwave (est. 50 tracks)
│   ├── 🎵 Weekly Psytrance (est. 42 tracks)
│   └── ... 18 more genre playlists
│
├── [Generate All Playlists Now]
│   └── Progress: Generating playlists... 5/23 complete
│
└── ✓ Setup Complete!
    Next scheduled generation: Tomorrow at 6:00 AM
    [Go to Dashboard]
```

### After Setup - Dashboard

```
┌─────────────────────────────────────────────────┐
│  Dashboard                                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  📊 Playlists (23 active)                       │
│  ├── 🌅 Daily Morning Mix                       │
│  │   └── 48 tracks • Last updated: 2h ago       │
│  ├── ☀️ Daily Afternoon Mix                     │
│  │   └── 50 tracks • Last updated: 14h ago      │
│  └── [View All Playlists]                       │
│                                                  │
│  📅 Next Scheduled                               │
│  └── Tomorrow at 6:00 AM - Morning playlist     │
│                                                  │
│  🔧 Quick Actions                                │
│  ├── [Generate Playlist Now]                    │
│  ├── [Warm Genre Cache]                         │
│  └── [Import Ratings]                           │
│                                                  │
│  📈 Recent Activity (last 10 runs)              │
│  ├── ✓ Morning • 2h ago • 48 tracks             │
│  ├── ✓ Synthwave • 3d ago • 50 tracks           │
│  ├── ✗ Afternoon • 1d ago • Failed: Plex timeout│
│  └── [View Full History]                        │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## Technical Architecture Options

### Option A: Separate Frontend + Backend API

**Stack:**
- Frontend: React/Vue/Svelte SPA
- Backend: Express.js API server
- Communication: REST or GraphQL

**Pros:**
- Clean separation of concerns
- Modern dev experience
- Easy to add features later
- Can use existing CLI commands as API endpoints

**Cons:**
- Two processes to manage (frontend dev server + backend)
- More complex build process
- Overkill for simple use case?

**Docker Setup:**
```dockerfile
# Dockerfile would build both:
# 1. Build frontend SPA → static files
# 2. Backend serves static files + API
```

---

### Option B: Server-Side Rendered (SSR)

**Stack:**
- Next.js (React) or SvelteKit or Nuxt (Vue)
- API routes in same framework
- Single process

**Pros:**
- One process to manage
- Fast initial load
- SEO-friendly (not that it matters here)
- Simpler deployment

**Cons:**
- Heavier framework
- More opinionated structure
- Still need to learn React/Vue/Svelte

---

### Option C: Lightweight Template Engine

**Stack:**
- Express.js + EJS/Handlebars templates
- HTMX for interactivity
- Minimal JavaScript

**Pros:**
- Simplest possible approach
- No build step for frontend
- Easy to understand
- Fast development
- Perfect for internal tools

**Cons:**
- Less "modern" feel
- Harder to build complex interactions
- May look dated to some users

**Example:**
```javascript
// server.js
app.get('/dashboard', async (req, res) => {
  const playlists = await getPlaylists();
  const jobs = await getRecentJobs();
  res.render('dashboard', { playlists, jobs });
});
```

---

### Option D: Admin Panel Framework

**Stack:**
- AdminJS, Forest Admin, or similar
- Auto-generates UI from database schema
- Minimal code

**Pros:**
- Fastest to MVP
- CRUD operations automatic
- Built-in auth
- Professional look

**Cons:**
- Less control over UX
- Hard to customize setup wizard
- May not fit your vision
- Another dependency

---

## Recommended Approach

### Phase 0: Foundation (Week 1)

**Goal:** Basic web server + dashboard (read-only)

**Stack Decision:** Option C (Express + EJS + HTMX) ✅ **APPROVED**
- Fastest to ship
- Perfect for homelab tools
- No build complexity
- Easy to refactor later if needed

**Deliverables:**
1. Express server on port 8687
2. Dashboard showing:
   - Current playlists
   - Recent job runs
   - Cache stats
3. No auth (assumes trusted network)
4. Dark mode by default (respects system preference)

**Code Structure:**
```
src/
├── web/
│   ├── server.ts           # Express app
│   ├── routes/
│   │   ├── dashboard.ts
│   │   ├── api.ts
│   │   └── setup.ts
│   ├── views/
│   │   ├── layout.ejs
│   │   ├── dashboard.ejs
│   │   ├── setup.ejs
│   │   └── partials/
│   └── public/
│       ├── style.css       # Minimal CSS or use PicoCSS
│       └── app.js          # HTMX + minimal JS
└── cli.ts (existing)
```

**Docker:**
```yaml
# docker-compose.yml
services:
  plex-playlists:
    ports:
      - "8687:8687"  # Web UI
    environment:
      - WEB_UI_ENABLED=true
      - WEB_UI_PORT=8687
```

---

### Phase 1: Setup Wizard (Week 2-3)

**Goal:** First-run experience that guides users through initial setup

**Features:**
1. **Step 1: Plex Connection**
   - Form for URL + token
   - Test connection button
   - Save to config

2. **Step 2: Library Analysis**
   - Run Plex library scan
   - Show stats (tracks, artists, genres)
   - Detect missing genre data
   - Recommend API keys

3. **Step 3: Genre Configuration**
   - Show top genres found
   - Auto-discovery settings (sliders)
   - OR manual genre pinning

4. **Step 4: Schedule**
   - Default schedules pre-filled
   - Timezone selector
   - Playlist size/constraints

5. **Step 5: Generate**
   - Preview playlist count
   - "Generate Now" button
   - Progress bar
   - Redirect to dashboard

**State Management:**
- Store setup progress in database (`setup_state` table)
- Redirect to wizard if setup incomplete
- Flag setup as complete after first run

---

### Phase 2: Manual Actions (Week 4)

**Goal:** Common operations without CLI

**Features:**
1. Generate playlist now (dropdown selector)
2. Import ratings (file upload)
3. Warm cache (with progress)
4. Clear cache

**Implementation:**
- POST endpoints that call existing CLI commands
- Server-Sent Events (SSE) for progress updates
- Job queue for long-running tasks

---

### Phase 3: Configuration UI (Week 5-6)

**Goal:** Edit config without manual JSON editing

**Features:**
1. Genre playlist editor
   - Add/edit/delete genre playlists
   - Enable/disable toggles
   - Cron expression builder
2. Scoring parameters (sliders)
3. Auto-discovery settings

**Implementation:**
- Edit `playlists.config.json` from UI
- Validation with JSON schema
- Hot reload (no restart needed)

---

### Phase 4: Advanced Features (Future)

**Goal:** Power user features

**Features:**
1. Playlist preview
   - "What would be selected?"
   - Track list with scores
   - Genre distribution chart
2. API key management
   - Test connection
   - Show cache hit rate
3. Advanced scheduling
   - Visual cron editor
   - Different schedules per playlist

---

## Data Model Additions

### New Tables Needed

```sql
-- Track setup wizard progress
CREATE TABLE setup_state (
  id INTEGER PRIMARY KEY,
  step TEXT NOT NULL,              -- 'plex_connection', 'library_scan', etc.
  completed BOOLEAN DEFAULT FALSE,
  data TEXT,                        -- JSON blob for step data
  completed_at INTEGER
);

-- Store library analysis results
CREATE TABLE library_stats (
  id INTEGER PRIMARY KEY,
  total_tracks INTEGER,
  total_artists INTEGER,
  total_genres INTEGER,
  top_genres TEXT,                 -- JSON array of {genre, artistCount, trackCount}
  analyzed_at INTEGER,
  plex_version TEXT
);

-- Track background jobs (import, cache warming, etc.)
CREATE TABLE background_jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,              -- 'import', 'cache_warm', 'playlist_gen'
  status TEXT NOT NULL,            -- 'pending', 'running', 'complete', 'failed'
  progress INTEGER DEFAULT 0,       -- 0-100
  total_items INTEGER,
  processed_items INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  error TEXT,
  result TEXT                      -- JSON blob of results
);
```

---

## UI Framework Recommendation

For Phase 0-1, use:
- **PicoCSS** (classless CSS framework - looks great with zero effort)
- **HTMX** (server-rendered interactivity)
- **Alpine.js** (for client-side state if needed)

**Why?**
- Zero build step
- Professional look immediately
- Easy to learn
- Fast iteration
- Perfect for homelab tools

**Example:**
```html
<!-- views/dashboard.ejs -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@latest/css/pico.min.css">
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
</head>
<body>
  <main class="container">
    <h1>Plex Playlist Enhancer</h1>

    <section>
      <h2>Recent Jobs</h2>
      <table>
        <% jobs.forEach(job => { %>
          <tr>
            <td><%= job.window %></td>
            <td><%= job.status %></td>
            <td><%= job.started_at %></td>
          </tr>
        <% }) %>
      </table>
    </section>

    <section>
      <h2>Quick Actions</h2>
      <button hx-post="/api/generate/morning"
              hx-target="#result">
        Generate Morning Playlist
      </button>
      <div id="result"></div>
    </section>
  </main>
</body>
</html>
```

---

## Implementation Timeline

### Week 1: Foundation
- [ ] Add Express server
- [ ] Basic routing structure
- [ ] Dashboard view (read-only)
- [ ] Show playlists, jobs, cache stats
- [ ] Docker integration

### Week 2: Setup Wizard (Part 1)
- [ ] Setup state management
- [ ] Step 1: Plex connection form
- [ ] Step 2: Library analysis
- [ ] Database schema for setup_state

### Week 3: Setup Wizard (Part 2)
- [ ] Step 3: Genre configuration
- [ ] Step 4: Schedule configuration
- [ ] Step 5: First generation
- [ ] Completion + redirect

### Week 4: Manual Actions
- [ ] Generate playlist endpoint
- [ ] Import ratings (file upload)
- [ ] Cache warming with progress
- [ ] Background job tracking

### Week 5-6: Configuration UI
- [ ] Genre playlist editor
- [ ] Scoring parameter sliders
- [ ] Auto-discovery settings
- [ ] Config file hot reload

---

## Design Decisions ✅

1. **Authentication?**
   - ✅ **APPROVED:** None (assumes trusted network)
   - Future: Can add simple password in Phase 3 if needed

2. **Multi-user support?**
   - ✅ **APPROVED:** Punt to future
   - Setup wizard assumes single user

3. **Mobile-responsive?**
   - ✅ **APPROVED:** Don't prioritize (desktop-first)
   - PicoCSS handles mobile automatically, but no special effort

4. **Dark mode?**
   - ✅ **APPROVED:** Default to dark, respect system preference
   - PicoCSS built-in dark mode support

5. **Port?**
   - ✅ **APPROVED:** 8687
   - Configurable via WEB_UI_PORT env var

---

## Success Metrics

**After Phase 1 (Setup Wizard):**
- User can go from `docker-compose up` to working playlists in <5 minutes
- Zero manual file editing required
- Clear guidance at every step

**After Phase 2 (Manual Actions):**
- Zero `docker exec` commands needed for common operations
- Progress visibility for long-running tasks

**After Phase 3 (Configuration):**
- Zero file editing for any configuration changes
- No container restarts needed

---

## Next Steps

**Immediate:**
1. Review this plan - does it match your vision?
2. Choose architecture (recommend Option C: Express + EJS + HTMX)
3. Start Phase 0: Basic web server

**Questions for you:**
1. Any changes to the setup wizard flow?
2. Should import be required or optional? (I have it as optional with skip)
3. Should we warm cache automatically during setup?
4. Any must-have features I'm missing?

Ready to start building when you give the green light! 🚀
