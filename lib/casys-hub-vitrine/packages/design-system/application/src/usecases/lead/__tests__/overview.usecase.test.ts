import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KeywordTagDTO } from '@casys/shared';
import { OverviewUseCase } from '../overview.usecase';
import type { LeadAnalysisUseCaseDeps, DomainIdentityStreamingCallbacks } from '../types';

describe('OverviewUseCase - Integration Test (Mock Only)', () => {
  let useCase: OverviewUseCase;
  let mockDeps: LeadAnalysisUseCaseDeps;
  let mockCallbacks: DomainIdentityStreamingCallbacks & {
    onPages: ReturnType<typeof vi.fn>;
    onKeywords: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock callbacks
    mockCallbacks = {
      onStatus: vi.fn().mockResolvedValue(undefined),
      onMetrics: vi.fn().mockResolvedValue(undefined),
      onBusinessContext: vi.fn().mockResolvedValue(undefined),
      onKeyword: vi.fn().mockResolvedValue(undefined),
      onPages: vi.fn().mockResolvedValue(undefined),
      onKeywords: vi.fn().mockResolvedValue(undefined),
    };

    // Mock dependencies
    mockDeps = {
      store: {
        save: vi.fn().mockResolvedValue(undefined),
        getById: vi.fn(),
        getByDomain: vi.fn(),
        upsertUnlock: vi.fn(),
        findUnlockToken: vi.fn(),
      },
      domainAnalysis: {
        analyzeDomains: vi.fn().mockResolvedValue([
          {
            domain: 'example.com',
            domainRank: 1000,
            organicTraffic: 50000,
            detectedLanguageCode: 'en',
            topKeywords: [
              { keyword: 'marketing automation', position: 5, searchVolume: 1200 },
              { keyword: 'email campaigns', position: 12, searchVolume: 800 },
            ],
          },
        ]),
      },
      businessContextAgent: {
        analyze: vi.fn().mockResolvedValue({
          industry: 'Technology',
          targetAudience: 'Marketing professionals',
          contentType: 'Blog',
        }),
      },
      keywordDiscovery: {
        discoverKeywords: vi.fn().mockResolvedValue([
          // AI-only keywords (sans DataForSEO metrics)
          {
            label: 'marketing automation',
            slug: 'marketing-automation',
            source: 'ai',
            sources: ['ai'],
            priority: 8,
            weight: 0.9,
            createdAt: '2025-01-20T10:00:00Z',
            aiEnrichment: {
              category: { type: 'service' },
              description: { text: 'Automated marketing workflows' },
              intent: { type: 'transactional' },
            },
          },
          {
            label: 'email campaigns',
            slug: 'email-campaigns',
            source: 'ai',
            sources: ['ai'],
            priority: 7,
            weight: 0.8,
            createdAt: '2025-01-20T10:00:00Z',
            aiEnrichment: {
              category: { type: 'feature' },
              intent: { type: 'transactional' },
            },
          },
          {
            label: 'content marketing',
            slug: 'content-marketing',
            source: 'ai',
            sources: ['ai'],
            priority: 6,
            weight: 0.7,
            createdAt: '2025-01-20T10:00:00Z',
          },
        ] as KeywordTagDTO[]),
      },
      keywordEnrichment: {
        enrichKeywords: vi.fn().mockResolvedValue([
          // DataForSEO enrichment complet
          {
            keyword: 'marketing automation',
            searchVolume: 1200,
            difficulty: 45,
            cpc: 12.5,
            competition: 'high' as const,
            lowTopOfPageBid: 8.0,
            highTopOfPageBid: 15.0,
            monthlySearches: [
              { year: 2025, month: 1, searchVolume: 1200 },
              { year: 2024, month: 12, searchVolume: 1150 },
            ],
          },
          {
            keyword: 'email campaigns',
            searchVolume: 800,
            difficulty: 38,
            cpc: 8.5,
            competition: 'medium' as const,
            lowTopOfPageBid: 5.0,
            highTopOfPageBid: 10.0,
            monthlySearches: [
              { year: 2025, month: 1, searchVolume: 800 },
              { year: 2024, month: 12, searchVolume: 780 },
            ],
          },
          {
            keyword: 'content marketing',
            searchVolume: 2500,
            difficulty: 52,
            cpc: 15.0,
            competition: 'high' as const,
            lowTopOfPageBid: 10.0,
            highTopOfPageBid: 20.0,
            monthlySearches: [
              { year: 2025, month: 1, searchVolume: 2500 },
            ],
          },
        ]),
        getRelatedKeywords: vi.fn().mockResolvedValue([]),
      },
      pageScraper: {
        scrapePage: vi.fn(),
        canHandle: vi.fn().mockReturnValue(true),
        scrapePages: vi.fn().mockResolvedValue([
          {
            url: 'https://example.com/',
            title: 'Example - Marketing Automation Platform',
            description: 'Leading marketing automation platform',
            content: 'We provide marketing automation tools, email campaigns, and content marketing solutions.',
            language: 'en',
          },
        ]),
      },
      logger: {
        debug: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    useCase = new OverviewUseCase(mockDeps);
  });

  describe('execute - Complete Keyword Discovery Flow', () => {
    it('should execute full keyword discovery flow: AI → Mapper → DataForSEO → Streaming', async () => {
      // Act
      const result = await useCase.execute(
        { domain: 'example.com' },
        mockCallbacks
      );

      // Assert - Vérifier le flow complet

      // 1. Domain analysis appelé
      expect(mockDeps.domainAnalysis.analyzeDomains).toHaveBeenCalledWith(['example.com']);

      // 2. Business context agent appelé
      expect(mockDeps.businessContextAgent!.analyze).toHaveBeenCalled();

      // 3. Keyword discovery appelé (Agent - AI keywords)
      expect(mockDeps.keywordDiscovery!.discoverKeywords).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'example.com' }),
        expect.objectContaining({
          pages: expect.arrayContaining([
            expect.objectContaining({ url: 'https://example.com/' }),
          ]),
          rankedKeywords: expect.arrayContaining([
            expect.objectContaining({ keyword: 'marketing automation' }),
          ]),
        }),
        'en'
      );

      // 4. Keyword enrichment appelé (DataForSEO API)
      expect(mockDeps.keywordEnrichment!.enrichKeywords).toHaveBeenCalled();
      const enrichmentCalls = vi.mocked(mockDeps.keywordEnrichment!.enrichKeywords).mock.calls;
      // Au moins 1 appel (peut être 2 si Phase 1 + Phase 2)
      expect(enrichmentCalls.length).toBeGreaterThanOrEqual(1);

      // 5. Streaming callbacks appelés
      expect(mockCallbacks.onKeyword).toHaveBeenCalled();
      const streamedKeywords = vi.mocked(mockCallbacks.onKeyword).mock.calls.map(call => call[0] as KeywordTagDTO);

      // Vérifier que les keywords streamés sont COMPLÈTEMENT enrichis
      expect(streamedKeywords.length).toBeGreaterThan(0);
      const firstStreamedKeyword = streamedKeywords[0];

      // Doit avoir AI enrichment (de l'agent)
      expect(firstStreamedKeyword.aiEnrichment).toBeDefined();

      // Doit avoir DataForSEO metrics (difficulty, cpc, trends)
      expect(firstStreamedKeyword.difficulty).toBeDefined();
      expect(firstStreamedKeyword.cpc).toBeDefined();
      expect(firstStreamedKeyword.monthlySearches).toBeDefined();
      expect(firstStreamedKeyword.monthlySearches!.length).toBeGreaterThan(0);

      // 6. Snapshot sauvegardé avec keywords enrichis
      expect(mockDeps.store.save).toHaveBeenCalled();
      const savedSnapshot = vi.mocked(mockDeps.store.save).mock.calls[0][0].snapshot;
      expect(savedSnapshot.discoveredKeywords).toBeDefined();
      expect(savedSnapshot.discoveredKeywords.length).toBe(3);

      // Keywords dans snapshot doivent être complètement enrichis
      const snapshotKeyword = savedSnapshot.discoveredKeywords[0];
      expect(snapshotKeyword.difficulty).toBeDefined();
      expect(snapshotKeyword.monthlySearches).toBeDefined();
    });

    it('should stream keywords AFTER DataForSEO enrichment (not before)', async () => {
      // Track call order
      const callOrder: string[] = [];

      vi.mocked(mockDeps.keywordEnrichment!.enrichKeywords).mockImplementation(async () => {
        callOrder.push('enrichKeywords');
        return [
          {
            keyword: 'marketing automation',
            searchVolume: 1200,
            difficulty: 45,
            cpc: 12.5,
            competition: 'high' as const,
            monthlySearches: [],
          },
        ];
      });

      vi.mocked(mockCallbacks.onKeyword).mockImplementation(async () => {
        callOrder.push('onKeyword');
      });

      // Act
      await useCase.execute({ domain: 'example.com' }, mockCallbacks);

      // Assert - Enrichment DOIT être appelé AVANT le streaming
      const firstEnrichmentIndex = callOrder.indexOf('enrichKeywords');
      const firstStreamIndex = callOrder.indexOf('onKeyword');

      expect(firstEnrichmentIndex).toBeGreaterThanOrEqual(0);
      expect(firstStreamIndex).toBeGreaterThan(firstEnrichmentIndex);
    });

    it('should handle keywords that match ranked keywords (mapper enrichment)', async () => {
      // Act
      await useCase.execute({ domain: 'example.com' }, mockCallbacks);

      // Assert
      const streamedKeywords = vi.mocked(mockCallbacks.onKeyword).mock.calls.map(call => call[0] as KeywordTagDTO);

      // "marketing automation" et "email campaigns" sont dans ranked keywords
      const marketingKeyword = streamedKeywords.find(k => k.label === 'marketing automation');
      const emailKeyword = streamedKeywords.find(k => k.label === 'email campaigns');

      // Ces keywords doivent avoir 'serp_discovered' dans sources
      expect(marketingKeyword?.sources).toContain('serp_discovered');
      expect(emailKeyword?.sources).toContain('serp_discovered');
    });

    it('should handle keywords NOT in ranked keywords (AI-only initially)', async () => {
      // Act
      await useCase.execute({ domain: 'example.com' }, mockCallbacks);

      // Assert
      const streamedKeywords = vi.mocked(mockCallbacks.onKeyword).mock.calls.map(call => call[0] as KeywordTagDTO);

      // "content marketing" n'est PAS dans ranked keywords
      const contentKeyword = streamedKeywords.find(k => k.label === 'content marketing');

      // Mais il doit quand même avoir les DataForSEO metrics
      expect(contentKeyword).toBeDefined();
      expect(contentKeyword!.difficulty).toBe(52);
      expect(contentKeyword!.searchVolume).toBe(2500);
      expect(contentKeyword!.monthlySearches).toBeDefined();
    });

    it('should fallback to ranked keywords if DataForSEO enrichment fails', async () => {
      // Arrange - Mock enrichment failure
      vi.mocked(mockDeps.keywordEnrichment!.enrichKeywords).mockRejectedValue(
        new Error('DataForSEO API error')
      );

      // Act
      await useCase.execute({ domain: 'example.com' }, mockCallbacks);

      // Assert - Should still stream keywords (with mapper enrichment only)
      expect(mockCallbacks.onKeyword).toHaveBeenCalled();
      const streamedKeywords = vi.mocked(mockCallbacks.onKeyword).mock.calls.map(call => call[0] as KeywordTagDTO);

      expect(streamedKeywords.length).toBeGreaterThan(0);

      // Keywords devraient avoir le searchVolume basique (mapper) mais pas difficulty/cpc
      const firstKeyword = streamedKeywords[0];
      expect(firstKeyword.searchVolume).toBeDefined(); // Depuis ranked keywords ou mapper
      expect(firstKeyword.difficulty).toBeUndefined(); // Pas de DataForSEO
    });

    it('should stream top 6 keywords first, then remaining keywords', async () => {
      // Arrange - Mock plus de 6 keywords
      vi.mocked(mockDeps.keywordDiscovery!.discoverKeywords).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          label: `keyword ${i + 1}`,
          slug: `keyword-${i + 1}`,
          source: 'ai',
          sources: ['ai'],
          priority: 10 - i,
          weight: 0.9 - i * 0.05,
          createdAt: '2025-01-20T10:00:00Z',
        } as KeywordTagDTO))
      );

      vi.mocked(mockDeps.keywordEnrichment!.enrichKeywords).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          keyword: `keyword ${i + 1}`,
          searchVolume: 1000 - i * 100,
          difficulty: 40 + i,
          cpc: 10.0,
          competition: 'medium' as const,
          monthlySearches: [],
        }))
      );

      // Act
      await useCase.execute({ domain: 'example.com' }, mockCallbacks);

      // Assert
      expect(mockCallbacks.onKeyword).toHaveBeenCalledTimes(10);

      // Les 6 premiers doivent être streamés en premier (ordre maintenu)
      const calls = vi.mocked(mockCallbacks.onKeyword).mock.calls;
      expect((calls[0][0] as KeywordTagDTO).label).toContain('keyword 1');
      expect((calls[5][0] as KeywordTagDTO).label).toContain('keyword 6');
      expect((calls[6][0] as KeywordTagDTO).label).toContain('keyword 7');
    });
  });
});
