import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicCandidate } from '@casys/core';

import type { ContentQualificationAgent } from '../../../ai/agents/content-qualification.agent';
import { ContentExtractionService } from '../content-extraction.service';

describe('ContentExtractionService', () => {
  let service: ContentExtractionService;
  let mockQualificationAgent: ContentQualificationAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockQualificationAgent = {
      _call: vi.fn().mockResolvedValue(JSON.stringify({
        success: true,
        result: {
          cleanedContent: 'AI cleaned content',
          contentType: 'article',
          keyPoints: ['Point 1', 'Point 2'],
          qualityScore: 0.85,
          summary: 'AI generated summary',
        }
      })),
    } as any;

    service = new ContentExtractionService(mockQualificationAgent, {
      enabledStrategies: ['direct-scraping'], // Use only direct scraping to avoid mock issues
    });
  });

  describe('extractContent', () => {
    const mockArticle: TopicCandidate = {
      id: 'test-1',
      title: 'Test Article',
      description: 'Test description',
      sourceUrl: 'https://example.com/article',
      publishedAt: new Date('2024-01-01'),
      author: 'Test Author',
      imageUrls: ['https://example.com/image.jpg'],
      language: 'en',
      metadata: { category: 'tech' },
    };

    it('should extract and qualify content successfully', async () => {
      const result = await service.extractContent('https://example.com/article', mockArticle);

      expect(result).toBeDefined();
      expect(result.cleanedContent).toBe('AI cleaned content');
      expect(result.contentType).toBe('article');
      expect(result.keyPoints).toEqual(['Point 1', 'Point 2']);
      expect(result.qualityScore).toBe(0.85);
      expect(result.summary).toBe('AI generated summary');
    });

    it('should use cache for repeated URLs', async () => {
      const url = 'https://example.com/article';

      // First call
      const result1 = await service.extractContent(url, mockArticle);
      
      // Second call should use cache (qualification agent not called twice)
      const result2 = await service.extractContent(url, mockArticle);

      expect(result1).toEqual(result2);
      expect(mockQualificationAgent._call).toHaveBeenCalledTimes(1);
    });

    it('should handle qualification agent failure gracefully', async () => {
      (mockQualificationAgent._call as any) = vi.fn().mockRejectedValue(new Error('AI Error'));

      const result = await service.extractContent('https://example.com/article', mockArticle);

      // Should fallback to raw content without AI qualification
      expect(result.cleanedContent).toBeDefined();
      expect(result.contentType).toBe('other');
      expect(result.keyPoints).toEqual([]);
    });

    it('should handle qualification agent invalid response', async () => {
      (mockQualificationAgent._call as any) = vi.fn().mockResolvedValue(JSON.stringify({
        success: false,
        error: 'Qualification failed'
      }));

      const result = await service.extractContent('https://example.com/article', mockArticle);

      // Should fallback to raw content
      expect(result.cleanedContent).toBeDefined();
      expect(result.contentType).toBe('other');
    });

    it('should pass correct input to qualification agent', async () => {
      await service.extractContent('https://example.com/article', mockArticle);

      expect(mockQualificationAgent._call).toHaveBeenCalledWith(
        expect.stringContaining('"title":"Test Article"')
      );
      expect(mockQualificationAgent._call).toHaveBeenCalledWith(
        expect.stringContaining('"url":"https://example.com/article"')
      );
    });
  });

  describe('cache management', () => {
    it('should provide cache stats', () => {
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('urls');
      expect(Array.isArray(stats.urls)).toBe(true);
    });

    it('should clear cache', () => {
      service.clearCache();
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('strategy initialization', () => {
    it('should initialize only enabled strategies', () => {
      const selectiveService = new ContentExtractionService(mockQualificationAgent, {
        enabledStrategies: ['direct-scraping'],
      });

      // Service should be created without throwing
      expect(selectiveService).toBeDefined();
    });

    it('should handle empty strategies list', () => {
      const emptyService = new ContentExtractionService(mockQualificationAgent, {
        enabledStrategies: [],
      });

      expect(emptyService).toBeDefined();
    });
  });
});
