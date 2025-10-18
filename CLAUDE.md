# CLAUDE.md

**Project Phase:** Prototype (late)

**Documentation Level:** Minimal. Code is truth. Document decisions and gotchas only.

---

## Core Constraints

**Type Safety:** error on any - Strict mode, use unknown for dynamic data
**Test Coverage:** Critical paths only - 40-60% overall, unit tests for core logic
**Breaking Changes:** Acceptable with migration - Document but ship
**Performance:** No premature optimization - Profile before optimizing

---

## Code Rules

### Naming
- Functions: `verbNoun` - `getUserById`, `calculateScore` (not `get`, `calc`)
- Types: PascalCase with suffix - `CandidateTrack`, `ScoringStrategy`
- Files: kebab-case.ts - `playlist-runner.ts`, `candidate-builder.ts`

### Import Paths (Node ESM)
```typescript
import { logger } from './logger.js';         // ✅ Use .js extension
import type { Window } from './windows.js';   // ✅ Even for types
```
TypeScript compiles `.ts` → `.js`, but imports must reference `.js`

### Must
- Validate at boundaries (API input, Plex API responses)
- Handle errors explicitly (meaningful error messages, not "Error")
- Use strict TypeScript (no `any` without TODO comment)
- Return meaningful errors (not "Error 500")

### Must Not
- Throw errors without context
- Use `any` without TODO comment explaining why
- Commit `console.log` statements

---

## Testing Non-Negotiables

### Always Test
- Scoring algorithms (unit tests, various inputs)
- Selection logic (epsilon-greedy, constraint relaxation)
- Time calculations (window boundaries, date math)
- Database migrations (up and down)

### Never Test
- Simple getters/setters
- Framework glue code
- Third-party library internals

### Test Isolation
- Unit: Pure functions, mock externals
- Integration: Real SQLite with transactions
- E2E: Optional, manual testing with real Plex

**Pre-commit hook:** lint → test → build (all must pass)

---

## Critical Gotchas

### Plex API Quirks
**Audio playlists require `type: 'audio'`** - Not documented in @ctrl/plex, will fail silently otherwise
**No playlist update API** - Must delete old playlist then create new (use `ratingKey` to find)
**Summary field max 256 chars** - We use it for metadata, keep it short

### Node ESM Import Gotcha
**Extensions required** - `import './foo.js'` not `import './foo'`
TypeScript won't warn you, but Node will crash at runtime. Hit this 5+ times.

---

## Common Workflow Commands

### Development Loop
```bash
npm run dev              # tsx watch mode
npm run test:watch       # Vitest watch mode
npm run lint             # Fix before commit
```

### Before Commit
```bash
npm run lint && npm test && npm run build
# Or just commit - pre-commit hook runs this automatically
```

### Database Changes
```bash
# 1. Edit src/db/schema.ts
npx drizzle-kit generate        # Generate migration
# 2. Restart app - migrations run automatically
npx drizzle-kit studio          # Verify in Drizzle Studio
```

### Testing Playlists Locally
```bash
npm run dev -- run morning      # Single playlist
npm run dev -- run-all          # All three daily
npm run dev -- cache warm       # Warm cache first for better results
```

### Plex Test Scripts
 - Use import 'dotenv/config' for plex creds
 - Temporary test scripts go in `scripts/test-*.*`

---

## When You're Unsure

**Prioritize:** Working over perfect, shipping over refactoring, removing code over adding abstractions

**Refer to:**
- Existing code patterns (prefer consistency)
- Tests for expected behavior
- Domain CLAUDE.md files for specific subsystems

**Ask user about:**
- Algorithm tuning (weights, thresholds, halflife)
- Breaking changes to database schema
- Removing features vs fixing bugs
- Whether to add dependencies

**Don't assume:**
- Features work without verification
- Tests cover everything
- Documentation is up to date
- Enterprise patterns belong in homelab tool

---

## Domain-Specific Docs

Only 2 domain docs exist (rest deleted as premature):

**[src/playlist/CLAUDE.md](src/playlist/CLAUDE.md)** - Playlist generation development patterns
**[src/adaptive/CLAUDE.md](src/adaptive/CLAUDE.md)** - Adaptive playqueue (experimental)

If you need to understand cache, DB, metadata, web UI, or queue - **read the code**. It's the source of truth.

---

## Work Tracking

This project uses the Agent Task Manager MCP for persistent task tracking and knowledge management.

**First time using this MCP?** Read the `help://quickstart` resource to understand the workflow, effort calibration, and lesson extraction patterns.

**Task Manager:** All work tracked in Linear via MCP agent-task-manager
- View tasks: `list_tasks` with filter `{"project": "plex-playlists"}`
- Known issues, bugs, enhancements all tracked there
- Single source of truth for "what needs doing"

**Not tracked here:** Keeps CLAUDE.md focused on development rules, not project status

**Quick reference:**
- Tasks with effort ≥3 require uncertainties and decomposition
- Use `update_task` before/after work to capture lessons and resolve uncertainties
- Extract valuable lessons to the knowledge base with `extract_lesson`
- Reference tasks by Linear key (e.g., NON-123)

For detailed guidance, see:
- `help://quickstart` - Core workflow and rules
- `help://effort-calibration` - Choosing Fibonacci effort values
- `help://tool-selection` - When to use list_tasks vs query_task
