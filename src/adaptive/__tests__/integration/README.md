# PlayQueue Integration Tests

Integration tests for the Adaptive PlayQueue feature that run against a real Plex server.

## Prerequisites

1. **Plex server** running and accessible
2. **`.env` file** in project root with real credentials:
   ```bash
   PLEX_BASE_URL=http://your-plex-server:32400
   PLEX_AUTH_TOKEN=your-actual-token
   ```
3. **Active playback session** (optional, but recommended for full testing)
4. **Test playlist** with ratingKey `258583` titled "🎵 Electronica" (optional)

## Running Integration Tests

### Run all integration tests:
```bash
INTEGRATION=true npm run test -- src/adaptive/__tests__/integration/
```

### Run with verbose output:
```bash
INTEGRATION=true npm run test -- src/adaptive/__tests__/integration/ --reporter=verbose
```

### Run specific test file:
```bash
INTEGRATION=true npm run test -- src/adaptive/__tests__/integration/playqueue-integration.test.ts
```

## What Gets Tested

### ✅ Non-Destructive Tests (Read-Only)
- **listPlayQueues** - Lists all active PlayQueues
- **getPlayQueue** - Fetches queue by ID with full metadata
- **Queue Tracker** - Tests cache management and failure tracking
- **Queue Version Tracking** - Monitors version increments
- **Test Playlist Verification** - Checks if test playlist is playing

### ⚠️ Tests are READ-ONLY
These tests **do not modify** your PlayQueue or disrupt playback. They only read queue state and verify the API client works correctly.

## Behavior

- **Default (without `INTEGRATION=true`)**: Tests are **skipped** automatically
- **With `INTEGRATION=true`**: Tests run against your real Plex server
- **Missing credentials**: Tests skip with helpful error message

## Expected Output

```
✓ Plex server configured: http://your-plex-server:32400

✓ src/adaptive/__tests__/integration/playqueue-integration.test.ts (12)
  ✓ PlayQueue Integration Tests (12)
    ✓ listPlayQueues (2)
      ✓ should list all active PlayQueues
      ✓ should find queue with undocumented playlistID field
    ✓ getPlayQueue (3)
      ✓ should retrieve specific PlayQueue by ID
      ✓ should include track metadata in PlayQueue items
      ✓ should throw error for non-existent queue
    ...

Test Files  1 passed (1)
     Tests  12 passed (12)
```

## Troubleshooting

### Tests are skipped
Check that:
1. `INTEGRATION=true` is set
2. `.env` file exists with real credentials
3. `PLEX_BASE_URL` is not `http://localhost:32400` (test default)
4. `PLEX_AUTH_TOKEN` is not `test-token` (test default)

### Connection refused
- Verify Plex server is running
- Check firewall settings
- Ensure `PLEX_BASE_URL` is correct (including port)

### Authentication failed
- Verify `PLEX_AUTH_TOKEN` is valid
- Token may have expired (regenerate in Plex settings)

## Safety

These tests are designed to be **safe** to run against production Plex servers:
- ✅ Only read operations
- ✅ No queue modifications
- ✅ No track removals
- ✅ No playback disruption
- ✅ Graceful error handling

The only destructive operations (remove, add tracks) are **commented out** or **not executed** in the actual test implementations.
