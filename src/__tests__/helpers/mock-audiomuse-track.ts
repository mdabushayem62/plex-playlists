/**
 * Mock AudioMuse track data for testing
 */

import type { AudioMuseTrack } from '../../audiomuse/client.js';

export function createMockAudioMuseTrack(overrides: Partial<AudioMuseTrack> = {}): AudioMuseTrack {
  return {
    itemId: 'mock-item-id-123',
    title: 'Mock Track Title',
    author: 'Mock Artist',
    tempo: 120.0,
    key: 'C',
    scale: 'major',
    energy: 0.5,
    moodVector: new Map([
      ['electronic', 0.6],
      ['ambient', 0.4],
      ['rock', 0.3]
    ]),
    features: new Map([
      ['danceable', 0.7],
      ['aggressive', 0.3],
      ['happy', 0.6],
      ['party', 0.5],
      ['relaxed', 0.4],
      ['sad', 0.2]
    ]),
    ...overrides
  };
}

export const mockTracks = {
  foreverFree: createMockAudioMuseTrack({
    itemId: 'VBK2uTG5kmx1i4XOca6okK',
    title: 'Forever Free',
    author: 'Faithless',
    tempo: 125.0,
    key: 'E',
    scale: 'minor',
    energy: 0.23475888,
    moodVector: new Map([
      ['electronic', 0.590],
      ['ambient', 0.536],
      ['rock', 0.531],
      ['indie', 0.531],
      ['experimental', 0.524]
    ]),
    features: new Map([
      ['danceable', 0.92],
      ['aggressive', 0.36],
      ['happy', 0.30],
      ['party', 0.17],
      ['relaxed', 0.33],
      ['sad', 0.12]
    ])
  }),

  darkUniverseFanfare: createMockAudioMuseTrack({
    itemId: 'cO4ANOLQ0a8oj7mU8EFBoQ',
    title: 'Dark Universe Fanfare',
    author: 'Danny Elfman',
    tempo: 133.92857,
    key: 'F',
    scale: 'minor',
    energy: 0.16528332,
    moodVector: new Map([
      ['ambient', 0.562],
      ['electronic', 0.552],
      ['experimental', 0.538],
      ['instrumental', 0.532],
      ['rock', 0.530]
    ]),
    features: new Map([
      ['danceable', 0.44],
      ['aggressive', 0.11],
      ['happy', 0.11],
      ['party', 0.01],
      ['relaxed', 0.94],
      ['sad', 0.16]
    ])
  }),

  venus: createMockAudioMuseTrack({
    itemId: 'nmTyXQgILwSyxN7CTpafFE',
    title: 'Venus',
    author: 'Perturbator',
    tempo: 117.2,
    key: 'F',
    scale: 'minor',
    energy: 0.217,
    moodVector: new Map([
      ['electronic', 0.599],
      ['ambient', 0.553],
      ['electronica', 0.527],
      ['experimental', 0.526],
      ['instrumental', 0.519]
    ]),
    features: new Map([
      ['danceable', 0.81],
      ['aggressive', 0.51],
      ['happy', 0.07],
      ['party', 0.41],
      ['relaxed', 0.53],
      ['sad', 0.06]
    ])
  }),

  highEnergy: createMockAudioMuseTrack({
    itemId: 'high-energy-track',
    title: 'High Energy Track',
    author: 'Energetic Artist',
    tempo: 180.0,
    key: 'D',
    scale: 'major',
    energy: 0.95,
    moodVector: new Map([
      ['electronic', 0.8],
      ['dance', 0.7],
      ['party', 0.9]
    ]),
    features: new Map([
      ['danceable', 0.98],
      ['aggressive', 0.85],
      ['happy', 0.90],
      ['party', 0.95],
      ['relaxed', 0.05],
      ['sad', 0.02]
    ])
  }),

  lowEnergy: createMockAudioMuseTrack({
    itemId: 'low-energy-track',
    title: 'Ambient Chill',
    author: 'Calm Artist',
    tempo: 60.0,
    key: 'A',
    scale: 'minor',
    energy: 0.05,
    moodVector: new Map([
      ['ambient', 0.9],
      ['chillout', 0.8],
      ['instrumental', 0.7]
    ]),
    features: new Map([
      ['danceable', 0.10],
      ['aggressive', 0.02],
      ['happy', 0.20],
      ['party', 0.05],
      ['relaxed', 0.98],
      ['sad', 0.30]
    ])
  }),

  missingFeatures: createMockAudioMuseTrack({
    itemId: 'missing-features',
    title: 'Incomplete Track',
    author: 'Unknown Artist',
    tempo: null,
    key: null,
    scale: null,
    energy: null,
    moodVector: new Map(),
    features: new Map()
  })
};

/**
 * Create batch of mock tracks for bulk testing
 */
export function createMockAudioMuseTracks(count: number): AudioMuseTrack[] {
  return Array.from({ length: count }, (_, i) =>
    createMockAudioMuseTrack({
      itemId: `mock-item-${i}`,
      title: `Track ${i}`,
      author: `Artist ${i % 10}`, // 10 different artists
      tempo: 60 + (i % 180), // Vary tempo 60-240 BPM
      energy: (i % 100) / 100 // Vary energy 0-1
    })
  );
}
