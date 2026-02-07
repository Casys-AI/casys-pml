/**
 * Tests for DiscoverRssFeedsUseCase (v2 Architecture)
 * Tests streaming, parallel qualification, and auto-selection logic
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedQualification, RawFeed } from '@casys/core';

import type { FeedQualificationPort, RssFeedDiscoveryPort, RssFeedRepositoryPort } from '../../../ports/out';
import { type DiscoverRssFeedsInput,DiscoverRssFeedsUseCase } from '../discover-rss-feeds.usecase';

describe('DiscoverRssFeedsUseCase - v2 Architecture', () => {
  let useCase: DiscoverRssFeedsUseCase;
  let mockDiscoveryPort: RssFeedDiscoveryPort;
  let mockQualificationPort: FeedQualificationPort;
  let mockRssFeedRepository: RssFeedRepositoryPort;

  const baseInput: DiscoverRssFeedsInput = {
    tenantId: 'test-tenant-id',
    projectId: 'test-project-id',
    businessContext: {
      industry: 'BTP Construction',
      targetAudience: 'Construction professionals',
      businessDescription: 'Construction industry news'
    },
    language: 'fr'
  };

  beforeEach(() => {
    // Mock discovery port
    mockDiscoveryPort = {
      discoverRawFeeds: vi.fn(),
      discoverFeeds: vi.fn() // Legacy method
    };

    // Mock qualification port
    mockQualificationPort = {
      qualifyFeed: vi.fn()
    };

    // Mock RSS feed repository
    mockRssFeedRepository = {
      upsertDiscoveredFeed: vi.fn(),
      listDiscoveredFeeds: vi.fn(),
      getDiscoveredFeedById: vi.fn(),
      deleteDiscoveredFeed: vi.fn(),
      createSubscription: vi.fn(),
      listSubscriptions: vi.fn(),
      getSubscriptionById: vi.fn(),
      updateSubscription: vi.fn(),
      deleteSubscription: vi.fn(),
      isAlreadySubscribed: vi.fn(),
      subscribeFromDiscovery: vi.fn()
    };

    useCase = new DiscoverRssFeedsUseCase(
      mockDiscoveryPort,
      mockQualificationPort,
      mockRssFeedRepository
    );
  });

  describe('Input Validation', () => {
    it('should throw error when industry is missing', async () => {
      const invalidInput = {
        ...baseInput,
        businessContext: {
          ...baseInput.businessContext,
          industry: ''
        }
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Business context must include industry'
      );
    });

    it('should throw error when targetAudience is missing', async () => {
      const invalidInput = {
        ...baseInput,
        businessContext: {
          ...baseInput.businessContext,
          targetAudience: ''
        }
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Business context must include targetAudience'
      );
    });

    it('should throw error when language is missing', async () => {
      const invalidInput = {
        ...baseInput,
        language: ''
      };

      await expect(useCase.execute(invalidInput)).rejects.toThrow(
        'Language is required (should come from project config)'
      );
    });
  });

  describe('Discovery Flow (v2 Architecture)', () => {
    const mockRawFeeds: RawFeed[] = [
      {
        url: 'https://www.batiactu.com/accueil.rss',
        title: 'Batiactu - Actualités BTP',
        description: 'Toute l\'actualité de la construction',
        websiteUrl: 'https://www.batiactu.com',
        language: 'fr'
      },
      {
        url: 'https://www.lemoniteur.fr/rss.xml',
        title: 'Le Moniteur',
        description: 'Actualités construction et BTP',
        websiteUrl: 'https://www.lemoniteur.fr',
        language: 'fr'
      }
    ];

    beforeEach(() => {
      // Mock discovery to return raw feeds
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(mockRawFeeds);

      // Mock qualification to return high scores
      vi.mocked(mockQualificationPort.qualifyFeed).mockResolvedValue({
        score: 85,
        relevanceReason: 'Highly relevant to BTP industry',
        category: 'construction',
        updateFrequency: 'daily',
        lastUpdated: '2025-10-30',
        status: 'relevant'
      } as FeedQualification);
    });

    it('should discover raw feeds from adapter', async () => {
      await useCase.execute(baseInput);

      expect(mockDiscoveryPort.discoverRawFeeds).toHaveBeenCalledWith(
        expect.objectContaining({
          industry: 'BTP Construction',
          targetAudience: 'Construction professionals'
        }),
        expect.objectContaining({
          language: 'fr',
          maxResults: 15 // Default: get more to have choice after qualification
        })
      );
    });

    it('should stream all raw feeds immediately after discovery', async () => {
      const onFeedDiscovered = vi.fn();

      await useCase.execute({
        ...baseInput,
        onFeedDiscovered
      });

      expect(onFeedDiscovered).toHaveBeenCalledTimes(2);
      expect(onFeedDiscovered).toHaveBeenCalledWith(mockRawFeeds[0]);
      expect(onFeedDiscovered).toHaveBeenCalledWith(mockRawFeeds[1]);
    });

    it('should qualify all feeds in parallel', async () => {
      await useCase.execute(baseInput);

      expect(mockQualificationPort.qualifyFeed).toHaveBeenCalledTimes(2);
      expect(mockQualificationPort.qualifyFeed).toHaveBeenCalledWith(
        mockRawFeeds[0],
        expect.any(Object)
      );
      expect(mockQualificationPort.qualifyFeed).toHaveBeenCalledWith(
        mockRawFeeds[1],
        expect.any(Object)
      );
    });

    it('should stream qualification callbacks as they arrive', async () => {
      const onFeedQualifying = vi.fn();
      const onFeedQualified = vi.fn();

      await useCase.execute({
        ...baseInput,
        onFeedQualifying,
        onFeedQualified
      });

      expect(onFeedQualifying).toHaveBeenCalledTimes(2);
      expect(onFeedQualified).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no feeds discovered', async () => {
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue([]);

      const result = await useCase.execute(baseInput);

      expect(result).toEqual([]);
      expect(mockQualificationPort.qualifyFeed).not.toHaveBeenCalled();
    });
  });

  describe('Auto-Selection Logic', () => {
    it('should select feeds with score >= 60 (🟢 + 🟠)', async () => {
      const mockRawFeeds: RawFeed[] = [
        {
          url: 'https://feed1.com/rss',
          title: 'Feed 1',
          description: 'Excellent feed',
          websiteUrl: 'https://feed1.com',
          language: 'fr'
        },
        {
          url: 'https://feed2.com/rss',
          title: 'Feed 2',
          description: 'Good feed',
          websiteUrl: 'https://feed2.com',
          language: 'fr'
        },
        {
          url: 'https://feed3.com/rss',
          title: 'Feed 3',
          description: 'Poor feed',
          websiteUrl: 'https://feed3.com',
          language: 'fr'
        }
      ];

      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(mockRawFeeds);

      // Mock different scores: 85 (🟢), 65 (🟠), 45 (🔴)
      vi.mocked(mockQualificationPort.qualifyFeed)
        .mockResolvedValueOnce({ score: 85, status: 'relevant' } as FeedQualification)
        .mockResolvedValueOnce({ score: 65, status: 'relevant' } as FeedQualification)
        .mockResolvedValueOnce({ score: 45, status: 'low_relevance' } as FeedQualification);

      const result = await useCase.execute(baseInput);

      expect(result).toHaveLength(2); // Only >= 60
      expect(result[0].relevanceScore).toBe(85);
      expect(result[1].relevanceScore).toBe(65);
    });

    it('should limit selection to max 5 feeds', async () => {
      const mockRawFeeds: RawFeed[] = Array.from({ length: 10 }, (_, i) => ({
        url: `https://feed${i}.com/rss`,
        title: `Feed ${i}`,
        description: `Feed ${i} description`,
        websiteUrl: `https://feed${i}.com`,
        language: 'fr'
      }));

      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(mockRawFeeds);

      // All feeds have high scores
      vi.mocked(mockQualificationPort.qualifyFeed).mockResolvedValue({
        score: 80,
        status: 'relevant'
      } as FeedQualification);

      const result = await useCase.execute(baseInput);

      expect(result).toHaveLength(5); // Max 5
    });

    it('should sort selected feeds by score (best first)', async () => {
      const mockRawFeeds: RawFeed[] = [
        {
          url: 'https://feed1.com/rss',
          title: 'Feed 1',
          description: 'Feed 1',
          websiteUrl: 'https://feed1.com',
          language: 'fr'
        },
        {
          url: 'https://feed2.com/rss',
          title: 'Feed 2',
          description: 'Feed 2',
          websiteUrl: 'https://feed2.com',
          language: 'fr'
        },
        {
          url: 'https://feed3.com/rss',
          title: 'Feed 3',
          description: 'Feed 3',
          websiteUrl: 'https://feed3.com',
          language: 'fr'
        }
      ];

      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(mockRawFeeds);

      // Mock scores: 65, 90, 75
      vi.mocked(mockQualificationPort.qualifyFeed)
        .mockResolvedValueOnce({ score: 65, status: 'relevant' } as FeedQualification)
        .mockResolvedValueOnce({ score: 90, status: 'relevant' } as FeedQualification)
        .mockResolvedValueOnce({ score: 75, status: 'relevant' } as FeedQualification);

      const result = await useCase.execute(baseInput);

      // Should be sorted: 90, 75, 65
      expect(result[0].relevanceScore).toBe(90);
      expect(result[1].relevanceScore).toBe(75);
      expect(result[2].relevanceScore).toBe(65);
    });

    it('should call onSelectionComplete with selected and rejected feeds', async () => {
      const mockRawFeeds: RawFeed[] = [
        {
          url: 'https://feed1.com/rss',
          title: 'Feed 1',
          description: 'Feed 1',
          websiteUrl: 'https://feed1.com',
          language: 'fr'
        },
        {
          url: 'https://feed2.com/rss',
          title: 'Feed 2',
          description: 'Feed 2',
          websiteUrl: 'https://feed2.com',
          language: 'fr'
        }
      ];

      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(mockRawFeeds);

      // Mock scores: 85 (selected), 45 (rejected)
      vi.mocked(mockQualificationPort.qualifyFeed)
        .mockResolvedValueOnce({ score: 85, status: 'relevant' } as FeedQualification)
        .mockResolvedValueOnce({ score: 45, status: 'low_relevance' } as FeedQualification);

      const onSelectionComplete = vi.fn();

      await useCase.execute({
        ...baseInput,
        onSelectionComplete
      });

      expect(onSelectionComplete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ relevanceScore: 85 })
        ]),
        expect.arrayContaining([
          expect.objectContaining({ relevanceScore: 45 })
        ])
      );
    });
  });

  describe('Progress Callbacks', () => {
    beforeEach(() => {
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue([
        {
          url: 'https://test.com/rss',
          title: 'Test Feed',
          description: 'Test',
          websiteUrl: 'https://test.com',
          language: 'fr'
        }
      ]);

      vi.mocked(mockQualificationPort.qualifyFeed).mockResolvedValue({
        score: 80,
        status: 'relevant'
      } as FeedQualification);
    });

    it('should call onProgress at each stage', async () => {
      const onProgress = vi.fn();

      await useCase.execute({
        ...baseInput,
        onProgress
      });

      expect(onProgress).toHaveBeenCalledWith('Découverte des flux RSS...', 'discovery');
      expect(onProgress).toHaveBeenCalledWith(
        expect.stringContaining('Streaming de'),
        'streaming'
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.stringContaining('Qualification de'),
        'qualifying'
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.stringContaining('Sélection terminée'),
        'done'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle maxResults parameter', async () => {
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue([]);

      await useCase.execute({
        ...baseInput,
        maxResults: 20
      });

      expect(mockDiscoveryPort.discoverRawFeeds).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          maxResults: 20
        })
      );
    });

    it('should pass excludeUrls to discovery adapter', async () => {
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue([]);

      const excludeUrls = ['https://excluded.com/feed'];

      await useCase.execute({
        ...baseInput,
        excludeUrls
      });

      expect(mockDiscoveryPort.discoverRawFeeds).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          excludeUrls
        })
      );
    });

    it('should handle searchDepth parameter', async () => {
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue([]);

      await useCase.execute({
        ...baseInput,
        searchDepth: 'advanced'
      });

      expect(mockDiscoveryPort.discoverRawFeeds).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          searchDepth: 'advanced'
        })
      );
    });
  });

  describe('Feed Persistence', () => {
    const mockRawFeeds: RawFeed[] = [
      {
        url: 'https://feed1.com/rss',
        title: 'Feed 1',
        description: 'Test feed 1',
        websiteUrl: 'https://feed1.com',
        language: 'fr'
      },
      {
        url: 'https://feed2.com/rss',
        title: 'Feed 2',
        description: 'Test feed 2',
        websiteUrl: 'https://feed2.com',
        language: 'fr'
      }
    ];

    beforeEach(() => {
      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(mockRawFeeds);

      vi.mocked(mockQualificationPort.qualifyFeed).mockResolvedValue({
        score: 85,
        relevanceReason: 'Highly relevant',
        category: 'technology',
        updateFrequency: 'daily',
        lastUpdated: '2025-11-02',
        status: 'relevant'
      } as FeedQualification);

      // Mock upsertDiscoveredFeed to return feed with wasCreated flag
      vi.mocked(mockRssFeedRepository.upsertDiscoveredFeed).mockImplementation(
        async (tenantId, projectId, feed, source) => ({
          feed: {
            id: 'mock-id',
            tenantId,
            projectId,
            discoverySource: source,
            discoveredAt: new Date().toISOString(),
            ...feed
          },
          wasCreated: true
        })
      );
    });

    it('should persist all qualified feeds using upsertDiscoveredFeed', async () => {
      await useCase.execute(baseInput);

      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenCalledTimes(2);

      // Verify first call
      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenNthCalledWith(
        1,
        'test-tenant-id',
        'test-project-id',
        expect.objectContaining({
          feedUrl: 'https://feed1.com/rss',
          feedTitle: 'Feed 1'
        }),
        'dataforseo' // Default discovery source
      );

      // Verify second call
      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenNthCalledWith(
        2,
        'test-tenant-id',
        'test-project-id',
        expect.objectContaining({
          feedUrl: 'https://feed2.com/rss',
          feedTitle: 'Feed 2'
        }),
        'dataforseo'
      );
    });

    it('should use custom discoverySource when provided', async () => {
      await useCase.execute({
        ...baseInput,
        discoverySource: 'tavily'
      });

      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        'tavily'
      );
    });

    it('should persist ALL qualified feeds regardless of score (idempotence test)', async () => {
      // Mock 3 feeds with different scores: 85 (🟢), 65 (🟠), 45 (🔴)
      const threeFeeds: RawFeed[] = [
        { url: 'https://feed1.com/rss', title: 'Feed 1', websiteUrl: 'https://feed1.com', language: 'fr' },
        { url: 'https://feed2.com/rss', title: 'Feed 2', websiteUrl: 'https://feed2.com', language: 'fr' },
        { url: 'https://feed3.com/rss', title: 'Feed 3', websiteUrl: 'https://feed3.com', language: 'fr' }
      ];

      vi.mocked(mockDiscoveryPort.discoverRawFeeds).mockResolvedValue(threeFeeds);

      vi.mocked(mockQualificationPort.qualifyFeed)
        .mockResolvedValueOnce({ score: 85, status: 'relevant', relevanceReason: 'High', category: 'tech', updateFrequency: 'daily', lastUpdated: '2025-11-02' } as FeedQualification)
        .mockResolvedValueOnce({ score: 65, status: 'relevant', relevanceReason: 'Medium', category: 'tech', updateFrequency: 'daily', lastUpdated: '2025-11-02' } as FeedQualification)
        .mockResolvedValueOnce({ score: 45, status: 'low_relevance', relevanceReason: 'Low', category: 'tech', updateFrequency: 'daily', lastUpdated: '2025-11-02' } as FeedQualification);

      await useCase.execute(baseInput);

      // All 3 feeds should be persisted (not just selected ones)
      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenCalledTimes(3);
    });

    it('should continue persistence even if one feed fails', async () => {
      // Mock first upsert to fail, others succeed
      vi.mocked(mockRssFeedRepository.upsertDiscoveredFeed)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          feed: { id: 'mock-id-2', tenantId: 'test-tenant-id', projectId: 'test-project-id', discoverySource: 'dataforseo', discoveredAt: '2025-11-02', feedUrl: 'https://feed2.com/rss', feedTitle: 'Feed 2', relevanceScore: 85, updateFrequency: 'daily', lastUpdated: '2025-11-02', language: 'fr' },
          wasCreated: true
        });

      const result = await useCase.execute(baseInput);

      // Should still return selected feeds even if persistence partially failed
      expect(result).toHaveLength(2); // Both feeds qualified
      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent persistence calls (idempotence)', async () => {
      // Simulate multiple persistence calls with wasCreated flag variations
      vi.mocked(mockRssFeedRepository.upsertDiscoveredFeed)
        .mockResolvedValueOnce({
          feed: { id: 'id-1', tenantId: 'test-tenant-id', projectId: 'test-project-id', discoverySource: 'dataforseo', discoveredAt: '2025-11-02', feedUrl: 'https://feed1.com/rss', feedTitle: 'Feed 1', relevanceScore: 85, updateFrequency: 'daily', lastUpdated: '2025-11-02', language: 'fr' },
          wasCreated: true  // New feed
        })
        .mockResolvedValueOnce({
          feed: { id: 'id-2', tenantId: 'test-tenant-id', projectId: 'test-project-id', discoverySource: 'dataforseo', discoveredAt: '2025-11-01', feedUrl: 'https://feed2.com/rss', feedTitle: 'Feed 2', relevanceScore: 85, updateFrequency: 'daily', lastUpdated: '2025-11-02', language: 'fr', lastChecked: '2025-11-02' },
          wasCreated: false // Already existed (re-discovery)
        });

      const result = await useCase.execute(baseInput);

      expect(result).toHaveLength(2);
      // Both feeds persisted regardless of wasCreated flag
      expect(mockRssFeedRepository.upsertDiscoveredFeed).toHaveBeenCalledTimes(2);
    });
  });
});
