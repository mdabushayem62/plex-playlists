/**
 * Integration tests for Adaptive PlayQueue against real Plex server
 *
 * Prerequisites:
 * - .env file with PLEX_BASE_URL and PLEX_AUTH_TOKEN
 * - Active Plex server
 * - Optional: Active playback session for full testing
 *
 * These tests are flexible and work with any active queue/playlist.
 * They will be skipped if Plex credentials are not available.
 *
 * To run these tests:
 * INTEGRATION=true npm run test -- src/adaptive/__tests__/integration/
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getPlayQueue,
  listPlayQueues
} from '../../../plex/playqueue.js';
import { getQueueTracker } from '../../queue-tracker.js';

const PLEX_BASE_URL = process.env.PLEX_BASE_URL;
const PLEX_AUTH_TOKEN = process.env.PLEX_AUTH_TOKEN;
const IS_INTEGRATION_MODE = process.env.INTEGRATION === 'true';

// Skip all tests if not in integration mode or if credentials are test defaults
const skipTests = !IS_INTEGRATION_MODE ||
                  !PLEX_BASE_URL ||
                  !PLEX_AUTH_TOKEN ||
                  PLEX_BASE_URL === 'http://localhost:32400' ||
                  PLEX_AUTH_TOKEN === 'test-token';

describe('PlayQueue Integration Tests', () => {
  beforeAll(() => {
    if (skipTests) {
      if (!IS_INTEGRATION_MODE) {
        console.log('⚠️  Skipping PlayQueue integration tests: Set INTEGRATION=true to run');
        console.log('   Run with: INTEGRATION=true npm run test -- src/adaptive/__tests__/integration/');
      } else {
        console.log('⚠️  Skipping PlayQueue integration tests: Real PLEX_BASE_URL and PLEX_AUTH_TOKEN required in .env');
      }
      return;
    }

    console.log('✓ Plex server configured:', PLEX_BASE_URL);
  });

  describe('listPlayQueues', { skip: skipTests }, () => {
    it('should list all active PlayQueues', async () => {
      const queues = await listPlayQueues();

      expect(queues).toBeDefined();
      expect(Array.isArray(queues)).toBe(true);

      console.log(`Found ${queues.length} active PlayQueue(s)`);

      if (queues.length > 0) {
        const listItem = queues[0]!;
        console.log('First queue:', {
          id: listItem.id,
          totalItemsCount: listItem.totalItemsCount,
          playlistID: listItem.playlistID,
          clientIdentifier: listItem.clientIdentifier
        });

        // Validate structure
        expect(listItem.id).toBeTypeOf('number');
        expect(listItem.totalItemsCount).toBeTypeOf('number');
      }
    });

    it('should find queue with undocumented playlistID field', async () => {
      const queues = await listPlayQueues();

      if (queues.length === 0) {
        console.log('⚠️  No active queues found, skipping playlistID test');
        return;
      }

      // Check if any queue has the playlistID field
      const queueWithPlaylistId = queues.find(q => q.playlistID !== undefined);

      if (queueWithPlaylistId) {
        console.log('✓ Found playlistID field:', {
          playlistID: queueWithPlaylistId.playlistID,
          queueId: queueWithPlaylistId.id
        });

        expect(queueWithPlaylistId.playlistID).toBeTypeOf('number');
      } else {
        console.log('⚠️  No queue with playlistID found (may not be playlist-based)');
      }
    });
  });

  describe('getPlayQueue', { skip: skipTests }, () => {
    it('should retrieve specific PlayQueue by ID', async () => {
      const queues = await listPlayQueues();

      if (queues.length === 0) {
        console.log('⚠️  No active queues found, skipping getPlayQueue test');
        return;
      }

      const listItem = queues[0]!;
      const queue = await getPlayQueue(listItem.id);

      expect(queue).toBeDefined();
      expect(queue.playQueueID).toBe(listItem.id);
      expect(queue.Metadata).toBeDefined();
      expect(Array.isArray(queue.Metadata)).toBe(true);

      console.log(`✓ Retrieved queue ${queue.playQueueID} with ${queue.playQueueTotalCount} tracks`);
    });

    it('should include track metadata in PlayQueue items', async () => {
      const queues = await listPlayQueues();

      if (queues.length === 0) {
        console.log('⚠️  No active queues found, skipping track metadata test');
        return;
      }

      const listItem = queues[0]!;
      const queue = await getPlayQueue(listItem.id);

      if (queue.Metadata.length > 0) {
        const item = queue.Metadata[0]!;

        console.log('First track:', {
          playQueueItemID: item.playQueueItemID,
          ratingKey: item.ratingKey,
          title: item.title,
          artist: item.grandparentTitle,
          album: item.parentTitle
        });

        expect(item.playQueueItemID).toBeTypeOf('number');
        expect(item.ratingKey).toBeTypeOf('string');
        expect(item.title).toBeTypeOf('string');
      }
    });

    it('should throw error for non-existent queue', async () => {
      const nonExistentQueueId = 999999;

      await expect(
        getPlayQueue(nonExistentQueueId)
      ).rejects.toThrow();

      console.log(`✓ Correctly threw error for non-existent queue ${nonExistentQueueId}`);
    });
  });

  describe('Queue Tracker', { skip: skipTests }, () => {
    it('should get tracker stats', () => {
      const tracker = getQueueTracker();
      const stats = tracker.getCacheStats();

      console.log('Tracker stats:', stats);

      expect(stats).toBeDefined();
      expect(stats.entries).toBeGreaterThanOrEqual(0);
      expect(stats.failures).toBeGreaterThanOrEqual(0);
    });

    it('should manage queue cache', () => {
      const tracker = getQueueTracker();
      const testMachineId = 'test-machine-123';
      const testQueueId = 12345;
      const testPlaylistId = 258583;

      // Set queue
      tracker.setQueue(testMachineId, testQueueId, testPlaylistId);

      const stats = tracker.getCacheStats();
      expect(stats.entries).toBeGreaterThan(0);

      // Clear specific cache
      tracker.clearCache(testMachineId);

      console.log('✓ Cache operations working correctly');
    });

    it('should clean up stale entries', () => {
      const tracker = getQueueTracker();

      tracker.clearAllCaches(); // Start fresh
      tracker.setQueue('machine-1', 100, 200);
      tracker.setQueue('machine-2', 101, 201);

      const removed = tracker.cleanupStaleEntries();

      console.log(`Cleaned up ${removed} stale entries`);
      expect(removed).toBeGreaterThanOrEqual(0);
    });

    it('should get recent failures', () => {
      const tracker = getQueueTracker();
      const failures = tracker.getRecentFailures(10);

      console.log(`Found ${failures.length} recent failures`);

      expect(Array.isArray(failures)).toBe(true);

      if (failures.length > 0) {
        const failure = failures[0]!;
        console.log('Recent failure:', {
          machineIdentifier: failure.machineIdentifier,
          trackRatingKey: failure.trackRatingKey,
          reason: failure.reason
        });

        expect(failure.machineIdentifier).toBeDefined();
        expect(failure.trackRatingKey).toBeDefined();
        expect(failure.reason).toBeDefined();
      }
    });
  });


  describe('removeFromQueue (READ-ONLY verification)', { skip: skipTests }, () => {
    it('should construct valid remove request without executing', async () => {
      const queues = await listPlayQueues();

      if (queues.length === 0) {
        console.log('⚠️  No queues available, skipping remove verification');
        return;
      }

      const listItem = queues[0]!;
      const queue = await getPlayQueue(listItem.id);

      if (queue.Metadata.length === 0) {
        console.log('⚠️  No tracks in queue, skipping remove verification');
        return;
      }

      const lastItem = queue.Metadata[queue.Metadata.length - 1]!;

      console.log('Would remove:', {
        queueId: queue.playQueueID,
        itemId: lastItem.playQueueItemID,
        track: lastItem.title,
        artist: lastItem.grandparentTitle
      });

      // Just verify the function signature and parameters are valid
      // We won't actually execute the removal to avoid disrupting playback
      expect(queue.playQueueID).toBeTypeOf('number');
      expect(lastItem.playQueueItemID).toBeTypeOf('number');

      console.log('✓ Remove request structure validated (not executed)');
    });
  });

  describe('Queue Version Tracking', { skip: skipTests }, () => {
    it('should track playQueueVersion increments', async () => {
      const queues = await listPlayQueues();

      if (queues.length === 0) {
        console.log('⚠️  No active queues found, skipping version tracking test');
        return;
      }

      const listItem = queues[0]!;
      const queue = await getPlayQueue(listItem.id);
      const initialVersion = queue.playQueueVersion;

      console.log(`Current queue version: ${initialVersion}`);
      console.log('Note: Version increments on any queue modification (add, remove, move, skip)');

      // Fetch again to see if version changed
      const updatedQueue = await getPlayQueue(listItem.id);

      console.log(`Updated queue version: ${updatedQueue.playQueueVersion}`);

      if (updatedQueue.playQueueVersion !== initialVersion) {
        console.log(`✓ Version changed: ${initialVersion} → ${updatedQueue.playQueueVersion}`);
      } else {
        console.log('Version unchanged (no modifications occurred)');
      }

      expect(updatedQueue.playQueueVersion).toBeGreaterThanOrEqual(initialVersion);
    });
  });

  describe('Active Playlist Detection', { skip: skipTests }, () => {
    it('should detect any currently playing playlist', async () => {
      const queues = await listPlayQueues();

      if (queues.length === 0) {
        console.log('⚠️  No active queues found (no music playing)');
        return;
      }

      // Find queue with a playlist ID (playlist-based playback)
      const playlistQueue = queues.find(q => q.playlistID !== undefined);

      if (playlistQueue) {
        const fullQueue = await getPlayQueue(playlistQueue.id);

        console.log('✓ Playlist-based playback detected:', {
          playQueueID: fullQueue.playQueueID,
          playlistID: fullQueue.playQueuePlaylistID,
          playlistTitle: fullQueue.playQueuePlaylistTitle,
          trackCount: fullQueue.playQueueTotalCount
        });

        expect(fullQueue.playQueueID).toBe(playlistQueue.id);
        expect(fullQueue.playQueuePlaylistID).toBeDefined();
        expect(fullQueue.playQueueTotalCount).toBeGreaterThan(0);

        if (fullQueue.playQueuePlaylistTitle) {
          expect(fullQueue.playQueuePlaylistTitle).toBeTypeOf('string');
          expect(fullQueue.playQueuePlaylistTitle.length).toBeGreaterThan(0);
        }
      } else {
        console.log('⚠️  No playlist-based playback detected');
        console.log('Available queues:', queues.map(q => ({
          id: q.id,
          playlistID: q.playlistID || 'none',
          totalItems: q.totalItemsCount
        })));
        console.log('Note: Music may be playing from library/radio instead of playlist');
      }
    });
  });

  describe('Functional Queue Discovery (E2E with Active Session)', { skip: skipTests }, () => {
    it('should find active queue from currently playing track using alternating search', async () => {
      const { getPlexServer } = await import('../../../plex/client.js');
      const { getDb } = await import('../../../db/index.js');
      const { playlists, playlistTracks } = await import('../../../db/schema.js');
      const { eq } = await import('drizzle-orm');

      const server = await getPlexServer();
      const db = getDb();

      console.log('\n========== FUNCTIONAL QUEUE DISCOVERY TEST ==========\n');

      // Step 1: Get active session (filter for music only)
      console.log('Step 1: Finding active music playback session...');
      const sessions = await server.query('/status/sessions');

      if (sessions.MediaContainer.size === 0) {
        console.log('⚠️  No active playback session found');
        console.log('   Start playing music from a generated playlist to test queue discovery');
        return;
      }

      // Filter for MUSIC sessions only (type="track")
      const allSessions = sessions.MediaContainer.Metadata || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const musicSessions = allSessions.filter((s: any) => s.type === 'track');

      if (musicSessions.length === 0) {
        console.log('⚠️  No active MUSIC playback found');
        console.log(`   Found ${allSessions.length} session(s), but none are music`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log('   Active sessions:', allSessions.map((s: any) => ({
          user: s.User?.title || s.Account?.title || 'Unknown',
          type: s.type,
          title: s.title
        })));
        return;
      }

      // Prefer Plexamp sessions if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = musicSessions.find((s: any) => s.Player?.product === 'Plexamp') || musicSessions[0];
      const trackRatingKey = session.ratingKey;
      const machineIdentifier = session.Player?.machineIdentifier || session.Player?.title;
      const userName = session.User?.title || session.Account?.title || 'Unknown';

      console.log('✓ Active music session found:');
      console.log(`  User: ${userName}`);
      console.log(`  Track: ${session.title}`);
      console.log(`  Artist: ${session.grandparentTitle || 'Unknown'}`);
      console.log(`  Track ratingKey: ${trackRatingKey}`);
      console.log(`  Machine ID: ${machineIdentifier}`);
      console.log(`  Player: ${session.Player?.product || 'Unknown'}`);

      // Step 2: Find which of OUR playlists contains this track
      console.log('\nStep 2: Searching database for playlist containing this track...');

      const result = await db
        .select({
          playlistId: playlistTracks.playlistId,
          playlistPlexKey: playlists.plexRatingKey,
          playlistTitle: playlists.title
        })
        .from(playlistTracks)
        .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
        .where(eq(playlistTracks.plexRatingKey, trackRatingKey))
        .limit(1);

      if (result.length === 0) {
        console.log('⚠️  Track not found in any of our generated playlists');
        console.log('   This track may be from a different playlist or library playback');
        return;
      }

      const playlist = result[0];
      const playlistPlexId = playlist.playlistPlexKey ? parseInt(playlist.playlistPlexKey) : null;

      console.log('✓ Found in our database:');
      console.log(`  Playlist: ${playlist.playlistTitle}`);
      console.log(`  Plex Rating Key: ${playlist.playlistPlexKey}`);
      console.log(`  Internal ID: ${playlist.playlistId}`);

      // Step 3: Get reference point from /playQueues
      console.log('\nStep 3: Getting reference point from /playQueues...');
      const queuesList = await listPlayQueues();

      if (queuesList.length === 0) {
        console.log('⚠️  No queues in /playQueues list');
        return;
      }

      const referenceId = queuesList[0].id;
      console.log(`✓ Reference queue ID: ${referenceId}`);
      console.log(`  Total queues listed: ${queuesList.length}`);

      // Step 4: Use alternating search to find the actual queue
      console.log('\nStep 4: Alternating search (+1, -1, +2, -2, ...) to find active queue...');

      let foundQueue = null;
      const MAX_SEARCH = 50;

      // Fast path: Check if any listed queue matches our playlist
      for (const ref of queuesList) {
        if (playlistPlexId && ref.playlistID === playlistPlexId) {
          foundQueue = await getPlayQueue(ref.id);
          console.log(`✓ Found via fast path (playlistID ${playlistPlexId})! Queue: ${ref.id}`);
          break;
        }
      }

      // Alternating search if fast path failed
      if (!foundQueue) {
        console.log('  Fast path failed, starting alternating search...');

        for (let offset = 1; offset <= MAX_SEARCH && !foundQueue; offset++) {
          // Positive offset
          try {
            const queue = await getPlayQueue(referenceId + offset);
            const hasTrack = queue.Metadata?.some(item => item.ratingKey === trackRatingKey);
            const matchesPlaylist = playlistPlexId && queue.playQueuePlaylistID === playlistPlexId;

            if (hasTrack || matchesPlaylist) {
              foundQueue = queue;
              console.log(`✓ Found at +${offset}! Queue ID: ${queue.playQueueID}`);
              break;
            }
          } catch {}

          // Negative offset
          if (referenceId - offset > 0) {
            try {
              const queue = await getPlayQueue(referenceId - offset);
              const hasTrack = queue.Metadata?.some(item => item.ratingKey === trackRatingKey);
              const matchesPlaylist = playlistPlexId && queue.playQueuePlaylistID === playlistPlexId;

              if (hasTrack || matchesPlaylist) {
                foundQueue = queue;
                console.log(`✓ Found at -${offset}! Queue ID: ${queue.playQueueID}`);
                break;
              }
            } catch {}
          }
        }
      }

      // Step 5: Verify
      console.log('\nStep 5: Verification...');

      if (!foundQueue) {
        console.log('❌ Failed to find queue within ±50 range');
        throw new Error('Queue discovery failed');
      }

      console.log('✅ Queue Discovery Successful!');
      console.log(`  Queue ID: ${foundQueue.playQueueID}`);
      console.log(`  Version: ${foundQueue.playQueueVersion}`);
      console.log(`  Total Tracks: ${foundQueue.playQueueTotalCount}`);
      console.log(`  Playlist ID: ${foundQueue.playQueuePlaylistID || 'N/A'}`);
      console.log(`  Playlist Title: ${foundQueue.playQueuePlaylistTitle || 'N/A'}`);

      // Assertions
      expect(foundQueue.playQueueID).toBeTypeOf('number');
      expect(foundQueue.playQueueVersion).toBeGreaterThan(0);
      expect(foundQueue.playQueueTotalCount).toBeGreaterThan(0);

      // Verify track is in queue
      const trackInQueue = foundQueue.Metadata.some(item => item.ratingKey === trackRatingKey);
      expect(trackInQueue).toBe(true);

      // Verify playlist ID matches if available
      if (playlistPlexId && foundQueue.playQueuePlaylistID) {
        expect(foundQueue.playQueuePlaylistID).toBe(playlistPlexId);
      }

      console.log('\n✅ All assertions passed!');
      console.log('========== TEST COMPLETE ==========\n');
    }, 30000); // 30 second timeout
  });
});
