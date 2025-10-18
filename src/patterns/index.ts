/**
 * Pattern Detection Module
 * Exports pattern analyzer, repository, and types
 */

export { analyzeUserPatterns } from './pattern-analyzer.js';
export {
  isCacheFresh,
  getCachedPatterns,
  savePatternsToCache,
  getPatternsWithCache,
  clearPatternsCache,
} from './pattern-repository.js';
export type {
  UserPatterns,
  HourlyGenrePreference,
  PatternAnalysisOptions,
  GenreHourAggregation,
} from './types.js';
