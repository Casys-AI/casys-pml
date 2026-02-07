/**
 * Port for RSS feed qualification using AI
 * Qualifies a single feed and returns score + status
 *
 * Clean Architecture: Uses domain types from @casys/core
 */

import type {
  RssFeedDiscoveryContext,
  RawFeed,
  FeedQualification
} from '@casys/core';

export interface FeedQualificationPort {
  /**
   * Qualify a single RSS feed using AI analysis
   * Returns qualification with score and color-coded status
   *
   * @param feed - Raw RSS feed to qualify
   * @param context - Business context for relevance scoring
   * @returns Feed qualification with score (0-100) and status (green/orange/red)
   */
  qualifyFeed(
    feed: RawFeed,
    context: RssFeedDiscoveryContext
  ): Promise<FeedQualification>;
}
