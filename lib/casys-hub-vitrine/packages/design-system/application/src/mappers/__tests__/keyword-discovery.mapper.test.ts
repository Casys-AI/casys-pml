import { describe, it, expect } from 'vitest';
import type { KeywordTagDTO } from '@casys/shared';
import { KeywordDiscoveryMapper } from '../keyword-discovery.mapper';

describe('KeywordDiscoveryMapper', () => {
  const mapper = new KeywordDiscoveryMapper();

  describe('enrichWithRankedKeywords', () => {
    it('should enrich AI keywords with ranked keywords searchVolume', () => {
      // Arrange
      const aiKeywords: KeywordTagDTO[] = [
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
      ];

      const rankedKeywords = [
        { keyword: 'marketing automation', position: 5, searchVolume: 1200 },
        { keyword: 'email campaigns', position: 12, searchVolume: 800 },
        // content marketing n'est PAS dans ranked keywords
      ];

      // Act
      const result = mapper.enrichWithRankedKeywords(aiKeywords, rankedKeywords);

      // Assert
      expect(result).toHaveLength(3);

      // Premier keyword: enrichi avec ranked
      expect(result[0].label).toBe('marketing automation');
      expect(result[0].searchVolume).toBe(1200);
      expect(result[0].source).toBe('serp_discovered');
      expect(result[0].sources).toContain('ai');
      expect(result[0].sources).toContain('serp_discovered');
      expect(result[0].updatedAt).toBeDefined();
      expect(result[0].aiEnrichment).toBeDefined(); // Préservé

      // Deuxième keyword: enrichi avec ranked
      expect(result[1].label).toBe('email campaigns');
      expect(result[1].searchVolume).toBe(800);
      expect(result[1].source).toBe('serp_discovered');
      expect(result[1].sources).toContain('serp_discovered');

      // Troisième keyword: PAS enrichi (pas dans ranked)
      expect(result[2].label).toBe('content marketing');
      expect(result[2].searchVolume).toBeUndefined();
      expect(result[2].source).toBe('ai'); // Reste AI-only
      expect(result[2].sources).toEqual(['ai']); // Pas de serp_discovered
    });

    it('should handle case-insensitive matching', () => {
      // Arrange
      const aiKeywords: KeywordTagDTO[] = [
        {
          label: 'Marketing Automation',
          slug: 'marketing-automation',
          source: 'ai',
          sources: ['ai'],
          priority: 8,
          weight: 0.9,
          createdAt: '2025-01-20T10:00:00Z',
        },
      ];

      const rankedKeywords = [
        { keyword: 'marketing automation', position: 5, searchVolume: 1200 }, // lowercase
      ];

      // Act
      const result = mapper.enrichWithRankedKeywords(aiKeywords, rankedKeywords);

      // Assert
      expect(result[0].searchVolume).toBe(1200); // Match malgré casse différente
    });

    it('should preserve AI enrichment when adding ranked keywords', () => {
      // Arrange
      const aiKeywords: KeywordTagDTO[] = [
        {
          label: 'seo tools',
          slug: 'seo-tools',
          source: 'ai',
          sources: ['ai'],
          priority: 9,
          weight: 0.95,
          createdAt: '2025-01-20T10:00:00Z',
          aiEnrichment: {
            category: { type: 'product' },
            description: { text: 'SEO analysis software' },
            intent: { type: 'transactional' },
            relatedKeywords: [
              { slug: 'keyword-research' },
              { slug: 'backlink-analysis' },
            ],
          },
        },
      ];

      const rankedKeywords = [
        { keyword: 'seo tools', position: 3, searchVolume: 5000 },
      ];

      // Act
      const result = mapper.enrichWithRankedKeywords(aiKeywords, rankedKeywords);

      // Assert
      expect(result[0].aiEnrichment).toBeDefined();
      expect(result[0].aiEnrichment?.category?.type).toBe('product');
      expect(result[0].aiEnrichment?.description?.text).toBe('SEO analysis software');
      expect(result[0].aiEnrichment?.relatedKeywords).toHaveLength(2);
    });

    it('should return empty array when given empty AI keywords', () => {
      // Arrange
      const aiKeywords: KeywordTagDTO[] = [];
      const rankedKeywords = [
        { keyword: 'test', position: 1, searchVolume: 100 },
      ];

      // Act
      const result = mapper.enrichWithRankedKeywords(aiKeywords, rankedKeywords);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle empty ranked keywords array', () => {
      // Arrange
      const aiKeywords: KeywordTagDTO[] = [
        {
          label: 'marketing automation',
          slug: 'marketing-automation',
          source: 'ai',
          sources: ['ai'],
          priority: 8,
          weight: 0.9,
          createdAt: '2025-01-20T10:00:00Z',
        },
      ];
      const rankedKeywords: { keyword: string; position: number; searchVolume: number }[] = [];

      // Act
      const result = mapper.enrichWithRankedKeywords(aiKeywords, rankedKeywords);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].searchVolume).toBeUndefined();
      expect(result[0].source).toBe('ai'); // Reste AI-only
    });
  });
});
