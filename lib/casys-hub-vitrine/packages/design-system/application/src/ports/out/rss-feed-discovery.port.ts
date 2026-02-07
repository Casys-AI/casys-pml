/**
 * Port for RSS feed discovery using web search
 * Simple interface: business context → RSS feed suggestions
 *
 * Clean Architecture: Uses domain types from @casys/core
 * DTOs are only for API/Frontend communication layer
 */

import type {
  RssFeedDiscoveryContext,
  RssFeedDiscoveryOptions,
  DiscoveredRssFeed,
  RawFeed
} from '@casys/core';

export interface RssFeedDiscoveryPort {
  /**
   * Discover RSS feeds based on business context (legacy method)
   * Uses web search (Tavily) to find relevant RSS feeds
   *
   * @param context - Business context (industry, audience, etc.)
   * @param options - Discovery options (maxResults, languages, excludeUrls)
   * @returns Array of discovered RSS feeds with relevance scores
   */
  discoverFeeds(
    context: RssFeedDiscoveryContext,
    options?: RssFeedDiscoveryOptions
  ): Promise<DiscoveredRssFeed[]>;

  /**
   * Discover raw RSS feeds without AI qualification (v2 architecture)
   * Returns unqualified feeds for Use Case to qualify in parallel
   *
   * @param context - Business context (industry, audience, etc.)
   * @param options - Discovery options (maxResults, languages, excludeUrls)
   * @returns Array of raw RSS feeds (not yet qualified)
   */
  discoverRawFeeds(
    context: RssFeedDiscoveryContext,
    options?: RssFeedDiscoveryOptions
  ): Promise<RawFeed[]>;
}
