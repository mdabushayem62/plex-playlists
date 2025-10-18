#!/usr/bin/env tsx
/**
 * Test script for pattern repository
 * Run: tsx src/patterns/test-pattern-repository.ts
 */

import 'dotenv/config';
import {
  isCacheFresh,
  getCachedPatterns,
  savePatternsToCache,
  clearPatternsCache,
  getPatternsWithCache,
} from './pattern-repository.js';
import { analyzeUserPatterns } from './pattern-analyzer.js';
import { logger } from '../logger.js';

async function testRepository() {
  logger.info('=== Testing Pattern Repository ===\n');

  try {
    // Test 1: Check initial cache freshness
    logger.info('Test 1: Checking initial cache freshness...');
    const initiallyFresh = await isCacheFresh();
    logger.info(`  Cache fresh: ${initiallyFresh}`);

    // Test 2: Get cached patterns (may be null)
    logger.info('\nTest 2: Getting cached patterns...');
    const cachedPatterns = await getCachedPatterns();
    if (cachedPatterns) {
      logger.info('  Found cached patterns:');
      logger.info(`    Sessions analyzed: ${cachedPatterns.sessionsAnalyzed}`);
      logger.info(`    Last analyzed: ${cachedPatterns.lastAnalyzed.toISOString()}`);
      logger.info(`    Hourly preferences: ${cachedPatterns.hourlyGenrePreferences.length}`);
      logger.info(`    Peak hours: ${cachedPatterns.peakHours.join(', ')}`);
    } else {
      logger.info('  No cached patterns found');
    }

    // Test 3: Analyze and save patterns
    logger.info('\nTest 3: Analyzing and saving new patterns...');
    const newPatterns = await analyzeUserPatterns({
      lookbackDays: 30, // Use shorter window for faster testing
      minPlaysThreshold: 2,
      maxGenresPerHour: 5,
    });

    logger.info('  Pattern analysis complete:');
    logger.info(`    Sessions analyzed: ${newPatterns.sessionsAnalyzed}`);
    logger.info(`    Hourly preferences: ${newPatterns.hourlyGenrePreferences.length}`);
    logger.info(`    Peak hours: ${newPatterns.peakHours.join(', ')}`);

    await savePatternsToCache(newPatterns);
    logger.info('  ✓ Patterns saved to cache');

    // Test 4: Verify cache is now fresh
    logger.info('\nTest 4: Verifying cache is fresh after save...');
    const nowFresh = await isCacheFresh();
    logger.info(`  Cache fresh: ${nowFresh}`);
    if (!nowFresh) {
      logger.error('  ✗ ERROR: Cache should be fresh after save!');
    } else {
      logger.info('  ✓ Cache is fresh as expected');
    }

    // Test 5: Get patterns with automatic cache refresh
    logger.info('\nTest 5: Testing getPatternsWithCache (should use cache)...');
    const patternsFromCache = await getPatternsWithCache(false, analyzeUserPatterns);
    if (patternsFromCache) {
      logger.info('  ✓ Got patterns from cache:');
      logger.info(`    Sessions: ${patternsFromCache.sessionsAnalyzed}`);
      logger.info(`    Preferences: ${patternsFromCache.hourlyGenrePreferences.length}`);
    }

    // Test 6: Force refresh
    logger.info('\nTest 6: Testing force refresh...');
    const refreshedPatterns = await getPatternsWithCache(true, analyzeUserPatterns);
    if (refreshedPatterns) {
      logger.info('  ✓ Force refresh completed:');
      logger.info(`    Sessions: ${refreshedPatterns.sessionsAnalyzed}`);
      logger.info(`    Preferences: ${refreshedPatterns.hourlyGenrePreferences.length}`);
    }

    // Test 7: Sample data inspection
    logger.info('\nTest 7: Inspecting sample preferences...');
    if (refreshedPatterns && refreshedPatterns.hourlyGenrePreferences.length > 0) {
      logger.info('  Top 10 preferences:');
      refreshedPatterns.hourlyGenrePreferences.slice(0, 10).forEach((pref) => {
        logger.info(
          `    Hour ${pref.hour}:00 - ${pref.genre}: weight=${pref.weight.toFixed(3)}, plays=${pref.playCount}`
        );
      });
    }

    logger.info('\n=== All Repository Tests Passed ✓ ===');
  } catch (error) {
    logger.error({ error }, 'repository test failed');
    if (error instanceof Error) {
      logger.error({ message: error.message }, 'Error message');
      logger.error({ stack: error.stack }, 'Stack trace');
    }
    process.exit(1);
  }
}

async function _testCacheClear() {
  logger.info('\n=== Testing Cache Clear ===');

  try {
    await clearPatternsCache();
    logger.info('✓ Cache cleared');

    const isFresh = await isCacheFresh();
    logger.info(`Cache fresh after clear: ${isFresh} (should be false)`);

    if (isFresh) {
      logger.error('✗ ERROR: Cache should not be fresh after clear!');
    }
  } catch (error) {
    logger.error({ error }, 'cache clear test failed');
  }
}

async function main() {
  await testRepository();

  // Optionally test cache clear (uncomment to test)
  // await _testCacheClear();
}

main();
