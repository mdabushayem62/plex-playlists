import type { Track } from '@ctrl/plex';

import { logger } from '../logger.js';
import { candidateFromTrack, type CandidateTrack } from './candidate-builder.js';

interface ExpandOptions {
  seeds: CandidateTrack[];
  exclude: Set<string>;
  needed: number;
  maxSeeds?: number;
  perSeed?: number;
  maxDistance?: number;
}

const DEFAULT_MAX_SEEDS = 10;
const DEFAULT_PER_SEED = 15;
const DEFAULT_MAX_DISTANCE = 0.25;

export const expandWithSonicSimilarity = async ({
  seeds,
  exclude,
  needed,
  maxSeeds = DEFAULT_MAX_SEEDS,
  perSeed = DEFAULT_PER_SEED,
  maxDistance = DEFAULT_MAX_DISTANCE
}: ExpandOptions): Promise<CandidateTrack[]> => {
  const results: CandidateTrack[] = [];
  const seen = new Set<string>();
  const limitedSeeds = seeds.slice(0, maxSeeds);

  for (const seed of limitedSeeds) {
    try {
      const similars = await seed.track.sonicallySimilar(perSeed, maxDistance);
      for (const similar of similars as Track[]) {
        const ratingKey = similar.ratingKey?.toString();
        if (!ratingKey) {
          continue;
        }
        if (exclude.has(ratingKey) || seen.has(ratingKey)) {
          continue;
        }
        seen.add(ratingKey);
        const candidate = await candidateFromTrack(similar, {
          playCount: similar.viewCount ?? 0,
          lastPlayedAt: similar.lastViewedAt ?? null
        });
        results.push(candidate);
        if (results.length >= needed * 2) {
          return results;
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'sonicallySimilar fetch failed, continuing');
    }
  }

  return results;
};
