/**
 * Comprehensive PlayQueue API Exploration
 * Systematically tests all PlayQueue-related endpoints to find better discovery methods
 *
 * Run this WHILE music is actively playing in Plexamp
 */
import 'dotenv/config';
import { getPlexServer } from '../src/plex/client.js';
import { listPlayQueues, getPlayQueue } from '../src/plex/playqueue.js';
import { getDb } from '../src/db/index.js';
import { adaptiveSessions } from '../src/db/schema.js';
import { desc } from 'drizzle-orm';

const server = await getPlexServer();
const db = getDb();

console.log('='.repeat(80));
console.log('PLAYQUEUE API EXPLORATION');
console.log('='.repeat(80));
console.log();

// Get our known session data for reference
const sessions = await db
  .select()
  .from(adaptiveSessions)
  .orderBy(desc(adaptiveSessions.updatedAt))
  .limit(1);

const knownSession = sessions[0];
if (knownSession) {
  console.log('📋 Known Session Data (from database):');
  console.log(`  machineIdentifier: ${knownSession.machineIdentifier}`);
  console.log(`  playQueueId: ${knownSession.playQueueId}`);
  console.log(`  playlistId: ${knownSession.playlistId}`);
  console.log();
}

// ============================================================================
// TEST 1: /playQueues Endpoint (Baseline)
// ============================================================================
console.log('TEST 1: /playQueues (List All Queues)');
console.log('-'.repeat(80));

try {
  const queues = await listPlayQueues();
  console.log(`Found ${queues.length} queue(s)\n`);

  for (const q of queues) {
    console.log(`Queue ${q.id}:`);
    console.log(JSON.stringify(q, null, 2));
    console.log();

    // Check against known session
    if (knownSession) {
      const matchesKnown = q.id === knownSession.playQueueId;
      const matchesClient = q.clientIdentifier === knownSession.machineIdentifier;
      console.log(`  ✓ Is known active queue? ${matchesKnown ? 'YES' : 'NO'}`);
      console.log(`  ✓ Matches machineIdentifier? ${matchesClient ? 'YES' : 'NO'}`);
      console.log();
    }
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ============================================================================
// TEST 2: /status/sessions (Active Playback Sessions)
// ============================================================================
console.log('\nTEST 2: /status/sessions (Active Playback)');
console.log('-'.repeat(80));

try {
  const sessionsResponse = await server.query('/status/sessions');
  const activeSessions = sessionsResponse.MediaContainer?.Metadata || [];

  console.log(`Found ${activeSessions.length} active session(s)\n`);

  for (const session of activeSessions) {
    console.log('Active Session:');
    console.log(JSON.stringify(session, null, 2));
    console.log();

    // Look for playQueue references
    const potentialQueueFields = Object.keys(session).filter(key =>
      key.toLowerCase().includes('queue') ||
      key.toLowerCase().includes('playlist')
    );

    if (potentialQueueFields.length > 0) {
      console.log('  🔍 Queue-related fields found:');
      potentialQueueFields.forEach(field => {
        console.log(`    - ${field}: ${session[field]}`);
      });
    } else {
      console.log('  ⚠️ No obvious queue-related fields');
    }
    console.log();
  }

  // Check Player object
  if (activeSessions.length > 0 && activeSessions[0].Player) {
    console.log('Player Object from Active Session:');
    console.log(JSON.stringify(activeSessions[0].Player, null, 2));
    console.log();

    if (knownSession) {
      const machineId = activeSessions[0].Player.machineIdentifier ||
                        activeSessions[0].Player.uuid ||
                        activeSessions[0].Player.title;
      const matches = machineId === knownSession.machineIdentifier;
      console.log(`  ✓ Matches known machineIdentifier? ${matches ? 'YES' : 'NO'}`);
      console.log();
    }
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ============================================================================
// TEST 3: /status/sessions/history/all (Recent History)
// ============================================================================
console.log('\nTEST 3: /status/sessions/history/all (Recent Plays)');
console.log('-'.repeat(80));

try {
  // Get last 5 plays
  const historyResponse = await server.query('/status/sessions/history/all', {
    sort: 'viewedAt:desc'
  });

  const historyEntries = historyResponse.MediaContainer?.Metadata || [];
  console.log(`Found ${historyEntries.length} recent play(s)\n`);

  for (let i = 0; i < Math.min(3, historyEntries.length); i++) {
    const entry = historyEntries[i];
    console.log(`History Entry ${i + 1}:`);

    // Look for queue references
    const queueFields = Object.keys(entry).filter(key =>
      key.toLowerCase().includes('queue')
    );

    if (queueFields.length > 0) {
      console.log('  🎯 Queue fields:');
      queueFields.forEach(field => {
        console.log(`    - ${field}: ${entry[field]}`);
      });
    } else {
      console.log('  ⚠️ No queue fields found');
    }

    // Show basic metadata
    console.log(`  Track: ${entry.title || 'Unknown'}`);
    console.log(`  Artist: ${entry.grandparentTitle || 'Unknown'}`);
    console.log(`  Viewed At: ${entry.viewedAt ? new Date(entry.viewedAt * 1000).toISOString() : 'Unknown'}`);
    console.log();
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ============================================================================
// TEST 4: Detailed Queue Inspection (if we have an active queue)
// ============================================================================
if (knownSession?.playQueueId) {
  console.log('\nTEST 4: /playQueues/{id} (Detailed Queue Inspection)');
  console.log('-'.repeat(80));

  try {
    const queue = await getPlayQueue(knownSession.playQueueId);

    console.log('Full Queue Object Structure:');
    console.log('TOP-LEVEL FIELDS:');
    Object.keys(queue).forEach(key => {
      if (key !== 'Metadata') {  // Skip the tracks array for now
        const value = queue[key];
        console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
      }
    });
    console.log();

    console.log(`Metadata array: ${queue.Metadata?.length || 0} tracks`);

    if (queue.Metadata && queue.Metadata.length > 0) {
      console.log('\nFirst Track Fields:');
      Object.keys(queue.Metadata[0]).forEach(key => {
        console.log(`  ${key}: ${typeof queue.Metadata[0][key]}`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// ============================================================================
// TEST 5: Search for Queue by Different Methods
// ============================================================================
console.log('\nTEST 5: Discovery Method Comparison');
console.log('-'.repeat(80));

if (knownSession?.playQueueId) {
  console.log(`Target Queue ID: ${knownSession.playQueueId}`);
  console.log(`Target Machine ID: ${knownSession.machineIdentifier}`);
  console.log();

  // Method 1: Direct lookup in /playQueues list
  const queues = await listPlayQueues();
  const foundInList = queues.find(q => q.id === knownSession.playQueueId);
  console.log(`Method 1 - /playQueues list: ${foundInList ? '✅ FOUND' : '❌ NOT FOUND'}`);

  // Method 2: Active sessions
  try {
    const sessionsResp = await server.query('/status/sessions');
    const sessions = sessionsResp.MediaContainer?.Metadata || [];
    const sessionWithMatchingPlayer = sessions.find(s => {
      const machineId = s.Player?.machineIdentifier || s.Player?.uuid || s.Player?.title;
      return machineId === knownSession.machineIdentifier;
    });
    console.log(`Method 2 - /status/sessions: ${sessionWithMatchingPlayer ? '✅ FOUND matching player' : '❌ NO matching player'}`);

    if (sessionWithMatchingPlayer) {
      // Look for any queue ID in the session
      const hasQueueId = Object.keys(sessionWithMatchingPlayer).some(k =>
        k.toLowerCase().includes('queue') && sessionWithMatchingPlayer[k]
      );
      console.log(`  Contains queue ID field? ${hasQueueId ? 'YES' : 'NO'}`);
    }
  } catch (error) {
    console.log(`Method 2 - /status/sessions: ❌ ERROR - ${error.message}`);
  }

  // Method 3: Brute force (test ±10 range)
  console.log('\nMethod 3 - Brute force search (±10 sample):');
  const maxQueueId = Math.max(...queues.map(q => q.id));
  let foundViaBrute = false;
  let foundOffset = 0;

  for (let offset = 0; offset <= 10; offset++) {
    try {
      const testId = maxQueueId + offset;
      const testQueue = await getPlayQueue(testId);
      if (testQueue && testId === knownSession.playQueueId) {
        foundViaBrute = true;
        foundOffset = offset;
        break;
      }
    } catch {
      // Queue doesn't exist, continue
    }

    if (offset > 0) {
      try {
        const testId = maxQueueId - offset;
        const testQueue = await getPlayQueue(testId);
        if (testQueue && testId === knownSession.playQueueId) {
          foundViaBrute = true;
          foundOffset = -offset;
          break;
        }
      } catch {
        // Queue doesn't exist, continue
      }
    }
  }

  console.log(`  ${foundViaBrute ? `✅ FOUND at offset ${foundOffset > 0 ? '+' : ''}${foundOffset}` : '❌ NOT FOUND in ±10 range'}`);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('EXPLORATION SUMMARY');
console.log('='.repeat(80));
console.log();
console.log('Key Findings:');
console.log('1. Check if /status/sessions includes playQueueId or similar field');
console.log('2. Check if Player object has reliable machineIdentifier correlation');
console.log('3. Verify if history API includes queue context');
console.log('4. Document all undocumented fields found');
console.log();
console.log('Next Steps Based on Findings:');
console.log('- If sessions API has queue ID → Use direct lookup');
console.log('- If sessions API has player correlation → Filter before search');
console.log('- If no direct method found → Keep brute force with ±200');
console.log();
