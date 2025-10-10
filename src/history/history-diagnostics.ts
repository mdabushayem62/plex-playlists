/**
 * History Diagnostics
 * Tools to diagnose Plex history tracking issues
 */

import { getPlexServer } from '../plex/client.js';
import { logger } from '../logger.js';
import { subDays } from 'date-fns';
import { testRawHistory } from './raw-history-test.js';

interface HistoryMetadatum {
  type?: string;
  title?: string;
  grandparentTitle?: string;
  viewedAt?: number;
  accountID?: number;
}

interface SampleEntry {
  title: string;
  artist: string;
  type: string;
  viewedAt: string;
  accountID: string | number;
}

interface HistoryDiagnostics {
  serverConnected: boolean;
  musicLibraryFound: boolean;
  musicLibrarySectionId?: string;
  historyAvailable: boolean;
  historyEntryCount: number;
  trackEntryCount: number;
  dateRangeTested: {
    from: Date;
    to: Date;
  };
  sampleEntries: SampleEntry[];
  recommendations: string[];
}

/**
 * Run comprehensive diagnostics on Plex history functionality
 */
export async function diagnoseHistory(): Promise<HistoryDiagnostics> {
  const result: HistoryDiagnostics = {
    serverConnected: false,
    musicLibraryFound: false,
    historyAvailable: false,
    historyEntryCount: 0,
    trackEntryCount: 0,
    dateRangeTested: {
      from: subDays(new Date(), 90), // Test 90 days
      to: new Date()
    },
    sampleEntries: [],
    recommendations: []
  };

  try {
    // Step 0: Test raw history API first
    await testRawHistory();

    // Step 1: Connect to server
    logger.info('Testing Plex server connection...');
    const server = await getPlexServer();
    result.serverConnected = true;
    logger.info({
      friendlyName: server.friendlyName,
      version: server.version,
      myPlexUsername: server.myPlexUsername
    }, 'Connected to Plex server');

    // Step 2: Find music library
    logger.info('Looking for music library section...');
    const library = await server.library();
    const sections = await library.sections();
    const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');

    if (!musicSection) {
      result.recommendations.push('No music library section found. Please create a music library in Plex.');
      return result;
    }

    result.musicLibraryFound = true;
    result.musicLibrarySectionId = musicSection.key;
    logger.info({
      sectionId: musicSection.key,
      title: musicSection.title,
      type: musicSection.type
    }, 'Found music library section');

    // Step 3: Test history API with different parameters
    logger.info('Testing history API (this may take a moment)...');

    // Test 1: Basic history query (no filters)
    const basicHistory = await server.history(100, subDays(new Date(), 90));
    logger.info({ entries: basicHistory?.length || 0 }, 'Basic history query (90 days, all types)');

    // Debug: Log structure of first entry
    if (basicHistory && basicHistory.length > 0) {
      logger.debug(
        {
          historyIsArray: Array.isArray(basicHistory),
          historyLength: basicHistory.length,
          firstEntry: basicHistory[0],
          firstEntryType: typeof basicHistory[0],
          firstEntryConstructor: basicHistory[0]?.constructor?.name,
          keys: Object.keys(basicHistory[0] || {}),
          rawJSON: JSON.stringify(basicHistory[0], null, 2)
        },
        'Sample basic history entry debug'
      );
    }

    // Test 2: History with library section ID
    const sectionHistory = await server.history(
      100,
      subDays(new Date(), 90),
      undefined, // ratingKey
      undefined, // accountId
      musicSection.key // librarySectionId
    );
    logger.info({ entries: sectionHistory?.length || 0 }, 'Section-filtered history (90 days, music only)');

    // Debug: Log structure of first section entry
    if (sectionHistory && sectionHistory.length > 0) {
      logger.debug(
        {
          firstEntry: sectionHistory[0],
          keys: Object.keys(sectionHistory[0] || {})
        },
        'Sample section-filtered history entry'
      );
    }

    // Use the larger result set
    const history = (sectionHistory?.length || 0) > (basicHistory?.length || 0)
      ? sectionHistory
      : basicHistory;

    if (!history || !Array.isArray(history)) {
      result.recommendations.push('History API returned invalid data. This may indicate a Plex server issue.');
      return result;
    }

    result.historyAvailable = history.length > 0;
    result.historyEntryCount = history.length;

    // Filter for track entries
    const trackEntries = history.filter((item: HistoryMetadatum) => item?.type === 'track');
    result.trackEntryCount = trackEntries.length;

    // Get sample entries
    result.sampleEntries = trackEntries.slice(0, 5).map((item: HistoryMetadatum): SampleEntry => ({
      title: item?.title || 'Unknown',
      artist: item?.grandparentTitle || 'Unknown',
      type: item?.type || 'unknown',
      viewedAt: item?.viewedAt ? new Date(item.viewedAt * 1000).toISOString() : 'Unknown',
      accountID: item?.accountID || 'unknown'
    }));

    logger.info({
      totalEntries: result.historyEntryCount,
      trackEntries: result.trackEntryCount,
      sampleCount: result.sampleEntries.length
    }, 'History analysis complete');

    // Step 4: Generate recommendations
    if (result.historyEntryCount === 0) {
      result.recommendations.push(
        'No play history found in the last 90 days.',
        'Verify that you are signed into Plex with your account (required for history tracking).',
        'Check Plex Settings → Library → "Allow media deletion" is enabled (required for history).',
        'Play some music tracks in Plex to generate history entries.'
      );
    } else if (result.trackEntryCount === 0) {
      result.recommendations.push(
        `Found ${result.historyEntryCount} history entries, but none are music tracks.`,
        'Play some music tracks in Plex to generate music history.',
        `Other media types found: ${[...new Set(history.map((h: HistoryMetadatum) => h.type))].join(', ')}`
      );
    } else if (result.trackEntryCount < 10) {
      result.recommendations.push(
        `Only ${result.trackEntryCount} music tracks found in history.`,
        'For better playlist quality, play more music to build up your listening history.',
        'The system will use fallback candidates based on ratings and play counts.'
      );
    } else {
      result.recommendations.push(
        `✓ Found ${result.trackEntryCount} music tracks in history.`,
        'History tracking is working correctly!'
      );
    }

  } catch (error) {
    logger.error({ error }, 'History diagnostics failed');
    result.recommendations.push(
      `Error during diagnostics: ${error instanceof Error ? error.message : String(error)}`,
      'Check Plex server connection and credentials.'
    );
  }

  return result;
}

/**
 * Print diagnostics in human-readable format
 */
export function printDiagnostics(diagnostics: HistoryDiagnostics): void {
  console.log('\n=== Plex History Diagnostics ===\n');

  console.log('Server Connection:', diagnostics.serverConnected ? '✓' : '✗');
  console.log('Music Library:', diagnostics.musicLibraryFound ? '✓' : '✗');
  if (diagnostics.musicLibrarySectionId) {
    console.log(`  Section ID: ${diagnostics.musicLibrarySectionId}`);
  }

  console.log(`\nHistory Entries Found: ${diagnostics.historyEntryCount}`);
  console.log(`  Music Tracks: ${diagnostics.trackEntryCount}`);
  console.log(`  Date Range: ${diagnostics.dateRangeTested.from.toLocaleDateString()} to ${diagnostics.dateRangeTested.to.toLocaleDateString()}`);

  if (diagnostics.sampleEntries.length > 0) {
    console.log('\nSample Recent Plays:');
    diagnostics.sampleEntries.forEach((entry, i) => {
      console.log(`  ${i + 1}. ${entry.artist} - ${entry.title}`);
      console.log(`     Played: ${new Date(entry.viewedAt).toLocaleString()}`);
    });
  }

  if (diagnostics.recommendations.length > 0) {
    console.log('\n Recommendations:');
    diagnostics.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
  }

  console.log('\n================================\n');
}
