import { beforeEach, describe, expect, it } from 'vitest';

import { RssContentStrategy } from '../rss-content.strategy';

describe('RssContentStrategy', () => {
  let strategy: RssContentStrategy;

  beforeEach(() => {
    strategy = new RssContentStrategy();
  });

  describe('canHandle', () => {
    it('should handle HTTP URLs', () => {
      expect(strategy.canHandle('http://example.com')).toBe(true);
      expect(strategy.canHandle('https://example.com')).toBe(true);
    });

    it('should not handle non-HTTP URLs', () => {
      expect(strategy.canHandle('ftp://example.com')).toBe(false);
      expect(strategy.canHandle('file:///path')).toBe(false);
    });
  });

  describe('extract', () => {
    it('should extract RSS content when available and sufficient', async () => {
      const mockArticle = {
        id: 'test-1',
        title: 'Test Article',
        sourceUrl: 'https://example.com/article',
        createdAt: '2024-01-01T00:00:00Z',
        author: 'Test Author',
        metadata: {
          content: 'This is a long RSS content that is more than 200 characters long and should be processed by the RSS strategy. It contains enough information to be considered valid for direct usage without requiring additional HTTP requests.',
        },
      };

      const result = await strategy.extract('https://example.com/article', mockArticle as any);

      expect(result.content).toBeDefined();
      expect(result.strategy).toBe('rss-content');
      expect(result.confidence).toBe(0.9);
      expect(result.title).toBe('Test Article');
      expect(result.author).toBe('Test Author');
      expect(result.metadata?.source).toBe('rss_content_encoded');
    });

    it('should throw error when RSS content is too short', async () => {
      const mockArticle = {
        id: 'test-1',
        title: 'Test Article',
        sourceUrl: 'https://example.com/article',
        metadata: {
          content: 'Too short', // < 200 chars
        },
      };

      await expect(strategy.extract('https://example.com/article', mockArticle as any))
        .rejects.toThrow('RSS content not available or too short');
    });

    it('should throw error when RSS content is missing', async () => {
      const mockArticle = {
        id: 'test-1',
        title: 'Test Article',
        sourceUrl: 'https://example.com/article',
        metadata: {}, // No content
      };

      await expect(strategy.extract('https://example.com/article', mockArticle as any))
        .rejects.toThrow('RSS content not available or too short');
    });

    it('should clean HTML entities from RSS content', async () => {
      const mockArticle = {
        id: 'test-1',
        title: 'Test Article',
        sourceUrl: 'https://example.com/article',
        metadata: {
          content: 'Content with &amp; entities &lt;tag&gt; and &quot;quotes&quot; plus &nbsp; spaces. This needs to be long enough to pass the 200 character minimum length requirement for RSS content processing. Adding more text to ensure we meet the minimum length requirement for RSS content validation which is set to 200 characters minimum.',
        },
      };

      const result = await strategy.extract('https://example.com/article', mockArticle as any);

      expect(result.content).toContain('& entities');
      expect(result.content).toContain('<tag>');
      expect(result.content).toContain('"quotes"');
      expect(result.content).not.toContain('&amp;');
      expect(result.content).not.toContain('&lt;');
      expect(result.content).not.toContain('&nbsp;');
    });

    it('should have highest priority', () => {
      expect(strategy.priority).toBe(10);
    });

    it('should return correct metadata', async () => {
      const mockArticle = {
        id: 'test-1',
        title: 'Test Article',
        sourceUrl: 'https://example.com/article',
        metadata: {
          content: 'A sufficiently long RSS content that meets the minimum requirements for processing and should result in successful extraction with proper metadata tracking and confidence scoring. Adding more content to ensure we exceed the 200 character minimum length requirement set by the RSS content strategy validation logic.',
        },
      };

      const result = await strategy.extract('https://example.com/article', mockArticle as any);

      expect(result.metadata).toEqual({
        source: 'rss_content_encoded',
        originalLength: mockArticle.metadata.content.length,
        cleanedLength: result.content.length,
        extractionTime: 0,
      });
    });
  });
});
