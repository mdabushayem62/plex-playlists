import 'dotenv/config';
import { getPlayQueue } from '../src/plex/playqueue.js';

console.log('=== Testing Queue Persistence After Our Server Restart ===\n');

console.log('Queue 7140 was discovered when our server was running.');
console.log('Our server restarted (PID changed from 2152126 → 2153998).');
console.log('Testing if queue 7140 is STILL valid after OUR restart...\n');

try {
  const queue = await getPlayQueue(7140);
  console.log('✅ SUCCESS! Queue 7140 is still valid after our server restart!');
  console.log('\nQueue Details:');
  console.log(`  Queue ID: ${queue.playQueueID}`);
  console.log(`  Playlist ID: ${queue.playQueuePlaylistID}`);
  console.log(`  Playlist Title: ${queue.playQueuePlaylistTitle}`);
  console.log(`  Track count: ${queue.Metadata?.length || 0}`);
  console.log(`  Current track: ${queue.Metadata?.[0]?.title || 'unknown'}`);

  console.log('\n💡 CONCLUSION:');
  console.log('PlayQueue IDs persist across OUR server restarts!');
  console.log('We should NOT clear them from database on startup.');
  console.log('They only become invalid when PLEX server restarts or user creates new queue.');
} catch (e) {
  console.log('❌ FAILED! Queue 7140 is no longer valid.');
  console.log(`Error: ${e.message}`);
  console.log('\n💡 CONCLUSION:');
  console.log('Queue IDs become invalid after our server restarts.');
  console.log('Current behavior (clearing on startup) is correct.');
}
