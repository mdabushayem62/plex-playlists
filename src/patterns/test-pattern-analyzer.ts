#!/usr/bin/env tsx
/**
 * Test script for pattern analyzer
 * Run: tsx src/patterns/test-pattern-analyzer.ts
 */

import 'dotenv/config';
import { analyzeUserPatterns } from './pattern-analyzer.js';
import { logger } from '../logger.js';

async function main() {
  logger.info('=== Testing Pattern Analyzer ===\n');

  try {
    // Analyze with default options (90 days)
    const patterns = await analyzeUserPatterns({
      lookbackDays: 90,
      minPlaysThreshold: 2,
      maxGenresPerHour: 10,
    });

    logger.info('\n=== Analysis Results ===');
    logger.info(`Sessions analyzed: ${patterns.sessionsAnalyzed}`);
    logger.info(`Date range: ${patterns.analyzedFrom.toISOString()} to ${patterns.analyzedTo.toISOString()}`);
    logger.info(`Peak hours: ${patterns.peakHours.join(', ')}`);
    logger.info(`Hourly genre preferences found: ${patterns.hourlyGenrePreferences.length}`);

    // Show top preferences for each peak hour
    logger.info('\n=== Top Genre Preferences by Peak Hour ===');
    for (const hour of patterns.peakHours.slice(0, 3)) {
      const prefsForHour = patterns.hourlyGenrePreferences
        .filter((p) => p.hour === hour)
        .slice(0, 5);

      logger.info(`\nHour ${hour}:00 (${prefsForHour.length} genres):`);
      for (const pref of prefsForHour) {
        logger.info(
          `  - ${pref.genre}: weight=${pref.weight.toFixed(3)}, plays=${pref.playCount}`
        );
      }
    }

    // Show distribution across all hours
    logger.info('\n=== Hourly Distribution ===');
    const hourCounts = new Map<number, number>();
    for (const pref of patterns.hourlyGenrePreferences) {
      hourCounts.set(pref.hour, (hourCounts.get(pref.hour) || 0) + 1);
    }

    const sortedHours = Array.from(hourCounts.entries()).sort((a, b) => a[0] - b[0]);
    for (const [hour, count] of sortedHours) {
      const bar = '█'.repeat(Math.ceil(count / 2));
      logger.info(`  ${hour.toString().padStart(2, '0')}:00 - ${count} genres ${bar}`);
    }

    logger.info('\n=== Pattern Analysis Complete ===');
  } catch (error) {
    logger.error({ error }, 'pattern analysis failed');
    if (error instanceof Error) {
      logger.error({ message: error.message }, 'Error message');
      logger.error({ stack: error.stack }, 'Stack trace');
    }
    process.exit(1);
  }
}

main();
