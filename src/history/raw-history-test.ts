/**
 * Test raw Plex history API to debug parsing issue
 */

import { getPlexServer } from '../plex/client.js';
import { subDays } from 'date-fns';

interface HistoryMetadatum {
  title?: string;
  type?: string;
  grandparentTitle?: string;
  viewedAt?: number;
}

interface HistoryMediaContainer {
  size: number;
  Metadata?: HistoryMetadatum[];
}

export async function testRawHistory() {
  const server = await getPlexServer();
  const mindate = subDays(new Date(), 90);

  console.log('\n=== Testing Raw Plex History API ===\n');
  console.log(`Server: ${server.friendlyName}`);
  console.log(`Date range: ${mindate.toISOString()} to ${new Date().toISOString()}`);

  // Get music library section ID
  const library = await server.library();
  const sections = await library.sections();
  const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');
  const musicSectionId = musicSection?.key;

  console.log(`Music Library Section ID: ${musicSectionId}\n`);

  // Test 1: Use the raw query method to bypass @ctrl/plex parsing
  try {
    const mindateTimestamp = Math.floor(mindate.getTime() / 1000);

    // Query WITH section filter for music
    const historyPath = `/status/sessions/history/all?mindate=${mindateTimestamp}&librarySectionID=${musicSectionId}&X-Plex-Container-Size=100&X-Plex-Container-Start=0`;

    console.log(`\nQuerying (filtered to music): ${historyPath}\n`);

    const rawResponse = await server.query(historyPath, 'get');

    console.log('Raw Response Type:', typeof rawResponse);
    console.log('Raw Response Keys:', Object.keys(rawResponse || {}));
    console.log('\nFull Response:');
    console.log(JSON.stringify(rawResponse, null, 2));

    // Check if response has MediaContainer
    if (rawResponse && typeof rawResponse === 'object') {
      const container = (rawResponse as { MediaContainer?: HistoryMediaContainer }).MediaContainer;
      if (container) {
        console.log('\nMediaContainer found!');
        console.log('Size:', container.size);
        console.log('Metadata count:', container.Metadata?.length || 0);

        if (container.Metadata && container.Metadata.length > 0) {
          console.log('\nFirst 3 history entries:');
          container.Metadata.slice(0, 3).forEach((item: HistoryMetadatum, i: number) => {
            console.log(`\n  Entry ${i + 1}:`);
            console.log(`    Title: ${item.title}`);
            console.log(`    Type: ${item.type}`);
            console.log(`    Artist: ${item.grandparentTitle || 'N/A'}`);
            console.log(`    Viewed At: ${item.viewedAt ? new Date(item.viewedAt * 1000).toISOString() : 'Unknown'}`);
          });
        }
      }
    }
  } catch (error) {
    console.error('Error querying raw history:', error);
  }

  console.log('\n=== End Raw History Test ===\n');
}
