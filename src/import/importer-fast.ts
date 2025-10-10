import type { MusicSection, Section, Track } from '@ctrl/plex';
import pLimit from 'p-limit';
import { getPlexServer } from '../plex/client.js';
import { logger } from '../logger.js';
import { parseAllFiles } from './file-parser.js';
import { findBestMatch } from './track-matcher.js';
import { calculateRating, getDefaultRatingConfig } from './rating-calculator.js';
import { setTrackRating } from './plex-rating.js';
import type { ImportResult, RatingConfig, NormalizedTrack } from './types.js';

const isMusicSection = (section: Section): section is MusicSection =>
  (section as MusicSection).searchTracks !== undefined && section.CONTENT_TYPE === 'audio';

const findMusicSection = async (): Promise<MusicSection> => {
  const server = await getPlexServer();
  const library = await server.library();
  const sections = await library.sections();
  const musicSection = sections.find(isMusicSection);

  if (!musicSection) {
    throw new Error('No music library section found');
  }

  return musicSection;
};

/**
 * Fetch ALL tracks from Plex library in one go
 * Build an artist index for fast local lookups
 */
const fetchAllTracksAndBuildIndex = async (
  musicSection: MusicSection
): Promise<Map<string, Track[]>> => {
  logger.info('Fetching all tracks from Plex library (this may take a minute)...');

  const allTracks: Track[] = [];
  const seenRatingKeys = new Set<string>();
  let offset = 0;
  const batchSize = 10000; // Larger batches to reduce API calls

  // Paginate through all tracks
  while (true) {
    try {
      const batch = (await musicSection.searchTracks({
        libtype: 'track',
        maxresults: batchSize,
        offset
      })) as Track[];

      if (!batch || batch.length === 0) {
        break;
      }

      // Check for duplicates (indicates offset isn't working and we're looping)
      let newTracksCount = 0;
      for (const track of batch) {
        const ratingKey = track.ratingKey?.toString();
        if (ratingKey && !seenRatingKeys.has(ratingKey)) {
          seenRatingKeys.add(ratingKey);
          allTracks.push(track);
          newTracksCount++;
        }
      }

      logger.info(
        {
          batchSize: batch.length,
          newTracks: newTracksCount,
          totalUnique: allTracks.length,
          offset
        },
        'Fetching tracks progress'
      );

      // If we got no new tracks, we're done (offset pagination not working)
      if (newTracksCount === 0) {
        logger.info('No new tracks in batch, pagination complete');
        break;
      }

      offset += batch.length;

      // If we got fewer results than requested, we've reached the end
      if (batch.length < batchSize) {
        break;
      }
    } catch (error) {
      logger.error({ offset, error }, 'Failed to fetch track batch');
      break;
    }
  }

  logger.info({ totalTracks: allTracks.length }, 'Completed fetching all tracks from Plex');

  // Build artist index (artist name -> tracks)
  const artistIndex = new Map<string, Track[]>();

  for (const track of allTracks) {
    const artist = track.grandparentTitle; // Artist name
    if (!artist) {
      continue;
    }

    const normalizedArtist = artist.toLowerCase();
    const existing = artistIndex.get(normalizedArtist);

    if (existing) {
      existing.push(track);
    } else {
      artistIndex.set(normalizedArtist, [track]);
    }
  }

  logger.info(
    { uniqueArtists: artistIndex.size, totalTracks: allTracks.length },
    'Built artist index'
  );

  return artistIndex;
};

/**
 * Split artist string and try to find tracks for any of the artists
 * Handles multi-artist collaborations like "Artist1;Artist2" or "Artist1 & Artist2"
 */
const findTracksForArtist = (artistString: string, artistIndex: Map<string, Track[]>): Track[] => {
  // Try exact match first
  const exactMatch = artistIndex.get(artistString.toLowerCase());
  if (exactMatch && exactMatch.length > 0) {
    return exactMatch;
  }

  // Split by common separators: semicolon, slash, ampersand
  const artistNames = artistString
    .split(/[;\/&]/)
    .map(name => name.trim())
    .filter(name => name.length > 0);

  // Collect all tracks from any of the artists
  const allTracks: Track[] = [];
  const seenRatingKeys = new Set<string>();

  for (const artistName of artistNames) {
    const tracks = artistIndex.get(artistName.toLowerCase()) || [];
    for (const track of tracks) {
      const ratingKey = track.ratingKey?.toString();
      if (ratingKey && !seenRatingKeys.has(ratingKey)) {
        seenRatingKeys.add(ratingKey);
        allTracks.push(track);
      }
    }
  }

  return allTracks;
};

/**
 * Process tracks in parallel using the pre-built artist index
 */
const processTracksWithIndex = async (
  tracks: NormalizedTrack[],
  artistIndex: Map<string, Track[]>,
  config: RatingConfig,
  dryRun: boolean,
  concurrency: number = 10
): Promise<ImportResult> => {
  const limit = pLimit(concurrency);
  const result: ImportResult = {
    totalTracks: tracks.length,
    matchedTracks: 0,
    ratingsSet: 0,
    skippedExisting: 0,
    errors: []
  };

  let processed = 0;
  const progressInterval = Math.max(1, Math.floor(tracks.length / 20)); // Report every 5%

  logger.info({ totalTracks: tracks.length, concurrency }, 'Starting track processing');

  const processingPromises = tracks.map(normalizedTrack =>
    limit(async () => {
      processed++;

      if (processed % progressInterval === 0 || processed === tracks.length) {
        logger.info(
          {
            processed,
            total: result.totalTracks,
            progress: `${((processed / result.totalTracks) * 100).toFixed(1)}%`,
            matched: result.matchedTracks,
            rated: result.ratingsSet
          },
          'Processing progress'
        );
      }

      try {
        // Fast local lookup from pre-built index (handles multi-artist splits)
        const plexTracks = findTracksForArtist(normalizedTrack.artist, artistIndex);

        if (plexTracks.length === 0) {
          result.errors.push(`No results: ${normalizedTrack.artist} - ${normalizedTrack.title}`);
          return;
        }

        // Find best match using fuzzy matching (local CPU, very fast)
        const bestMatch = findBestMatch(normalizedTrack, plexTracks);

        if (!bestMatch) {
          result.errors.push(`No match: ${normalizedTrack.artist} - ${normalizedTrack.title}`);
          return;
        }

        result.matchedTracks++;

        // Calculate rating based on source playlists
        const starRating = calculateRating(normalizedTrack, config);

        // Set rating (will skip if track already has a rating)
        const wasSet = await setTrackRating(bestMatch, starRating, dryRun);

        if (wasSet) {
          result.ratingsSet++;
        } else if (bestMatch.userRating != null) {
          result.skippedExisting++;
        }
      } catch (error) {
        const errorMsg = `Error processing ${normalizedTrack.artist} - ${normalizedTrack.title}: ${error}`;
        logger.error({ track: normalizedTrack, error }, 'Failed to process track');
        result.errors.push(errorMsg);
      }
    })
  );

  await Promise.all(processingPromises);

  return result;
};

export const importRatingsFromCSVs = async (
  csvDirectoryPath: string,
  dryRun: boolean = false,
  ratingConfig?: RatingConfig,
  concurrency: { process?: number } = {}
): Promise<ImportResult> => {
  const config = ratingConfig || getDefaultRatingConfig();
  const processConcurrency = concurrency.process || 10;

  logger.info(
    {
      csvDirectoryPath,
      dryRun,
      ratingConfig: config,
      processConcurrency
    },
    'Starting optimized rating import'
  );

  // Parse all CSV and JSON files
  const trackMap = parseAllFiles(csvDirectoryPath);
  const tracks = Array.from(trackMap.values());

  if (tracks.length === 0) {
    logger.warn('No tracks found in CSV or JSON files');
    return {
      totalTracks: 0,
      matchedTracks: 0,
      ratingsSet: 0,
      skippedExisting: 0,
      errors: []
    };
  }

  logger.info({ totalTracks: tracks.length }, 'Parsed CSV and JSON tracks');

  // Get Plex music section
  const musicSection = await findMusicSection();

  // Fetch ALL tracks once and build artist index
  const artistIndex = await fetchAllTracksAndBuildIndex(musicSection);

  // Process tracks in parallel using the index (no more Plex API calls for searching)
  const result = await processTracksWithIndex(tracks, artistIndex, config, dryRun, processConcurrency);

  logger.info(
    {
      totalTracks: result.totalTracks,
      matchedTracks: result.matchedTracks,
      ratingsSet: result.ratingsSet,
      skippedExisting: result.skippedExisting,
      errorCount: result.errors.length,
      matchRate: `${((result.matchedTracks / result.totalTracks) * 100).toFixed(1)}%`,
      dryRun
    },
    'Rating import complete'
  );

  return result;
};
