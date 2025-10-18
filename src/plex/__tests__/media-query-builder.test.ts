import { describe, it, expect } from 'vitest';
import { MediaQueryBuilder, createMediaQuery } from '../media-query-builder.js';

describe('MediaQueryBuilder', () => {
  const sectionId = '1';

  describe('basic construction', () => {
    it('should build empty query with section ID', () => {
      const query = new MediaQueryBuilder(sectionId).build();
      expect(query).toBe('/library/sections/1/all?');
    });

    it('should set media type', () => {
      const query = new MediaQueryBuilder(sectionId).type('track').build();
      expect(query).toBe('/library/sections/1/all?type=10');
    });

    it('should support album and artist types', () => {
      const albumQuery = new MediaQueryBuilder(sectionId).type('album').build();
      expect(albumQuery).toContain('type=9');

      const artistQuery = new MediaQueryBuilder(sectionId).type('artist').build();
      expect(artistQuery).toContain('type=8');
    });
  });

  describe('filtering', () => {
    it('should filter by rating', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .rating(8)  // defaults to >>= operator
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&userRating>>=8');
    });

    it('should filter by play count', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .playCount(10)  // defaults to >>= operator
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&viewCount>>=10');
    });

    it('should filter by relative last played date', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .lastPlayed('30d')  // defaults to >>= with negative value
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&lastViewedAt>>=-30d');
    });

    it('should filter by absolute last played date', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .lastPlayed('2024-01-01')
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&lastViewedAt>>=2024-01-01');
    });

    it('should filter by added date', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .addedAt('7d')
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&addedAt>>=-7d');
    });

    it('should filter by title (contains)', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .title('love')  // = operator means "contains" for strings
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&title=love');
    });

    it('should filter by artist (contains)', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .artist('Beatles')  // = operator means "contains" for strings
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&grandparentTitle=Beatles');
    });

    it('should support custom filters', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .filter('genre', '=', 'Rock')
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&genre=Rock');
    });

    it('should handle URL encoding for special characters', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .title('Bohemian Rhapsody')
        .build();

      expect(query).toContain('title=Bohemian%20Rhapsody');
    });
  });

  describe('sorting', () => {
    it('should sort by field descending', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .sort('viewCount', 'desc')
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&sort=viewCount:desc');
    });

    it('should sort by field ascending', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .sort('lastViewedAt', 'asc')
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&sort=lastViewedAt:asc');
    });

    it('should default to descending order', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .sort('userRating')
        .build();

      expect(query).toContain('sort=userRating:desc');
    });
  });

  describe('limiting and grouping', () => {
    it('should limit results', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .limit(500)
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&limit=500');
    });

    it('should group by field', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .groupBy('title')
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&group=title');
    });
  });

  describe('complex queries', () => {
    it('should build query with multiple filters', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .rating(6)
        .playCount(1)
        .lastPlayed('30d')
        .build();

      expect(query).toContain('type=10');
      expect(query).toContain('userRating>>=6');
      expect(query).toContain('viewCount>>=1');
      expect(query).toContain('lastViewedAt>>=-30d');
    });

    it('should build complete query with all features', () => {
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .rating(8)
        .playCount(5)
        .lastPlayed('60d')
        .sort('viewCount', 'desc')
        .limit(100)
        .build();

      expect(query).toContain('type=10');
      expect(query).toContain('userRating>>=8');
      expect(query).toContain('viewCount>>=5');
      expect(query).toContain('lastViewedAt>>=-60d');
      expect(query).toContain('sort=viewCount:desc');
      expect(query).toContain('limit=100');
    });

    it('should match test script query pattern', () => {
      // Recreate query from test-plex-api-features.ts line 69
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .rating(8)
        .build();

      expect(query).toBe('/library/sections/1/all?type=10&userRating>>=8');
    });

    it('should match discovery-style query', () => {
      // High-rated tracks added in last 30 days, sorted by date
      const query = new MediaQueryBuilder(sectionId)
        .type('track')
        .rating(7)
        .addedAt('30d')
        .sort('addedAt', 'desc')
        .limit(200)
        .build();

      expect(query).toContain('type=10');
      expect(query).toContain('userRating>>=7');
      expect(query).toContain('addedAt>>=-30d');
      expect(query).toContain('sort=addedAt:desc');
      expect(query).toContain('limit=200');
    });
  });

  describe('reset functionality', () => {
    it('should reset builder to initial state', () => {
      const builder = new MediaQueryBuilder(sectionId)
        .type('track')
        .rating(8)
        .limit(100);

      const firstQuery = builder.build();
      expect(firstQuery).toContain('type=10');
      expect(firstQuery).toContain('userRating');
      expect(firstQuery).toContain('limit=100');

      builder.reset();
      const secondQuery = builder.build();
      expect(secondQuery).toBe('/library/sections/1/all?');
    });

    it('should allow reuse after reset', () => {
      const builder = new MediaQueryBuilder(sectionId);

      builder.type('track').rating(8).build();
      builder.reset();

      const query = builder.type('album').limit(50).build();
      expect(query).toBe('/library/sections/1/all?type=9&limit=50');
      expect(query).not.toContain('userRating');
    });
  });

  describe('convenience function', () => {
    it('should create builder using convenience function', () => {
      const query = createMediaQuery(sectionId)
        .type('track')
        .rating(8)
        .build();

      expect(query).toContain('type=10');
      expect(query).toContain('userRating>>=8');
    });
  });

  describe('operator variations', () => {
    it('should support different comparison operators', () => {
      // Integer operators
      const eqQuery = new MediaQueryBuilder(sectionId).filter('viewCount', '=', 10).build();
      expect(eqQuery).toContain('viewCount=10');

      const neQuery = new MediaQueryBuilder(sectionId).filter('viewCount', '!=', 0).build();
      expect(neQuery).toContain('viewCount!=0');

      const gteQuery = new MediaQueryBuilder(sectionId).filter('viewCount', '>>=', 5).build();
      expect(gteQuery).toContain('viewCount>>=5');

      const lteQuery = new MediaQueryBuilder(sectionId).filter('viewCount', '<<=', 100).build();
      expect(lteQuery).toContain('viewCount<<=100');

      // String operators (== for exact match, = for contains)
      const exactQuery = new MediaQueryBuilder(sectionId).title('Love Song', '==').build();
      expect(exactQuery).toContain('title==Love%20Song');

      const containsQuery = new MediaQueryBuilder(sectionId).title('love').build();
      expect(containsQuery).toContain('title=love');
    });
  });
});
