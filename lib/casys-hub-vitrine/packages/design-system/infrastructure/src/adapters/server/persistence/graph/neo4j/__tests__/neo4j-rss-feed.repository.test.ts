/**
 * Tests for Neo4jRssFeedRepository
 * Focus on upsertDiscoveredFeed idempotence and thread-safety
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiscoveredRssFeed, PersistedDiscoveredFeed } from '@casys/core';

import type { Neo4jConnection } from '../neo4j-connection';
import { Neo4jRssFeedRepository } from '../neo4j-rss-feed.repository';

describe('Neo4jRssFeedRepository', () => {
  let repository: Neo4jRssFeedRepository;
  let mockConn: Neo4jConnection;

  const mockFeed: DiscoveredRssFeed = {
    feedUrl: 'https://example.com/feed.xml',
    feedTitle: 'Example Feed',
    feedDescription: 'Example feed description',
    category: 'technology',
    relevanceScore: 85,
    relevanceReason: 'Highly relevant to tech industry',
    updateFrequency: 'daily',
    lastUpdated: '2025-11-02',
    language: 'en',
    websiteUrl: 'https://example.com'
  };

  beforeEach(() => {
    // Mock Neo4j connection
    mockConn = {
      query: vi.fn(),
    } as unknown as Neo4jConnection;

    repository = new Neo4jRssFeedRepository(mockConn);
  });

  describe('upsertDiscoveredFeed - Idempotence', () => {
    it('should create new feed and return wasCreated=true on first call', async () => {
      const mockResult = [{
        d: {
          id: 'mock-uuid-123',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          feedUrl: mockFeed.feedUrl,
          feedTitle: mockFeed.feedTitle,
          feedDescription: mockFeed.feedDescription,
          category: mockFeed.category,
          relevanceScore: mockFeed.relevanceScore,
          relevanceReason: mockFeed.relevanceReason,
          updateFrequency: mockFeed.updateFrequency,
          lastUpdated: mockFeed.lastUpdated,
          language: mockFeed.language,
          websiteUrl: mockFeed.websiteUrl,
          discoverySource: 'dataforseo',
          discoveredAt: '2025-11-02T10:00:00.000Z'
        } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      vi.mocked(mockConn.query).mockResolvedValue(mockResult);

      const result = await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'dataforseo'
      );

      expect(result.wasCreated).toBe(true);
      expect(result.feed.feedUrl).toBe(mockFeed.feedUrl);
      expect(result.feed.discoverySource).toBe('dataforseo');
      expect(mockConn.query).toHaveBeenCalledTimes(1);
    });

    it('should update existing feed and return wasCreated=false on second call', async () => {
      const mockResult = [{
        d: {
          id: 'mock-uuid-123',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          feedUrl: mockFeed.feedUrl,
          feedTitle: mockFeed.feedTitle,
          discoverySource: 'dataforseo',
          discoveredAt: '2025-11-01T10:00:00.000Z', // Original discovery date
          lastChecked: '2025-11-02T11:00:00.000Z',   // Updated check timestamp
          relevanceScore: mockFeed.relevanceScore,
          updateFrequency: mockFeed.updateFrequency,
          lastUpdated: mockFeed.lastUpdated,
          language: mockFeed.language,
          websiteUrl: mockFeed.websiteUrl
        } as PersistedDiscoveredFeed & { lastChecked?: string },
        wasCreated: false
      }];

      vi.mocked(mockConn.query).mockResolvedValue(mockResult);

      const result = await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'dataforseo'
      );

      expect(result.wasCreated).toBe(false);
      expect(result.feed.feedUrl).toBe(mockFeed.feedUrl);
      expect(result.feed.discoveredAt).toBe('2025-11-01T10:00:00.000Z'); // Original date preserved
      expect((result.feed as PersistedDiscoveredFeed & { lastChecked?: string }).lastChecked).toBe('2025-11-02T11:00:00.000Z'); // Updated timestamp
    });

    it('should use MERGE operation with composite key (tenantId, projectId, feedUrl)', async () => {
      const mockResult = [{
        d: { id: 'mock-id', tenantId: 'tenant-1', projectId: 'project-1', feedUrl: mockFeed.feedUrl, discoveredAt: '2025-11-02', discoverySource: 'dataforseo', feedTitle: mockFeed.feedTitle, relevanceScore: mockFeed.relevanceScore, updateFrequency: mockFeed.updateFrequency, lastUpdated: mockFeed.lastUpdated, language: mockFeed.language, websiteUrl: mockFeed.websiteUrl } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      vi.mocked(mockConn.query).mockResolvedValue(mockResult);

      await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'dataforseo'
      );

      // Verify MERGE query was called
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (d:PersistedDiscoveredFeed {'),
        expect.objectContaining({
          tenantId: 'tenant-1',
          projectId: 'project-1',
          feedUrl: mockFeed.feedUrl
        }),
        'WRITE'
      );
    });

    it('should be idempotent - multiple calls with same data produce same result', async () => {
      // First call - creates new feed
      const firstCallResult = [{
        d: {
          id: 'mock-uuid-123',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          feedUrl: mockFeed.feedUrl,
          feedTitle: mockFeed.feedTitle,
          discoverySource: 'dataforseo',
          discoveredAt: '2025-11-02T10:00:00.000Z',
          relevanceScore: mockFeed.relevanceScore,
          updateFrequency: mockFeed.updateFrequency,
          lastUpdated: mockFeed.lastUpdated,
          language: mockFeed.language,
          websiteUrl: mockFeed.websiteUrl
        } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      // Second call - updates existing feed
      const secondCallResult = [{
        d: {
          ...firstCallResult[0].d,
          lastChecked: '2025-11-02T11:00:00.000Z'
        } as PersistedDiscoveredFeed & { lastChecked?: string },
        wasCreated: false
      }];

      vi.mocked(mockConn.query)
        .mockResolvedValueOnce(firstCallResult)
        .mockResolvedValueOnce(secondCallResult);

      // First call
      const result1 = await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'dataforseo'
      );

      // Second call with same data
      const result2 = await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'dataforseo'
      );

      // Both calls succeed
      expect(result1.feed.feedUrl).toBe(result2.feed.feedUrl);
      expect(result1.feed.id).toBe(result2.feed.id);

      // First creates, second updates
      expect(result1.wasCreated).toBe(true);
      expect(result2.wasCreated).toBe(false);

      // Original discovery date preserved
      expect(result2.feed.discoveredAt).toBe(result1.feed.discoveredAt);
    });
  });

  describe('upsertDiscoveredFeed - Error Handling', () => {
    it('should throw error if no rows returned from database', async () => {
      vi.mocked(mockConn.query).mockResolvedValue([]);

      await expect(
        repository.upsertDiscoveredFeed(
          'tenant-1',
          'project-1',
          mockFeed,
          'dataforseo'
        )
      ).rejects.toThrow('Failed to upsert discovered feed');
    });

    it('should propagate database errors', async () => {
      vi.mocked(mockConn.query).mockRejectedValue(new Error('Database connection failed'));

      await expect(
        repository.upsertDiscoveredFeed(
          'tenant-1',
          'project-1',
          mockFeed,
          'dataforseo'
        )
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('upsertDiscoveredFeed - Thread Safety', () => {
    it('should handle concurrent upsert calls for same feed (simulated)', async () => {
      // Simulate concurrent calls by having both calls think they're creating
      // but MERGE ensures only one is actually created
      const mockResult = [{
        d: {
          id: 'mock-uuid-123',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          feedUrl: mockFeed.feedUrl,
          feedTitle: mockFeed.feedTitle,
          discoverySource: 'dataforseo',
          discoveredAt: '2025-11-02T10:00:00.000Z',
          relevanceScore: mockFeed.relevanceScore,
          updateFrequency: mockFeed.updateFrequency,
          lastUpdated: mockFeed.lastUpdated,
          language: mockFeed.language,
          websiteUrl: mockFeed.websiteUrl
        } as PersistedDiscoveredFeed,
        wasCreated: true // First concurrent call wins, creates the node
      }];

      const mockResult2 = [{
        d: {
          ...mockResult[0].d,
          lastChecked: '2025-11-02T10:00:01.000Z'
        } as PersistedDiscoveredFeed & { lastChecked?: string },
        wasCreated: false // Second concurrent call updates existing
      }];

      vi.mocked(mockConn.query)
        .mockResolvedValueOnce(mockResult)
        .mockResolvedValueOnce(mockResult2);

      // Simulate concurrent calls
      const [result1, result2] = await Promise.all([
        repository.upsertDiscoveredFeed('tenant-1', 'project-1', mockFeed, 'dataforseo'),
        repository.upsertDiscoveredFeed('tenant-1', 'project-1', mockFeed, 'dataforseo')
      ]);

      // Both calls succeed without throwing errors
      expect(result1.feed.feedUrl).toBe(mockFeed.feedUrl);
      expect(result2.feed.feedUrl).toBe(mockFeed.feedUrl);

      // Same feed ID (no duplicate created)
      expect(result1.feed.id).toBe(result2.feed.id);

      // At least one call succeeded with wasCreated=true
      const createdCount = [result1, result2].filter(r => r.wasCreated).length;
      expect(createdCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle concurrent upserts for different feeds', async () => {
      const feed1 = { ...mockFeed, feedUrl: 'https://feed1.com/rss' };
      const feed2 = { ...mockFeed, feedUrl: 'https://feed2.com/rss' };

      const mockResult1 = [{
        d: { id: 'id-1', tenantId: 'tenant-1', projectId: 'project-1', feedUrl: feed1.feedUrl, discoverySource: 'dataforseo', discoveredAt: '2025-11-02', feedTitle: feed1.feedTitle, relevanceScore: feed1.relevanceScore, updateFrequency: feed1.updateFrequency, lastUpdated: feed1.lastUpdated, language: feed1.language, websiteUrl: feed1.websiteUrl } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      const mockResult2 = [{
        d: { id: 'id-2', tenantId: 'tenant-1', projectId: 'project-1', feedUrl: feed2.feedUrl, discoverySource: 'dataforseo', discoveredAt: '2025-11-02', feedTitle: feed2.feedTitle, relevanceScore: feed2.relevanceScore, updateFrequency: feed2.updateFrequency, lastUpdated: feed2.lastUpdated, language: feed2.language, websiteUrl: feed2.websiteUrl } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      vi.mocked(mockConn.query)
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      // Concurrent upserts of different feeds
      const [result1, result2] = await Promise.all([
        repository.upsertDiscoveredFeed('tenant-1', 'project-1', feed1, 'dataforseo'),
        repository.upsertDiscoveredFeed('tenant-1', 'project-1', feed2, 'dataforseo')
      ]);

      // Both succeed and create different feeds
      expect(result1.feed.id).not.toBe(result2.feed.id);
      expect(result1.feed.feedUrl).toBe(feed1.feedUrl);
      expect(result2.feed.feedUrl).toBe(feed2.feedUrl);
      expect(result1.wasCreated).toBe(true);
      expect(result2.wasCreated).toBe(true);
    });
  });

  describe('upsertDiscoveredFeed - Discovery Source', () => {
    it('should accept tavily as discovery source', async () => {
      const mockResult = [{
        d: { id: 'mock-id', tenantId: 'tenant-1', projectId: 'project-1', feedUrl: mockFeed.feedUrl, discoverySource: 'tavily', discoveredAt: '2025-11-02', feedTitle: mockFeed.feedTitle, relevanceScore: mockFeed.relevanceScore, updateFrequency: mockFeed.updateFrequency, lastUpdated: mockFeed.lastUpdated, language: mockFeed.language, websiteUrl: mockFeed.websiteUrl } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      vi.mocked(mockConn.query).mockResolvedValue(mockResult);

      const result = await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'tavily'
      );

      expect(result.feed.discoverySource).toBe('tavily');
    });

    it('should accept manual as discovery source', async () => {
      const mockResult = [{
        d: { id: 'mock-id', tenantId: 'tenant-1', projectId: 'project-1', feedUrl: mockFeed.feedUrl, discoverySource: 'manual', discoveredAt: '2025-11-02', feedTitle: mockFeed.feedTitle, relevanceScore: mockFeed.relevanceScore, updateFrequency: mockFeed.updateFrequency, lastUpdated: mockFeed.lastUpdated, language: mockFeed.language, websiteUrl: mockFeed.websiteUrl } as PersistedDiscoveredFeed,
        wasCreated: true
      }];

      vi.mocked(mockConn.query).mockResolvedValue(mockResult);

      const result = await repository.upsertDiscoveredFeed(
        'tenant-1',
        'project-1',
        mockFeed,
        'manual'
      );

      expect(result.feed.discoverySource).toBe('manual');
    });
  });
});
