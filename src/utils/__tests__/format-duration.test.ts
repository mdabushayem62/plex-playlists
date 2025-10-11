import { describe, it, expect } from 'vitest';
import { formatDuration, calculateTotalDuration } from '../format-duration.js';

describe('formatDuration', () => {
  it('formats zero or negative duration', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-100)).toBe('0m');
  });

  it('formats durations under 1 minute', () => {
    expect(formatDuration(30000)).toBe('1m'); // 30 seconds rounds up
    expect(formatDuration(45000)).toBe('1m'); // 45 seconds rounds up
  });

  it('formats durations under 1 hour', () => {
    expect(formatDuration(125000)).toBe('3m'); // 2m 5s rounds up to 3m
    expect(formatDuration(180000)).toBe('3m'); // 3 minutes exactly
    expect(formatDuration(3540000)).toBe('59m'); // 59 minutes
  });

  it('formats durations over 1 hour', () => {
    expect(formatDuration(3600000)).toBe('1h'); // 1 hour exactly
    expect(formatDuration(3665000)).toBe('1h 2m'); // 1h 1m 5s rounds up to 1h 2m
    expect(formatDuration(7200000)).toBe('2h'); // 2 hours exactly
    expect(formatDuration(12345000)).toBe('3h 26m'); // 3h 25m 45s rounds up to 3h 26m
  });

  it('formats long durations', () => {
    expect(formatDuration(36000000)).toBe('10h'); // 10 hours
    expect(formatDuration(86400000)).toBe('24h'); // 24 hours
  });
});

describe('calculateTotalDuration', () => {
  it('returns 0 for empty array', () => {
    expect(calculateTotalDuration([])).toBe(0);
  });

  it('sums durations from array of items', () => {
    const items = [
      { duration: 180000 }, // 3 minutes
      { duration: 240000 }, // 4 minutes
      { duration: 300000 }, // 5 minutes
    ];
    expect(calculateTotalDuration(items)).toBe(720000); // 12 minutes
  });

  it('handles items without duration', () => {
    const items = [
      { duration: 180000 },
      { duration: undefined },
      { duration: 240000 },
    ];
    expect(calculateTotalDuration(items)).toBe(420000); // 7 minutes
  });

  it('handles mixed objects with other properties', () => {
    const items = [
      { title: 'Track 1', duration: 180000 },
      { title: 'Track 2', duration: 240000 },
    ];
    expect(calculateTotalDuration(items)).toBe(420000);
  });
});
