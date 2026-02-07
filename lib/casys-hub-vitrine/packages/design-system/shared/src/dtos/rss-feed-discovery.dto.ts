/**
 * DTOs for RSS Feed Discovery and Subscription
 * AI-powered RSS feed discovery based on business context
 */

/**
 * Discovered RSS feed with AI-computed relevance
 * Output from RSS discovery service (in-memory, not persisted)
 *
 * @deprecated Use DiscoveredFeedDTO for persisted discovery results
 */
export interface RssFeedDiscoveryResultDTO {
  feedUrl: string;              // ex: "https://techcrunch.com/feed/"
  feedTitle: string;            // ex: "TechCrunch"
  feedDescription?: string;     // ex: "Startup and technology news"
  category?: string;            // ex: "Technology", "SaaS", "Marketing"
  relevanceScore: number;       // 0-100: semantic similarity to business context
  updateFrequency?: 'hourly' | 'daily' | 'weekly' | 'unknown';
  lastUpdated?: string;         // ISO date
  language?: string;            // ex: "en", "fr"

  // AI reasoning
  relevanceReason?: string;     // ex: "High relevance for SaaS B2B audience interested in marketing automation"

  // Metadata from feed
  articleCount?: number;        // Estimated articles per update
  websiteUrl?: string;          // Main website URL
}

/**
 * Persisted discovered RSS feed
 * Extends RssFeedDiscoveryResultDTO with persistence fields
 * Bounded Context: RSS Feed Management
 * Aggregate: DiscoveredFeed (immutable after creation)
 */
export interface DiscoveredFeedDTO extends RssFeedDiscoveryResultDTO {
  id: string;                   // UUID - unique discovery record
  tenantId: string;             // Tenant isolation
  projectId: string;            // Project scope
  discoverySource: 'tavily' | 'dataforseo' | 'manual'; // Discovery method
  discoveredAt: string;         // ISO date - when discovered
}

/**
 * Request for RSS feed discovery
 * Input to discovery endpoint
 */
export interface RssFeedDiscoveryRequestDTO {
  projectId: string;

  // Optional overrides (if not using project's business context)
  industry?: string;
  targetAudience?: string;
  keywords?: string[];          // Additional keywords to enhance discovery

  // Discovery parameters
  maxResults?: number;          // Default: 10
  minRelevanceScore?: number;   // Default: 60 (0-100)
  languages?: string[];         // Default: ["en", "fr"]
  excludeUrls?: string[];       // Already subscribed feeds to exclude
  searchDepth?: 'basic' | 'advanced'; // Tavily search depth (default: 'basic', advanced = more credits)
}

/**
 * Response from RSS feed discovery
 */
export interface RssFeedDiscoveryResponseDTO {
  feeds: RssFeedDiscoveryResultDTO[];
  totalFound: number;

  // Context used for discovery
  discoveryContext: {
    industry: string;
    targetAudience: string;
    keywords: string[];
    embeddings?: number[];      // Optional: semantic embedding used
  };

  // Performance metadata
  discoveryDurationMs?: number;
  sources: ('tavily' | 'feedly' | 'curated' | 'google-news')[];
}

/**
 * RSS feed subscription
 * User's active subscription to a feed
 */
export interface RssFeedSubscriptionDTO {
  id: string;
  userId: string;               // Frontend user reference
  tenantId?: string;            // Backend tenant isolation (optional for frontend)
  projectId: string;

  // Feed details
  feedUrl: string;
  feedTitle: string;
  feedDescription?: string;
  category?: string;
  websiteUrl?: string;          // Original website URL

  // Discovery metadata
  discoverySource?: 'tavily' | 'dataforseo' | 'manual';
  relevanceScore?: number;      // Score at time of subscription (0-100)

  // Subscription settings
  subscribed: boolean;          // Active/inactive toggle
  updateFrequency?: 'hourly' | 'daily' | 'weekly' | 'unknown';

  // Analytics
  lastFetched?: string;         // ISO date
  articlesFetched?: number;     // Total articles fetched
  lastArticleDate?: string;     // ISO date of most recent article

  // Timestamps
  subscribedAt: string;         // ISO date
  updatedAt?: string;           // ISO date
}

/**
 * Request to subscribe to RSS feed(s)
 */
export interface RssFeedSubscribeRequestDTO {
  projectId: string;
  feeds: {
    feedUrl: string;
    feedTitle: string;
    feedDescription?: string;
    category?: string;
    updateFrequency?: 'hourly' | 'daily' | 'weekly';
  }[];
}

/**
 * Response from subscription action
 */
export interface RssFeedSubscribeResponseDTO {
  subscriptions: RssFeedSubscriptionDTO[];
  errors?: {
    feedUrl: string;
    error: string;
  }[];
}

/**
 * Request to list user's subscriptions
 */
export interface RssFeedSubscriptionListRequestDTO {
  projectId: string;
  includeInactive?: boolean;    // Include unsubscribed feeds
}

/**
 * Response with user's subscriptions
 */
export interface RssFeedSubscriptionListResponseDTO {
  subscriptions: RssFeedSubscriptionDTO[];
  total: number;
}

/**
 * Request to update subscription settings
 */
export interface RssFeedSubscriptionUpdateRequestDTO {
  subscriptionId: string;
  updates: {
    subscribed?: boolean;
    updateFrequency?: 'hourly' | 'daily' | 'weekly';
    category?: string;
  };
}

/**
 * Fetched RSS article from subscribed feeds
 * Individual article extracted from RSS feed
 */
export interface RssFeedArticleDTO {
  id: string;                   // Generated hash from feedUrl + articleUrl
  subscriptionId: string;       // Link to subscription

  // Article metadata
  articleUrl: string;
  title: string;
  description?: string;
  content?: string;             // Full content if available
  author?: string;
  publishedAt: string;          // ISO date

  // Processing
  fetchedAt: string;            // ISO date
  processedForTopics?: boolean; // Has been analyzed for topic extraction

  // Optional categorization
  categories?: string[];
  tags?: string[];
}
