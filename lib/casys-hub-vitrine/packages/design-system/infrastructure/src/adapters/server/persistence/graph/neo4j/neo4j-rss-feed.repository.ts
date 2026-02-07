/**
 * Unified Neo4j RSS Feed Repository
 *
 * Manages both DiscoveredFeeds and RssSubscriptions in Neo4j
 * Replaces: neo4j-rss-subscription.repository.ts (old implementation)
 *
 * Neo4j Schema:
 * - (:PersistedDiscoveredFeed) - Discovery records
 * - (:RssFeedSubscription) - Active subscriptions
 * - (:Project)-[:HAS_DISCOVERED]->(:PersistedDiscoveredFeed)
 * - (:Project)-[:SUBSCRIBES_TO]->(:RssFeedSubscription)
 * - (:PersistedDiscoveredFeed)-[:SUBSCRIBED_AS]->(:RssFeedSubscription) - Optional provenance
 */

import { randomUUID } from 'crypto';
import type {
  PersistedDiscoveredFeed,
  DiscoveredRssFeed,
  RssSubscription,
  CreateRssSubscriptionInput,
  UpdateRssSubscriptionInput,
} from '@casys/core';
import type { RssFeedRepositoryPort } from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jRssFeedRepository implements RssFeedRepositoryPort {
  private readonly logger = createLogger('Neo4jRssFeedRepository');

  constructor(private readonly conn: Neo4jConnection) {}

  // ========================================
  // Discovered Feeds
  // ========================================

  /**
   * Upsert discovered feed (idempotent, thread-safe with MERGE)
   * Creates new discovery or updates lastChecked if already exists
   * Eliminates race conditions for automatic discovery (cron/scheduler)
   */
  async upsertDiscoveredFeed(
    tenantId: string,
    projectId: string,
    feed: DiscoveredRssFeed,
    discoverySource: 'tavily' | 'dataforseo' | 'manual'
  ): Promise<{ feed: PersistedDiscoveredFeed; wasCreated: boolean }> {
    const id = randomUUID();

    const rows = await this.conn.query<{
      d: PersistedDiscoveredFeed;
      wasCreated: boolean;
    }>(
      `
      MATCH (p:Project {id: $projectId, tenantId: $tenantId})

      // MERGE noeud (atomique, thread-safe)
      MERGE (d:PersistedDiscoveredFeed {
        tenantId: $tenantId,
        projectId: $projectId,
        feedUrl: $feedUrl
      })
      ON CREATE SET
        d.id = $id,
        d.feedTitle = $feedTitle,
        d.feedDescription = $feedDescription,
        d.category = $category,
        d.relevanceScore = $relevanceScore,
        d.relevanceReason = $relevanceReason,
        d.updateFrequency = $updateFrequency,
        d.lastUpdated = $lastUpdated,
        d.language = $language,
        d.websiteUrl = $websiteUrl,
        d.discoverySource = $discoverySource,
        d.discoveredAt = datetime(),
        d.wasCreated = true
      ON MATCH SET
        d.lastChecked = datetime(),
        d.wasCreated = false

      // MERGE relation (évite duplicates)
      MERGE (p)-[r:HAS_DISCOVERED]->(d)
      ON CREATE SET r.discoveredAt = datetime()
      ON MATCH SET r.lastChecked = datetime()

      RETURN d, d.wasCreated as wasCreated
      `,
      {
        projectId,
        tenantId,
        feedUrl: feed.feedUrl,
        id,
        feedTitle: feed.feedTitle,
        feedDescription: feed.feedDescription,
        category: feed.category,
        relevanceScore: feed.relevanceScore,
        relevanceReason: feed.relevanceReason,
        updateFrequency: feed.updateFrequency,
        lastUpdated: feed.lastUpdated,
        language: feed.language,
        websiteUrl: feed.websiteUrl,
        discoverySource,
      },
      'WRITE'
    );

    if (!rows[0]) {
      throw new Error(
        `Failed to upsert discovered feed: ${feed.feedUrl} (project: ${projectId}, tenant: ${tenantId})`
      );
    }

    const action = rows[0].wasCreated ? 'Created' : 'Updated';
    this.logger.debug(`${action} discovered feed: ${rows[0].d.id} (${feed.feedUrl})`);

    return {
      feed: rows[0].d,
      wasCreated: rows[0].wasCreated,
    };
  }

  async listDiscoveredFeeds(
    tenantId: string,
    projectId: string
  ): Promise<PersistedDiscoveredFeed[]> {
    const rows = await this.conn.query<{ d: PersistedDiscoveredFeed }>(
      `MATCH (p:Project {id: $projectId, tenantId: $tenantId})-[:HAS_DISCOVERED]->(d:PersistedDiscoveredFeed)
       RETURN d
       ORDER BY d.relevanceScore DESC, d.discoveredAt DESC`,
      { projectId, tenantId },
      'READ'
    );

    return rows.map((r) => r.d);
  }

  async getDiscoveredFeedById(
    tenantId: string,
    discoveredFeedId: string
  ): Promise<PersistedDiscoveredFeed | null> {
    const rows = await this.conn.query<{ d: PersistedDiscoveredFeed }>(
      `MATCH (d:PersistedDiscoveredFeed {id: $discoveredFeedId, tenantId: $tenantId})
       RETURN d`,
      { discoveredFeedId, tenantId },
      'READ'
    );

    return rows.length > 0 ? rows[0].d : null;
  }

  async deleteDiscoveredFeed(
    tenantId: string,
    discoveredFeedId: string
  ): Promise<void> {
    await this.conn.query(
      `MATCH (d:PersistedDiscoveredFeed {id: $discoveredFeedId, tenantId: $tenantId})
       DETACH DELETE d`,
      { discoveredFeedId, tenantId },
      'WRITE'
    );

    this.logger.debug(`Deleted discovered feed: ${discoveredFeedId}`);
  }

  // ========================================
  // Subscriptions
  // ========================================

  async createSubscription(
    tenantId: string,
    input: CreateRssSubscriptionInput
  ): Promise<RssSubscription> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const subscription: RssSubscription = {
      id,
      tenantId,
      projectId: input.projectId,
      feedUrl: input.feedUrl,
      feedTitle: input.feedTitle,
      feedDescription: input.feedDescription,
      category: input.category,
      subscribed: true,
      updateFrequency: input.updateFrequency,
      subscribedAt: now,
      updatedAt: now,
      articlesFetched: 0,
      discoveredFeedId: input.discoveredFeedId,
    };

    await this.conn.query(
      `
      MATCH (p:Project {id: $projectId, tenantId: $tenantId})
      CREATE (s:RssFeedSubscription)
      SET s = $subscription
      CREATE (p)-[:SUBSCRIBES_TO {subscribedAt: datetime()}]->(s)
      RETURN s
      `,
      {
        projectId: input.projectId,
        tenantId,
        subscription,
      },
      'WRITE'
    );

    this.logger.debug(`Created RSS subscription: ${id} (${input.feedUrl})`);
    return subscription;
  }

  async listSubscriptions(
    tenantId: string,
    projectId: string,
    includeInactive = true
  ): Promise<RssSubscription[]> {
    const query = includeInactive
      ? `MATCH (p:Project {id: $projectId, tenantId: $tenantId})-[:SUBSCRIBES_TO]->(s:RssFeedSubscription)
         RETURN s
         ORDER BY s.subscribedAt DESC`
      : `MATCH (p:Project {id: $projectId, tenantId: $tenantId})-[:SUBSCRIBES_TO]->(s:RssFeedSubscription)
         WHERE s.subscribed = true
         RETURN s
         ORDER BY s.subscribedAt DESC`;

    const rows = await this.conn.query<{ s: RssSubscription }>(
      query,
      { projectId, tenantId },
      'READ'
    );

    return rows.map((r) => r.s);
  }

  async getSubscriptionById(
    tenantId: string,
    subscriptionId: string
  ): Promise<RssSubscription | null> {
    const rows = await this.conn.query<{ s: RssSubscription }>(
      `MATCH (s:RssFeedSubscription {id: $subscriptionId, tenantId: $tenantId})
       RETURN s`,
      { subscriptionId, tenantId },
      'READ'
    );

    return rows.length > 0 ? rows[0].s : null;
  }

  async updateSubscription(
    tenantId: string,
    subscriptionId: string,
    updates: UpdateRssSubscriptionInput
  ): Promise<RssSubscription> {
    const now = new Date().toISOString();

    const rows = await this.conn.query<{ s: RssSubscription }>(
      `MATCH (s:RssFeedSubscription {id: $subscriptionId, tenantId: $tenantId})
       SET s += $updates, s.updatedAt = $now
       RETURN s`,
      { subscriptionId, tenantId, updates, now },
      'WRITE'
    );

    if (rows.length === 0) {
      throw new Error('Subscription not found');
    }

    this.logger.debug(`Updated RSS subscription: ${subscriptionId}`);
    return rows[0].s;
  }

  async deleteSubscription(
    tenantId: string,
    subscriptionId: string
  ): Promise<void> {
    await this.conn.query(
      `MATCH (s:RssFeedSubscription {id: $subscriptionId, tenantId: $tenantId})
       DETACH DELETE s`,
      { subscriptionId, tenantId },
      'WRITE'
    );

    this.logger.debug(`Deleted RSS subscription: ${subscriptionId}`);
  }

  // ========================================
  // Cross-entity operations
  // ========================================

  async isAlreadySubscribed(
    tenantId: string,
    projectId: string,
    feedUrl: string
  ): Promise<boolean> {
    const rows = await this.conn.query<{ exists: boolean }>(
      `MATCH (p:Project {id: $projectId, tenantId: $tenantId})-[:SUBSCRIBES_TO]->(s:RssFeedSubscription {feedUrl: $feedUrl})
       RETURN count(s) > 0 as exists`,
      { projectId, tenantId, feedUrl },
      'READ'
    );

    return rows[0]?.exists ?? false;
  }

  async subscribeFromDiscovery(
    tenantId: string,
    discoveredFeedId: string,
    updateFrequency: 'hourly' | 'daily' | 'weekly'
  ): Promise<RssSubscription> {
    // 1. Get discovered feed
    const discoveredFeed = await this.getDiscoveredFeedById(
      tenantId,
      discoveredFeedId
    );

    if (!discoveredFeed) {
      throw new Error(`Discovered feed not found: ${discoveredFeedId}`);
    }

    // 2. Create subscription with link to discovery
    const subscription = await this.createSubscription(tenantId, {
      projectId: discoveredFeed.projectId,
      feedUrl: discoveredFeed.feedUrl,
      feedTitle: discoveredFeed.feedTitle,
      feedDescription: discoveredFeed.feedDescription,
      category: discoveredFeed.category,
      updateFrequency,
      discoveredFeedId,
    });

    // 3. Create provenance relationship (optional, for historical tracking)
    await this.conn.query(
      `MATCH (d:PersistedDiscoveredFeed {id: $discoveredFeedId, tenantId: $tenantId})
       MATCH (s:RssFeedSubscription {id: $subscriptionId, tenantId: $tenantId})
       CREATE (d)-[:SUBSCRIBED_AS {subscribedAt: datetime()}]->(s)`,
      { discoveredFeedId, subscriptionId: subscription.id, tenantId },
      'WRITE'
    );

    this.logger.debug(
      `Subscribed from discovery: ${discoveredFeedId} → ${subscription.id}`
    );
    return subscription;
  }
}