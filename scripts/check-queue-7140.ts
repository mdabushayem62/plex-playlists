import 'dotenv/config';
import { getPlayQueue } from '../src/plex/playqueue.js';

console.log('=== Checking Active Queue 7140 ===');
try {
  const queue = await getPlayQueue(7140);
  console.log('Queue ID:', queue.playQueueID);
  console.log('playQueuePlaylistID:', queue.playQueuePlaylistID);
  console.log('playQueuePlaylistTitle:', queue.playQueuePlaylistTitle);
  console.log('Track count:', queue.Metadata?.length || 0);
  console.log('First track:', queue.Metadata?.[0]?.title || 'none');
} catch (e) {
  console.log('Error:', e.message);
}
