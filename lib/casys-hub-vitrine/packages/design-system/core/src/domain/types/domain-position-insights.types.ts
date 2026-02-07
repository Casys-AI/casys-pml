/**
 * Domain types for SEO position insights and keyword trends
 * Based on DataForSEO Domain Rank Overview API response structure
 */

/**
 * Distribution of keyword positions in top 100 SERP results
 * Each field represents the count of keywords in that position range
 */
export interface PositionDistribution {
  /** Keywords in position 1 */
  pos_1: number;
  /** Keywords in positions 2-3 */
  pos_2_3: number;
  /** Keywords in positions 4-10 */
  pos_4_10: number;
  /** Keywords in positions 11-20 */
  pos_11_20: number;
  /** Keywords in positions 21-30 */
  pos_21_30: number;
  /** Keywords in positions 31-40 */
  pos_31_40: number;
  /** Keywords in positions 41-50 */
  pos_41_50: number;
  /** Keywords in positions 51-60 */
  pos_51_60: number;
  /** Keywords in positions 61-70 */
  pos_61_70: number;
  /** Keywords in positions 71-80 */
  pos_71_80: number;
  /** Keywords in positions 81-90 */
  pos_81_90: number;
  /** Keywords in positions 91-100 */
  pos_91_100: number;
}

/**
 * Keyword ranking trends over time
 * Tracks new, improving, declining, and lost keywords
 */
export interface KeywordTrends {
  /** Number of new keywords that appeared in rankings */
  isNew: number;
  /** Number of keywords that improved position */
  isUp: number;
  /** Number of keywords that declined in position */
  isDown: number;
  /** Number of keywords that dropped out of top 100 */
  isLost: number;
}

/**
 * Traffic and value metrics for organic search performance
 */
export interface TrafficMetrics {
  /** Estimated traffic value in USD based on keyword rankings */
  estimatedTrafficValue: number;
  /** Estimated cost if traffic was acquired via paid ads */
  estimatedPaidTrafficCost: number;
  /** Total count of keywords in rankings */
  totalKeywordsCount: number;
}

/**
 * Metadata about the search engine and location context
 */
export interface SearchContext {
  /** Search engine type (e.g., "google") */
  seType: string;
  /** DataForSEO location code (e.g., 2250 for France) */
  locationCode: number;
  /** Language code (e.g., "fr") */
  languageCode: string;
}