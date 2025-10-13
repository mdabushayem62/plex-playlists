# Background Job Queue System

**For development guidance on job queuing, progress tracking, and cancellation.**

See [root CLAUDE.md](../../CLAUDE.md) for project overview.

---

## Architecture (job-queue.ts)

### CLI-First Design Principle

**Core functions are pure and reusable:**
- `warmCache()`, `createPlaylistRunner()`, etc. are standalone functions
- CLI calls functions directly (synchronous, immediate execution)
- Web UI routes jobs through queue (asynchronous, concurrency-limited)
- **Same business logic, different routing**

**Benefits:**
- ✅ Zero duplication - Business logic written once
- ✅ Consistent behavior - CLI and web use identical functions
- ✅ Easy testing - Pure functions, no HTTP/queue mocking needed
- ✅ Performance - CLI bypasses queue overhead
- ✅ Resource control - Web UI respects concurrency limits
- ✅ Cancellation - Works transparently via AbortSignal

---

## Job Queue Implementation

### In-Process Queue (`p-queue`)

- **Max concurrency**: 2 simultaneous background jobs
- **Prevents resource exhaustion** during heavy operations (cache warming, playlist generation)
- **FIFO ordering** (can be extended with priorities later)
- **Memory-efficient**: Jobs don't hold large state, only job metadata

### Supported Job Types

```typescript
type JobType =
  | { type: 'playlist'; window: PlaylistWindow }           // Single playlist generation
  | { type: 'cache-warm'; concurrency?: number }           // Artist cache warming
  | { type: 'cache-albums'; concurrency?: number }         // Album cache warming
  | { type: 'cache-refresh' }                              // Refresh expiring entries
  | { type: 'audiomuse-sync' }                             // AudioMuse feature sync
  | { type: 'custom-playlists' };                          // All custom playlists
```

---

## Job Lifecycle

1. **Enqueue** - Web route calls `jobQueue.enqueue(job)`, returns job ID immediately
2. **Queue** - Job waits in queue until a worker slot is available (max 2 concurrent)
3. **Execute** - Worker calls the same core function used by CLI
4. **Track** - Progress updates via `progressTracker`, persisted to `job_runs` table
5. **Complete** - Job status updated to `success` or `failed`, worker slot freed

**Example:**
```typescript
// Web UI enqueues job
const jobId = await jobQueue.enqueue({ type: 'cache-warm', concurrency: 2 });
res.json({ jobId }); // Returns immediately

// Job executes asynchronously
// - Waits for worker slot
// - Calls warmCache({ concurrency: 2, jobId })
// - Updates progress via ProgressTracker
// - Completes and frees worker slot
```

---

## Cancellation Support

### AbortSignal Integration

Core functions accept `signal?: AbortSignal` for graceful cancellation:

```typescript
const abortController = new AbortController();

await warmCache({
  concurrency: 2,
  jobId: 123,
  signal: abortController.signal  // Passed to core function
});

// Later, from web UI or user action:
abortController.abort();  // Function checks signal and throws
```

**Check points** (where cancellation is detected):
- Before fetching Plex data
- Before each enrichment operation (per artist/album)
- Before cache write operations
- In loops (e.g., every 10 items)

**Behavior:**
- Throws error immediately when signal is aborted
- Cleanup handled by try/catch in worker
- Job status updated to `'failed'` with error message
- Worker slot freed for next job

### Cancel Endpoints

**Cancel specific job:**
```typescript
POST /jobs/:jobId/cancel
// - Looks up running job in activeJobs map
// - Calls abortController.abort()
// - Returns immediately (actual cancellation is async)
```

**Cancel all running jobs:**
```typescript
POST /history/cancel-running
// - Iterates all active jobs
// - Calls abort() on each
// - Returns count of cancelled jobs
```

---

## Queue Management

### Stats Endpoint

`GET /queue/stats` returns current queue state:

```json
{
  "pending": 3,      // Jobs waiting in queue
  "size": 5,         // Total jobs (pending + active)
  "active": 2,       // Currently executing
  "concurrency": 2   // Max simultaneous jobs
}
```

### Active Job Tracking

Queue maintains `Map<jobId, ActiveJob>` for running jobs:

```typescript
interface ActiveJob {
  abortController: AbortController;  // For cancellation
  type: JobType['type'];             // Job type (for logging)
  startedAt: Date;                   // Start timestamp
}
```

**Enables:**
- Job cancellation by ID
- Status queries (running vs queued)
- Timeout detection (future)
- Resource monitoring (future)

---

## Progress Tracking Integration

### Real-Time Updates (`../utils/progress-tracker.ts`)

- **In-memory progress state** with EventEmitter for SSE streaming
- **Rate-limited DB persistence**: Every 10% progress or 30 seconds (whichever first)
- **ETA calculation** based on current processing rate
- **Message updates** for user-facing status ("Processing artist 50/500...")

**Usage:**
```typescript
await progressTracker.start(jobId, totalItems, 'Warming cache...');
await progressTracker.updateProgress(jobId, currentIndex, `Processing ${artist}...`);
await progressTracker.complete(jobId);
```

### Source Tracking (Cache Warming Only)

Tracks which metadata providers were used per artist/album:

```json
{
  "jobId": 123,
  "current": 350,
  "total": 500,
  "message": "Processing Radiohead...",
  "eta": 300000,
  "sourceCounts": {
    "plex": 200,      // Had Plex genres
    "lastfm": 150,    // Used Last.fm
    "spotify": 30,    // Used Spotify fallback
    "cached": 120     // Already in cache (skipped)
  }
}
```

---

## Execution Paths

### CLI Path (Direct)

```typescript
// src/cli.ts
await warmCache({ concurrency: 2, dryRun: false });
// Runs immediately, blocks until complete, outputs to stdout
```

**Characteristics:**
- Synchronous execution (blocks until complete)
- No queue overhead
- Direct console output
- Full concurrency control
- Can use Ctrl+C to abort

### Web Path (Queued)

```typescript
// src/web/routes/actions.ts
const jobId = await jobQueue.enqueue({ type: 'cache-warm', concurrency: 2 });
res.json({ jobId });  // Returns immediately

// Client monitors progress via SSE
const eventSource = new EventSource(`/jobs/${jobId}/stream`);
eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  // Update UI with progress
};
```

**Characteristics:**
- Asynchronous execution (returns immediately)
- Respects queue concurrency (max 2 jobs)
- SSE streaming for real-time progress
- Cancellable via UI button
- Survives page refreshes (job continues in background)

### Scheduler Path (Direct)

```typescript
// src/scheduler.ts
warmCache({ concurrency: 2, skipCached: true });
// Scheduled jobs run directly (not queued) since they're time-based
```

**Characteristics:**
- Runs outside queue (scheduled externally by cron)
- No user interaction
- Logged to console and job_runs table
- Survives app restarts (cron manages execution)

---

## Common Development Patterns

### Adding a New Job Type

1. Add type to `JobType` union in `job-queue.ts`:
```typescript
type JobType =
  | { type: 'playlist'; window: PlaylistWindow }
  | { type: 'my-new-job'; param?: string }; // Add here
```

2. Add case to `enqueue()` switch statement:
```typescript
case 'my-new-job':
  return this.queue.add(async () => {
    await myJobFunction({ ...job, jobId });
  });
```

3. Create corresponding route in `web/routes/actions.ts`:
```typescript
app.post('/my-job/start', async (req, res) => {
  const jobId = await jobQueue.enqueue({ type: 'my-new-job' });
  res.json({ jobId });
});
```

### Implementing Cancellation in Core Function

```typescript
export async function myFunction(options: {
  jobId?: number;
  signal?: AbortSignal;
}) {
  const { signal } = options;

  for (const item of items) {
    // Check cancellation before expensive operation
    if (signal?.aborted) {
      throw new Error('Job cancelled by user');
    }

    // Do work
    await processItem(item);
  }
}
```

### Adding Progress Tracking

```typescript
export async function myFunction(options: { jobId?: number }) {
  const { jobId } = options;

  if (jobId) {
    await progressTracker.start(jobId, items.length, 'Starting...');
  }

  for (let i = 0; i < items.length; i++) {
    await processItem(items[i]);

    if (jobId) {
      await progressTracker.updateProgress(jobId, i + 1, `Processed ${items[i].name}`);
    }
  }

  if (jobId) {
    await progressTracker.complete(jobId);
  }
}
```

---

## Future Extensions

### Retry Logic (Not Yet Implemented)

Planned features:
- Automatic retry on transient failures (network errors, rate limits)
- Exponential backoff (1s → 2s → 4s → 8s)
- Configurable max retries per job type
- Persistent retry state in database

### Job Priorities (Not Yet Implemented)

Planned features:
- Priority levels: Manual jobs > Scheduled jobs > Refresh jobs
- Weighted fair queuing to prevent starvation
- User-initiated jobs run first, automated jobs wait

### Distributed Queue (Not Yet Implemented)

For multi-instance deployments:
- Replace `p-queue` with Redis/BullMQ
- Shared job state across instances
- Horizontal scaling support
- **Core functions remain unchanged** (CLI-first architecture preserved)

---

## Observability

### Job History Queries

```sql
-- Recent jobs
SELECT window, status, datetime(started_at/1000, 'unixepoch') as started
FROM job_runs
ORDER BY started_at DESC
LIMIT 10;

-- Queue performance metrics
SELECT
  window,
  AVG(finished_at - started_at) as avg_duration_ms,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
FROM job_runs
WHERE window LIKE 'cache-%'
GROUP BY window;
```

### Real-Time Monitoring

Web UI dashboard (`/`) shows:
- Active jobs with progress bars
- Queue size and pending jobs
- Recent job history with status
- ETA for running jobs
