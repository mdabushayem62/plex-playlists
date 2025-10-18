# Development Documentation

This directory contains development-only documentation that is not needed by end users.

---

## Structure Overview

```
dev-docs/
├── README.md (this file)
├── INTEGRATION-TESTS.md
├── adaptive-playqueue-test-plan.md (ACTIVE ← Current testing)
├── adaptive-playqueue-phase1-summary.md (ACTIVE ← Phase 2 reference)
├── TESTING-SUMMARY-2025-10-17.md (ACTIVE ← Test results)
├── reference/ (Reusable research & APIs)
├── logs/ (Session notes & test logs)
├── archive/ (Historical work)
└── plex-testing-setup/ (Testing infrastructure)
```

---

## Active Documentation (Current Work)

### Adaptive PlayQueue Testing
- **adaptive-playqueue-test-plan.md** - Comprehensive testing checklist and results (Phase 1/Beta)
- **TESTING-SUMMARY-2025-10-17.md** - Latest test execution summary with status updates
- **adaptive-playqueue-phase1-summary.md** - Phase 1 completion reference (informs Phase 2 work)

### Testing & Infrastructure
- **INTEGRATION-TESTS.md** - Testing strategy and integration test documentation
- **plex-testing-setup/** - Testing infrastructure code and bootstrap scripts

---

## Reference Materials

**See:** [reference/](reference/)

Reusable research and API documentation:
- **plex-api-reference.md** - Consolidated Plex API documentation (most comprehensive)
- **available-music-apis.md** - Free music metadata APIs (Last.fm, TheAudioDB, etc.)
- **genre-similarity-data-sources.md** - Genre/mood data sources research
- **reference-projects.md** - Similar projects analysis
- **plex-openapi.json** - Plex API OpenAPI spec
- PDF/text research summaries

---

## Session Logs & Notes

**See:** [logs/](logs/)

Temporal exploration and debugging notes:
- Session transcripts from playqueue discovery deep dives
- Plex API exploration notes
- Test session logs

---

## Archived Documentation

**See:** [archive/README.md](archive/README.md)

### Completed Implementations
Historical reference for finished work:
- `completed-implementations/` - Work that was implemented and shipped
  - Quick Win scoring enhancements
  - Smart playlist integration analysis
  - Metadata-driven scoring design

### Plex API Research Archives
Detailed exploratory work (see `reference/plex-api-reference.md` for consolidated findings):
- `plex-api-research/` - Deep dive API analysis and test results

### Web UI Planning
Architectural discussions for future work (not yet implemented):
- `web-ui-planning/` - UI refactor options and research

### Historical Planning
Superseded by Task Manager (Linear):
- Adaptive PlayQueue Phase planning (2-4)
- Web UI Phase planning (0-4)
- Initial project planning
- Streaming playlist research

**All current work tracking:** Task Manager MCP (`plex-playlists` project in Linear)

---

## Work Tracking

**Task Manager:** All work tracked in Linear via MCP agent-task-manager
- View tasks: `list_tasks` with filter `{"project": "plex-playlists"}`
- Known issues, bugs, enhancements all tracked there
- Single source of truth for "what needs doing"

**Not in docs:** This keeps dev-docs focused on implementation notes, not project status.

---

## User-Facing Documentation

All user-facing documentation is in the project root and `docs/`:

- **[README.md](../README.md)** - Main project documentation
- **[docs/](../docs/)** - User guides (Docker, CLI, configuration, troubleshooting, etc.)
- **[CLAUDE.md](../CLAUDE.md)** - Claude Code assistant instructions

---

## Contributing Development Notes

If you're working on the project and need to add development notes:

1. **Implementation summaries** - Document completed work (like `quick-wins-implementation-summary.md`)
2. **Design documents** - Explain architecture decisions and patterns
3. **Research findings** - Document external research and analysis
4. **Update this README** - Keep the index current

**Don't create roadmaps** - Use Task Manager (Linear) for planning and tracking work.
