/**
 * Domain types for RSS Feed Discovery
 * Clean architecture: domain types used by application layer ports
 */

/**
 * Business context for RSS feed discovery
 * (Re-uses existing BusinessContext from angle-selection)
 */
export interface RssFeedDiscoveryContext {
  industry: string;
  targetAudience: string;
  businessDescription?: string;
  contentType?: string;
}

/**
 * Feed qualification status (color-coded)
 */
export type FeedQualificationStatus = 'green' | 'orange' | 'red';

/**
 * Raw RSS feed before qualification
 * Discovered from search but not yet scored
 */
export interface RawFeed {
  url: string;
  title: string;
  description?: string;
  websiteUrl?: string;
  language?: string;
}

/**
 * Feed qualification result from AI analysis
 */
export interface FeedQualification {
  score: number; // 0-100
  status: FeedQualificationStatus; // 🟢 green (>=80), 🟠 orange (60-79), 🔴 red (<60)
  relevanceReason: string;
  category?: string;
  updateFrequency?: 'hourly' | 'daily' | 'weekly' | 'unknown';
  lastUpdated?: string;
}

/**
 * Options for RSS feed discovery
 */
export interface RssFeedDiscoveryOptions {
  maxResults?: number;
  language?: string; // ISO 639-1 code from project config (ex: 'fr', 'en', 'es')
  excludeUrls?: string[];
  searchDepth?: 'basic' | 'advanced'; // Tavily search depth (advanced = more credits)

  // Streaming callbacks for progressive updates (v2 architecture)
  onFeedDiscovered?: (feed: RawFeed) => Promise<void> | void;
  onFeedQualifying?: (feed: RawFeed) => Promise<void> | void;
  onFeedQualified?: (feed: RawFeed, qualification: FeedQualification) => Promise<void> | void;
  onSelectionComplete?: (selected: DiscoveredRssFeed[], rejected: DiscoveredRssFeed[]) => Promise<void> | void;
  onProgress?: (message: string, step: string) => Promise<void> | void;
}

/**
 * Domain entity: Discovered RSS Feed (in-memory, from discovery)
 * Represents a discovered RSS feed with relevance metadata
 * Used by RssFeedDiscoveryPort adapters and DiscoverRssFeedsUseCase
 */
export interface DiscoveredRssFeed {
  feedUrl: string;
  feedTitle: string;
  feedDescription?: string;
  category?: string;
  relevanceScore: number; // 0-100
  updateFrequency?: 'hourly' | 'daily' | 'weekly' | 'unknown';
  lastUpdated?: string; // ISO date
  language?: string;
  relevanceReason?: string;
  websiteUrl?: string;
}

/**
 * Persisted Discovered Feed (with persistence fields)
 * Extends DiscoveredRssFeed with database identity and audit fields
 * Used by RssFeedRepositoryPort for persistence operations
 */
export interface PersistedDiscoveredFeed extends DiscoveredRssFeed {
  id: string;                   // UUID - unique discovery record
  tenantId: string;             // Tenant isolation
  projectId: string;            // Project scope
  discoverySource: 'tavily' | 'dataforseo' | 'manual'; // Discovery method
  discoveredAt: string;         // ISO date - when discovered
}

/**
 * Result of RSS feed discovery operation
 */
export interface RssFeedDiscoveryResult {
  feeds: DiscoveredRssFeed[];
  totalFound: number;
  context: RssFeedDiscoveryContext;
}
