import { describe, it, expect } from 'vitest';
import {
  normalizeGenre,
  normalizeGenres,
  filterMetaGenres,
  processGenres,
  genreMatchesFilter,
  genresMatchFilter,
  DEFAULT_GENRE_IGNORE_LIST
} from '../../metadata/genre-service.js';

describe('Genre Normalization', () => {
  describe('normalizeGenre', () => {
    it('should lowercase genres', () => {
      expect(normalizeGenre('Electronic')).toBe('electronic');
      expect(normalizeGenre('Pop/Rock')).toBe('pop/rock');
      expect(normalizeGenre('HEAVY METAL')).toBe('heavy metal');
    });

    it('should trim whitespace', () => {
      expect(normalizeGenre('  electronic  ')).toBe('electronic');
      expect(normalizeGenre('\tsynth pop\n')).toBe('synth-pop');
    });

    it('should normalize hyphenated compounds', () => {
      expect(normalizeGenre('electro swing')).toBe('electro-swing');
      expect(normalizeGenre('electro-swing')).toBe('electro-swing');
      expect(normalizeGenre('synth pop')).toBe('synth-pop');
      expect(normalizeGenre('synthpop')).toBe('synth-pop');
      expect(normalizeGenre('tech house')).toBe('tech-house');
      expect(normalizeGenre('tech-house')).toBe('tech-house');
      expect(normalizeGenre('trip hop')).toBe('trip-hop');
      expect(normalizeGenre('trip-hop')).toBe('trip-hop');
    });

    it('should normalize slash compounds', () => {
      expect(normalizeGenre('pop rock')).toBe('pop/rock');
      expect(normalizeGenre('pop/rock')).toBe('pop/rock');
      expect(normalizeGenre('singer-songwriter')).toBe('singer/songwriter');
      expect(normalizeGenre('singer songwriter')).toBe('singer/songwriter');
    });

    it('should normalize drum and bass variations', () => {
      expect(normalizeGenre("jungle/drum'n'bass")).toBe('jungle/drum-n-bass');
      expect(normalizeGenre("drum'n'bass")).toBe('drum-n-bass');
      expect(normalizeGenre('drum and bass')).toBe('drum-n-bass');
      expect(normalizeGenre('drum & bass')).toBe('drum-n-bass');
      expect(normalizeGenre('dnb')).toBe('drum-n-bass');
    });

    it('should normalize hip-hop variations', () => {
      expect(normalizeGenre('hip hop')).toBe('hip-hop');
      expect(normalizeGenre('hip-hop')).toBe('hip-hop');
      expect(normalizeGenre('hiphop')).toBe('hip-hop');
    });

    it('should handle empty strings', () => {
      expect(normalizeGenre('')).toBe('');
      expect(normalizeGenre('   ')).toBe('');
    });

    it('should remove extra whitespace', () => {
      expect(normalizeGenre('progressive    house')).toBe('progressive house');
      expect(normalizeGenre('heavy  metal')).toBe('heavy metal');
    });
  });

  describe('normalizeGenres', () => {
    it('should normalize array of genres', () => {
      const input = ['Electronic', 'Synth Pop', 'electro-swing', 'POP/ROCK'];
      const expected = ['electro-swing', 'electronic', 'pop/rock', 'synth-pop'];
      expect(normalizeGenres(input)).toEqual(expected);
    });

    it('should remove duplicates after normalization', () => {
      const input = ['synth pop', 'synthpop', 'Synth-Pop', 'SYNTH POP'];
      expect(normalizeGenres(input)).toEqual(['synth-pop']);
    });

    it('should sort genres alphabetically', () => {
      const input = ['techno', 'house', 'ambient', 'edm'];
      const expected = ['ambient', 'edm', 'house', 'techno'];
      expect(normalizeGenres(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(normalizeGenres([])).toEqual([]);
    });

    it('should filter out empty strings', () => {
      const input = ['electronic', '', '  ', 'house'];
      expect(normalizeGenres(input)).toEqual(['electronic', 'house']);
    });
  });

  describe('filterMetaGenres', () => {
    it('should filter out meta-genres', () => {
      const genres = ['electronic', 'synthwave', 'ambient', 'retrowave'];
      const ignoreList = ['electronic', 'ambient'];
      const expected = ['synthwave', 'retrowave'];
      expect(filterMetaGenres(genres, ignoreList)).toEqual(expected);
    });

    it('should be case-insensitive', () => {
      const genres = ['Electronic', 'Synthwave', 'AMBIENT'];
      const ignoreList = ['electronic', 'ambient'];
      expect(filterMetaGenres(genres, ignoreList)).toEqual(['Synthwave']);
    });

    it('should return original list if all genres filtered', () => {
      const genres = ['electronic', 'ambient'];
      const ignoreList = ['electronic', 'ambient', 'techno'];
      // Should keep original since filtering would remove everything
      expect(filterMetaGenres(genres, ignoreList)).toEqual(genres);
    });

    it('should handle empty ignore list', () => {
      const genres = ['electronic', 'synthwave'];
      expect(filterMetaGenres(genres, [])).toEqual(genres);
    });

    it('should handle empty genre list', () => {
      expect(filterMetaGenres([], ['electronic'])).toEqual([]);
    });
  });

  describe('processGenres', () => {
    it('should normalize and filter in one operation', () => {
      const input = ['Electronic', 'Synth Pop', 'AMBIENT', 'Retrowave'];
      const result = processGenres(input, ['electronic', 'ambient']);
      expect(result).toEqual(['retrowave', 'synth-pop']);
    });

    it('should use default ignore list when not specified', () => {
      const input = ['Electronic', 'Synthwave', 'Pop/Rock', 'Progressive House'];
      const result = processGenres(input);
      // electronic and pop/rock should be filtered out (in default list)
      expect(result).not.toContain('electronic');
      expect(result).not.toContain('pop/rock');
      expect(result).toContain('synthwave');
      expect(result).toContain('progressive house');
    });

    it('should deduplicate after normalization', () => {
      const input = ['synth pop', 'synthpop', 'Electronic', 'electronic'];
      const result = processGenres(input, ['electronic']);
      expect(result).toEqual(['synth-pop']);
    });

    it('should keep original if all filtered', () => {
      const input = ['Electronic', 'Pop/Rock'];
      const result = processGenres(input, ['electronic', 'pop/rock']);
      // Should keep normalized versions since all would be filtered
      expect(result).toEqual(['electronic', 'pop/rock']);
    });
  });

  describe('genreMatchesFilter', () => {
    it('should match substring (case-insensitive)', () => {
      expect(genreMatchesFilter('progressive house', 'house')).toBe(true);
      expect(genreMatchesFilter('Progressive House', 'HOUSE')).toBe(true);
      expect(genreMatchesFilter('techno', 'tech')).toBe(true);
    });

    it('should normalize before matching', () => {
      expect(genreMatchesFilter('synth pop', 'synth-pop')).toBe(true);
      expect(genreMatchesFilter('synthpop', 'synth-pop')).toBe(true);
    });

    it('should return false for non-matches', () => {
      expect(genreMatchesFilter('ambient', 'techno')).toBe(false);
      expect(genreMatchesFilter('house', 'trance')).toBe(false);
    });

    it('should handle exact matches', () => {
      expect(genreMatchesFilter('electronic', 'electronic')).toBe(true);
      expect(genreMatchesFilter('Electronic', 'ELECTRONIC')).toBe(true);
    });
  });

  describe('genresMatchFilter', () => {
    it('should return true if any genre matches', () => {
      const genres = ['progressive house', 'techno', 'ambient'];
      expect(genresMatchFilter(genres, 'house')).toBe(true);
      expect(genresMatchFilter(genres, 'tech')).toBe(true);
    });

    it('should return false if no genres match', () => {
      const genres = ['house', 'techno', 'ambient'];
      expect(genresMatchFilter(genres, 'metal')).toBe(false);
    });

    it('should handle empty array', () => {
      expect(genresMatchFilter([], 'house')).toBe(false);
    });

    it('should normalize before matching', () => {
      const genres = ['synth pop', 'ambient'];
      expect(genresMatchFilter(genres, 'synth-pop')).toBe(true);
    });
  });

  describe('DEFAULT_GENRE_IGNORE_LIST', () => {
    it('should contain common meta-genres', () => {
      expect(DEFAULT_GENRE_IGNORE_LIST).toContain('electronic');
      expect(DEFAULT_GENRE_IGNORE_LIST).toContain('pop/rock');
      expect(DEFAULT_GENRE_IGNORE_LIST).toContain('club/dance');
      expect(DEFAULT_GENRE_IGNORE_LIST).toContain('pop');
      expect(DEFAULT_GENRE_IGNORE_LIST).toContain('rock');
    });

    it('should be an array', () => {
      expect(Array.isArray(DEFAULT_GENRE_IGNORE_LIST)).toBe(true);
      expect(DEFAULT_GENRE_IGNORE_LIST.length).toBeGreaterThan(0);
    });
  });
});
