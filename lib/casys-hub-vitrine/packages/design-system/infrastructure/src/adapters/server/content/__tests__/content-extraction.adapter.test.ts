import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicCandidate } from '@casys/core';

import { ContentExtractionAdapter } from '../content-extraction.adapter';
import type { ContentExtractionService } from '../services/content-extraction.service';

describe('ContentExtractionAdapter', () => {
  let adapter: ContentExtractionAdapter;
  let mockService: ContentExtractionService;

  beforeEach(() => {
    mockService = {
      extractContent: vi.fn(),
    } as any;

    adapter = new ContentExtractionAdapter(mockService);
  });

  describe('canHandle', () => {
    it('should handle HTTP and HTTPS URLs', () => {
      expect(adapter.canHandle('http://example.com')).toBe(true);
      expect(adapter.canHandle('https://example.com')).toBe(true);
    });

    it('should not handle non-HTTP URLs', () => {
      expect(adapter.canHandle('ftp://example.com')).toBe(false);
      expect(adapter.canHandle('file:///path')).toBe(false);
    });
  });

  describe('fetchFullContent', () => {
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

    it('should successfully extract and enrich article content', async () => {
      const mockServiceResponse = {
        content: 'Original content',
        cleanedContent: 'AI cleaned content',
        title: 'Service Title',
        author: 'Service Author',
        publishedAt: new Date('2024-01-01'),
        strategy: 'jina-reader',
        confidence: 0.8,
        qualityScore: 0.9,
        contentType: 'article',
        keyPoints: ['Point 1', 'Point 2'],
        summary: 'AI summary',
      };

      mockService.extractContent = vi.fn().mockResolvedValue(mockServiceResponse);

      const result = await adapter.fetchFullContent(mockArticle);

      expect(mockService.extractContent).toHaveBeenCalledWith(
        mockArticle.sourceUrl,
        mockArticle
      );

      expect(result).toEqual({
        id: mockArticle.id,
        title: 'Service Title',
        description: 'AI summary',
        sourceUrl: mockArticle.sourceUrl,
        sourceTitle: 'Source inconnue',
        publishedAt: new Date('2024-01-01'),
        author: 'Service Author',
        fullContent: 'AI cleaned content',
        imageUrls: mockArticle.imageUrls,
        language: mockArticle.language,
        metadata: {
          category: 'tech',
          extractionStrategy: 'jina-reader',
          confidence: 0.8,
          qualityScore: 0.9,
          contentType: 'article',
          keyPoints: ['Point 1', 'Point 2'],
          agentProcessed: true,
          extractionTimestamp: expect.any(String),
        },
      });
    });

    it('should handle service failure gracefully', async () => {
      mockService.extractContent = vi.fn().mockRejectedValue(new Error('Service failed'));

      const result = await adapter.fetchFullContent(mockArticle);

      expect(result.fullContent).toBe('Test description');
      expect(result.metadata?.agentProcessed).toBe(false);
      expect(result.metadata?.extractionStrategy).toBe('fallback');
      expect(result.metadata?.confidence).toBe(0.1);
    });

    it('should use article description as fallback when no description', async () => {
      const articleWithoutDesc = { ...mockArticle, description: undefined };
      
      mockService.extractContent = vi.fn().mockRejectedValue(new Error('Failed'));

      const result = await adapter.fetchFullContent(articleWithoutDesc);

      expect(result.fullContent).toBe('Contenu non disponible');
      expect(result.description).toBe('Description non disponible');
    });

    it('should preserve original metadata and add extraction metadata', async () => {
      const mockServiceResponse = {
        cleanedContent: 'Cleaned content',
        strategy: 'rss-content',
        confidence: 0.95,
        qualityScore: 0.88,
        contentType: 'blog',
        keyPoints: ['Key insight'],
      };

      mockService.extractContent = vi.fn().mockResolvedValue(mockServiceResponse);

      const result = await adapter.fetchFullContent(mockArticle);

      expect(result.metadata).toMatchObject({
        // Original metadata preserved
        category: 'tech',
        // New extraction metadata added
        extractionStrategy: 'rss-content',
        confidence: 0.95,
        qualityScore: 0.88,
        contentType: 'blog',
        keyPoints: ['Key insight'],
        agentProcessed: true,
        extractionTimestamp: expect.any(String),
      });
    });

    it('should handle missing optional fields in service response', async () => {
      const mockServiceResponse = {
        cleanedContent: 'Basic cleaned content',
        strategy: 'direct-scraping',
        confidence: 0.6,
        // Missing optional fields
      };

      mockService.extractContent = vi.fn().mockResolvedValue(mockServiceResponse);

      const result = await adapter.fetchFullContent(mockArticle);

      expect(result.title).toBe(mockArticle.title); // Falls back to original
      expect(result.author).toBe(mockArticle.author); // Falls back to original
      expect(result.publishedAt).toEqual(expect.any(Date)); // Gets current date
      expect(result.fullContent).toBe('Basic cleaned content');
    });
  });
});
