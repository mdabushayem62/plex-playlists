/**
 * Media Query DSL Builder for Plex API
 *
 * Fluent API for constructing Plex Media Query DSL queries.
 * Enables server-side filtering to reduce dataset size before client-side processing.
 *
 * @example
 * const query = new MediaQueryBuilder(sectionId)
 *   .type('track')
 *   .rating(8, '>=')
 *   .playCount(1, '>=')
 *   .lastPlayed('30d', '>=')
 *   .sort('lastViewedAt', 'desc')
 *   .limit(500)
 *   .build();
 *
 * // Result: /library/sections/{sectionId}/all?type=10&userRating>>=8&viewCount>>=1&lastViewedAt>>=-30d&sort=lastViewedAt:desc&limit=500
 */

export type MediaType = 'track' | 'album' | 'artist';

// Plex Media Query operators per type:
// Integer: = != >>= <<= <= >=
// String: = (contains) != (not contains) == (equals) !== (not equals) <= (begins with) >= (ends with)
// Date: = != >>= <<=
export type ComparisonOperator = '=' | '!=' | '>>=' | '<<=' | '<=' | '>=' | '==' | '!==';
export type SortOrder = 'asc' | 'desc';

// Plex type codes
const MEDIA_TYPE_CODES: Record<MediaType, number> = {
  artist: 8,
  album: 9,
  track: 10
};

interface QueryFilter {
  field: string;
  operator: ComparisonOperator;
  value: string | number;
}

interface QuerySort {
  field: string;
  order: SortOrder;
}

export class MediaQueryBuilder {
  private sectionId: string;
  private mediaType: number | null = null;
  private filters: QueryFilter[] = [];
  private sortBy: QuerySort | null = null;
  private limitValue: number | null = null;
  private groupByField: string | null = null;

  constructor(sectionId: string) {
    this.sectionId = sectionId;
  }

  /**
   * Set media type (track, album, artist)
   */
  type(mediaType: MediaType): this {
    this.mediaType = MEDIA_TYPE_CODES[mediaType];
    return this;
  }

  /**
   * Filter by user rating (0-10 scale, integer type)
   * @example .rating(8, '>=') → userRating>>=8
   */
  rating(value: number, operator: ComparisonOperator = '>>='): this {
    this.filters.push({ field: 'userRating', operator, value });
    return this;
  }

  /**
   * Filter by play count (integer type)
   * @example .playCount(1, '>=') → viewCount>>=1
   */
  playCount(value: number, operator: ComparisonOperator = '>>='): this {
    this.filters.push({ field: 'viewCount', operator, value });
    return this;
  }

  /**
   * Filter by last played date (date type)
   * For relative dates: >>= means "after" (use negative for "within last N")
   * @example .lastPlayed('30d') → lastViewedAt>>=-30d (within last 30 days)
   * @example .lastPlayed('2024-01-01', '>>=') → lastViewedAt>>=2024-01-01
   */
  lastPlayed(value: string, operator: ComparisonOperator = '>>='): this {
    // For relative dates (e.g., "30d"), prepend negative sign
    if (value.match(/^\d+[dhmy]$/)) {
      this.filters.push({ field: 'lastViewedAt', operator, value: `-${value}` });
    } else {
      this.filters.push({ field: 'lastViewedAt', operator, value });
    }
    return this;
  }

  /**
   * Filter by date added (date type)
   * @example .addedAt('30d') → addedAt>>=-30d (added within last 30 days)
   */
  addedAt(value: string, operator: ComparisonOperator = '>>='): this {
    if (value.match(/^\d+[dhmy]$/)) {
      this.filters.push({ field: 'addedAt', operator, value: `-${value}` });
    } else {
      this.filters.push({ field: 'addedAt', operator, value });
    }
    return this;
  }

  /**
   * Filter by title (string type)
   * Default: contains match. Use '==' for exact match.
   * @example .title('love') → title=love (contains)
   * @example .title('Love Song', '==') → title==Love Song (exact)
   */
  title(value: string, operator: ComparisonOperator = '='): this {
    this.filters.push({ field: 'title', operator, value });
    return this;
  }

  /**
   * Filter by artist name (for tracks, uses grandparentTitle - string type)
   * @example .artist('Beatles') → grandparentTitle=Beatles (contains)
   */
  artist(value: string, operator: ComparisonOperator = '='): this {
    this.filters.push({ field: 'grandparentTitle', operator, value });
    return this;
  }

  /**
   * Add custom filter
   * @example .filter('genre', '=', 'Rock')
   */
  filter(field: string, operator: ComparisonOperator, value: string | number): this {
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * Sort results
   * @example .sort('viewCount', 'desc') → sort=viewCount:desc
   */
  sort(field: string, order: SortOrder = 'desc'): this {
    this.sortBy = { field, order };
    return this;
  }

  /**
   * Limit number of results
   * @example .limit(500) → limit=500
   */
  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Group results by field (useful for deduplication)
   * @example .groupBy('title') → group=title
   */
  groupBy(field: string): this {
    this.groupByField = field;
    return this;
  }

  /**
   * Build the query string
   * @returns Plex API query path (e.g., /library/sections/1/all?type=10&...)
   */
  build(): string {
    const params: string[] = [];

    // Add media type
    if (this.mediaType !== null) {
      params.push(`type=${this.mediaType}`);
    }

    // Add filters
    // Note: Operators are NOT URL encoded per Plex API spec
    for (const filter of this.filters) {
      const encodedValue = encodeURIComponent(filter.value);
      params.push(`${filter.field}${filter.operator}${encodedValue}`);
    }

    // Add sorting
    if (this.sortBy) {
      params.push(`sort=${this.sortBy.field}:${this.sortBy.order}`);
    }

    // Add grouping
    if (this.groupByField) {
      params.push(`group=${this.groupByField}`);
    }

    // Add limit
    if (this.limitValue !== null) {
      params.push(`limit=${this.limitValue}`);
    }

    return `/library/sections/${this.sectionId}/all?${params.join('&')}`;
  }

  /**
   * Reset the builder to initial state
   */
  reset(): this {
    this.mediaType = null;
    this.filters = [];
    this.sortBy = null;
    this.limitValue = null;
    this.groupByField = null;
    return this;
  }
}

/**
 * Convenience function to create a new MediaQueryBuilder
 * @example const query = createMediaQuery(sectionId).type('track').rating(8).build()
 */
export const createMediaQuery = (sectionId: string): MediaQueryBuilder => {
  return new MediaQueryBuilder(sectionId);
};
