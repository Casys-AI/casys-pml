// RSS Subscription Domain Types

/**
 * RSS Feed Subscription (active monitoring)
 * Represents an active subscription to an RSS feed for article monitoring
 *
 * Clean separation: Discovery metadata stored in PersistedDiscoveredFeed
 * This entity focuses on subscription behavior and monitoring state
 */
export interface RssSubscription {
  id: string;
  tenantId: string;
  projectId: string;

  // Feed metadata (denormalized for performance)
  feedUrl: string;
  feedTitle: string;
  feedDescription?: string;
  category?: string;

  // Subscription behavior
  subscribed: boolean;          // Active/paused toggle
  updateFrequency: 'hourly' | 'daily' | 'weekly'; // Required for subscriptions

  // Timestamps
  subscribedAt: string;         // When user subscribed
  lastFetched?: string;         // Last article fetch
  updatedAt: string;            // Last update

  // Monitoring stats
  articlesFetched?: number;     // Total articles fetched
  lastArticleDate?: string;     // Most recent article date

  // Optional: Link to original discovery (provenance)
  discoveredFeedId?: string;    // Reference to PersistedDiscoveredFeed
}

/**
 * Input for creating a new RSS subscription
 * Simplified: no discovery metadata (stored separately in PersistedDiscoveredFeed)
 */
export interface CreateRssSubscriptionInput {
  projectId: string;
  feedUrl: string;
  feedTitle: string;
  feedDescription?: string;
  category?: string;
  updateFrequency: 'hourly' | 'daily' | 'weekly'; // Required
  discoveredFeedId?: string;    // Optional link to PersistedDiscoveredFeed
}

export interface UpdateRssSubscriptionInput {
  subscribed?: boolean;
  updateFrequency?: string;
  category?: string;
}
