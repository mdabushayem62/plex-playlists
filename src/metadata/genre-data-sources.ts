/**
 * Genre Data Sources
 * Loads and provides access to EveryNoise and Voltraco genre datasets
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'genre-similarity');

// ============================================================================
// EveryNoise Data Source (5,453 genres with x,y coordinates)
// ============================================================================

interface EveryNoiseGenre {
  genre: string;
  x: number;
  y: number;
  hex_colour: string;
}

export class EveryNoiseDataSource {
  private genres: Map<string, EveryNoiseGenre> = new Map();
  private loaded = false;

  /**
   * Load genre data from CSV file
   * Called lazily on first use
   */
  private load(): void {
    if (this.loaded) return;

    try {
      const csvPath = path.join(DATA_DIR, 'everynoise-attrs.csv');

      if (!fs.existsSync(csvPath)) {
        logger.warn({ csvPath }, 'EveryNoise dataset not found');
        this.loaded = true;
        return;
      }

      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n').slice(1); // Skip header

      for (const line of lines) {
        if (!line.trim()) continue;

        // Parse CSV line: genre,x,y,hex_colour
        const match = line.match(/^([^,]+),(-?\d+),(-?\d+),([^,\s]+)/);
        if (match) {
          const [, genre, x, y, hex] = match;
          this.genres.set(genre.toLowerCase(), {
            genre,
            x: parseInt(x),
            y: parseInt(y),
            hex_colour: hex
          });
        }
      }

      logger.info({ genreCount: this.genres.size }, 'EveryNoise genre data loaded');
      this.loaded = true;
    } catch (error) {
      logger.error({ error }, 'failed to load EveryNoise data');
      this.loaded = true;
    }
  }

  /**
   * Calculate Euclidean distance between two genres
   */
  private calculateDistance(g1: EveryNoiseGenre, g2: EveryNoiseGenre): number {
    const dx = g1.x - g2.x;
    const dy = g1.y - g2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if two genres are similar based on distance threshold
   * Threshold of 1220 calibrated from test pairs (power metal/heavy metal, techno/house, etc)
   */
  areGenresSimilar(genre1: string, genre2: string, threshold = 1220): boolean {
    this.load();

    const g1 = this.genres.get(genre1.toLowerCase());
    const g2 = this.genres.get(genre2.toLowerCase());

    if (!g1 || !g2) {
      return false;
    }

    const distance = this.calculateDistance(g1, g2);
    return distance <= threshold;
  }

  /**
   * Get all similar genres for a given genre
   */
  getSimilarGenres(genre: string, threshold = 1220, limit = 20): string[] {
    this.load();

    const target = this.genres.get(genre.toLowerCase());
    if (!target) {
      return [];
    }

    const distances: Array<{ genre: string; distance: number }> = [];

    for (const [name, data] of this.genres.entries()) {
      if (name === genre.toLowerCase()) continue;

      const distance = this.calculateDistance(target, data);
      if (distance <= threshold) {
        distances.push({ genre: name, distance });
      }
    }

    // Sort by distance and return top N
    return distances
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(d => d.genre);
  }

  /**
   * Check if a genre exists in the dataset
   */
  hasGenre(genre: string): boolean {
    this.load();
    return this.genres.has(genre.toLowerCase());
  }

  /**
   * Get total number of genres
   */
  getGenreCount(): number {
    this.load();
    return this.genres.size;
  }
}

// ============================================================================
// Voltraco Data Source (736 genres in 17 hierarchical categories)
// ============================================================================

interface VoltracoTaxonomy {
  [category: string]: string[];
}

export class VoltracoDataSource {
  private genreToCategory: Map<string, string> = new Map(); // genre -> parent category
  private categoryToGenres: Map<string, Set<string>> = new Map(); // category -> genres
  private loaded = false;

  /**
   * Load genre taxonomy from JSON file
   * Called lazily on first use
   */
  private load(): void {
    if (this.loaded) return;

    try {
      const jsonPath = path.join(DATA_DIR, 'voltraco-genres.json');

      if (!fs.existsSync(jsonPath)) {
        logger.warn({ jsonPath }, 'Voltraco dataset not found');
        this.loaded = true;
        return;
      }

      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      const data: VoltracoTaxonomy = JSON.parse(jsonContent);

      for (const [category, genres] of Object.entries(data)) {
        const normalizedCategory = category.toLowerCase();
        this.categoryToGenres.set(normalizedCategory, new Set());

        for (const genre of genres) {
          const normalizedGenre = genre.toLowerCase();
          this.genreToCategory.set(normalizedGenre, normalizedCategory);
          this.categoryToGenres.get(normalizedCategory)!.add(normalizedGenre);
        }
      }

      logger.info(
        { genreCount: this.genreToCategory.size, categoryCount: this.categoryToGenres.size },
        'Voltraco genre taxonomy loaded'
      );
      this.loaded = true;
    } catch (error) {
      logger.error({ error }, 'failed to load Voltraco data');
      this.loaded = true;
    }
  }

  /**
   * Check if two genres are similar (same parent category)
   */
  areGenresSimilar(genre1: string, genre2: string): boolean {
    this.load();

    const cat1 = this.genreToCategory.get(genre1.toLowerCase());
    const cat2 = this.genreToCategory.get(genre2.toLowerCase());

    if (!cat1 || !cat2) {
      return false;
    }

    return cat1 === cat2;
  }

  /**
   * Get all similar genres (same category)
   */
  getSimilarGenres(genre: string): string[] {
    this.load();

    const category = this.genreToCategory.get(genre.toLowerCase());
    if (!category) {
      return [];
    }

    const categoryGenres = this.categoryToGenres.get(category);
    if (!categoryGenres) {
      return [];
    }

    return Array.from(categoryGenres).filter(g => g !== genre.toLowerCase());
  }

  /**
   * Check if a genre exists in the taxonomy
   */
  hasGenre(genre: string): boolean {
    this.load();
    return this.genreToCategory.has(genre.toLowerCase());
  }

  /**
   * Get the parent category for a genre
   */
  getCategory(genre: string): string | undefined {
    this.load();
    return this.genreToCategory.get(genre.toLowerCase());
  }

  /**
   * Get total number of genres
   */
  getGenreCount(): number {
    this.load();
    return this.genreToCategory.size;
  }
}

// Singleton instances
let everynoiseDataSource: EveryNoiseDataSource | null = null;
let voltracoDataSource: VoltracoDataSource | null = null;

export const getEveryNoiseDataSource = (): EveryNoiseDataSource => {
  if (!everynoiseDataSource) {
    everynoiseDataSource = new EveryNoiseDataSource();
  }
  return everynoiseDataSource;
};

export const getVoltracoDataSource = (): VoltracoDataSource => {
  if (!voltracoDataSource) {
    voltracoDataSource = new VoltracoDataSource();
  }
  return voltracoDataSource;
};
