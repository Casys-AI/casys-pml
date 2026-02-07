/**
 * Unified RSS Feed Repository Port
 *
 * Manages both DiscoveredFeeds (discovery results) and RssSubscriptions (active monitoring)
 * Single repository for the RSS Feed Management bounded context
 *
 * Architecture:
 * - PersistedDiscoveredFeed: Immutable discovery records with relevance scores
 * - RssSubscription: Mutable subscription entities with monitoring state
 * - Relationship: (:PersistedDiscoveredFeed)-[:SUBSCRIBED_AS]->(:RssSubscription)
 */

import {
type
  CreateRssSubscriptionInput,  type DiscoveredRssFeed,
  type PersistedDiscoveredFeed,
type
  RssSubscription,type
  UpdateRssSubscriptionInput} from '@casys/core';

export interface RssFeedRepositoryPort {
  // ========================================
  // Discovered Feeds (immutable discovery records)
  // ========================================

  /**
   * Upsert discovered feed (idempotent, thread-safe with MERGE)
   * Creates new discovery or updates lastChecked if already exists
   * Eliminates race conditions for automatic discovery (cron/scheduler)
   *
   * @param tenantId - Tenant isolation
   * @param projectId - Project scope
   * @param feed - Discovered feed from RssFeedDiscoveryPort
   * @param discoverySource - Source of discovery
   * @returns Persisted feed with wasCreated flag (true if new, false if already exists)
   */
  upsertDiscoveredFeed(
    tenantId: string,
    projectId: string,
    feed: DiscoveredRssFeed,
    discoverySource: 'tavily' | 'dataforseo' | 'manual'
  ): Promise<{ feed: PersistedDiscoveredFeed; wasCreated: boolean }>;

  /**
   * List all discovered feeds for a project
   * @param tenantId - Tenant isolation
   * @param projectId - Project scope
   * @returns Array of persisted discovered feeds, sorted by relevance score DESC
   */
  listDiscoveredFeeds(
    tenantId: string,
    projectId: string
  ): Promise<PersistedDiscoveredFeed[]>;

  /**
   * Get a single discovered feed by ID
   */
  getDiscoveredFeedById(
    tenantId: string,
    discoveredFeedId: string
  ): Promise<PersistedDiscoveredFeed | null>;

  /**
   * Delete a discovered feed (cleanup old discoveries)
   */
  deleteDiscoveredFeed(
    tenantId: string,
    discoveredFeedId: string
  ): Promise<void>;

  // ========================================
  // Subscriptions (active monitoring)
  // ========================================

  /**
   * Create a new RSS subscription for a project
   * @throws Error if subscription already exists (unique constraint on feedUrl)
   */
  createSubscription(
    tenantId: string,
    input: CreateRssSubscriptionInput
  ): Promise<RssSubscription>;

  /**
   * List all subscriptions for a project
   * @param includeInactive - Include paused subscriptions (default: true)
   */
  listSubscriptions(
    tenantId: string,
    projectId: string,
    includeInactive?: boolean
  ): Promise<RssSubscription[]>;

  /**
   * Get a single subscription by ID
   */
  getSubscriptionById(
    tenantId: string,
    subscriptionId: string
  ): Promise<RssSubscription | null>;

  /**
   * Update subscription properties (pause/resume, change frequency)
   */
  updateSubscription(
    tenantId: string,
    subscriptionId: string,
    updates: UpdateRssSubscriptionInput
  ): Promise<RssSubscription>;

  /**
   * Delete a subscription permanently
   */
  deleteSubscription(tenantId: string, subscriptionId: string): Promise<void>;

  // ========================================
  // Cross-entity operations
  // ========================================

  /**
   * Check if feed URL is already subscribed for a project
   * Useful to prevent duplicate subscriptions and mark discovered feeds as "already subscribed"
   */
  isAlreadySubscribed(
    tenantId: string,
    projectId: string,
    feedUrl: string
  ): Promise<boolean>;

  /**
   * Subscribe to a feed that was previously discovered
   * Creates RssSubscription + optional relationship to PersistedDiscoveredFeed
   *
   * @param tenantId - Tenant isolation
   * @param discoveredFeedId - ID of the discovered feed to subscribe to
   * @param updateFrequency - Monitoring frequency
   * @returns Created subscription with discoveredFeedId link
   */
  subscribeFromDiscovery(
    tenantId: string,
    discoveredFeedId: string,
    updateFrequency: 'hourly' | 'daily' | 'weekly'
  ): Promise<RssSubscription>;
}
