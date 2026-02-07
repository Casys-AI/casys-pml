import { describe, it, expect, vi } from 'vitest';

import type { PageContent } from '../../../ports/out/page-scraper.port';
import {
  buildPagesSummary,
  filterPagesByLanguage,
  matchKeywordsWithRankedData,
  scrapeImportantPages,
} from '../helpers';

describe('Lead Analysis Helpers', () => {
  describe('buildPagesSummary', () => {
    it('should build summary from pages with content capped at 2000 chars', () => {
      const pages: PageContent[] = [
        {
          url: 'https://example.com/page1',
          title: 'Page 1',
          description: 'Description 1',
          content: 'A'.repeat(3000),
          language: 'en',
        },
        {
          url: 'https://example.com/page2',
          title: 'Page 2',
          description: 'Description 2',
          content: 'Short content',
          language: 'en',
        },
      ];

      const summary = buildPagesSummary(pages);

      expect(summary).toContain('Page 1 (https://example.com/page1)');
      expect(summary).toContain('Title: Page 1');
      expect(summary).toContain('Description: Description 1');
      expect(summary).toContain('Page 2 (https://example.com/page2)');
      // Content should be capped at 2000 chars
      expect(summary.match(/Content: A+/)?.[0].length).toBeLessThanOrEqual(2009); // "Content: " + 2000 chars
    });

    it('should handle pages without optional fields', () => {
      const pages: PageContent[] = [
        {
          url: 'https://example.com/page1',
          language: 'en',
        },
      ];

      const summary = buildPagesSummary(pages);

      expect(summary).toContain('Title: N/A');
      expect(summary).toContain('Description: N/A');
    });

    it('should limit to 3 pages max', () => {
      const pages: PageContent[] = Array.from({ length: 5 }, (_, i) => ({
        url: `https://example.com/page${i}`,
        title: `Page ${i}`,
        language: 'en',
      }));

      const summary = buildPagesSummary(pages);

      // Summary should contain Page 1, 2, 3 (indices 0, 1, 2)
      expect(summary).toContain('Page 1 (https://example.com/page0)');
      expect(summary).toContain('Page 2 (https://example.com/page1)');
      expect(summary).toContain('Page 3 (https://example.com/page2)');
      // Should NOT contain pages 4 and 5 (indices 3, 4)
      expect(summary).not.toContain('https://example.com/page3');
      expect(summary).not.toContain('https://example.com/page4');
    });
  });

  describe('filterPagesByLanguage', () => {
    it('should filter pages by target language', () => {
      const pages: PageContent[] = [
        { url: 'https://example.com/en', language: 'en' },
        { url: 'https://example.com/fr', language: 'fr' },
        { url: 'https://example.com/en2', language: 'en' },
      ];

      const filtered = filterPagesByLanguage(pages, 'en');

      expect(filtered).toHaveLength(2);
      expect(filtered[0].url).toBe('https://example.com/en');
      expect(filtered[1].url).toBe('https://example.com/en2');
    });

    it('should keep pages without language detection', () => {
      const pages: PageContent[] = [
        { url: 'https://example.com/en', language: 'en' },
        { url: 'https://example.com/unknown' },
        { url: 'https://example.com/fr', language: 'fr' },
      ];

      const filtered = filterPagesByLanguage(pages, 'en');

      expect(filtered).toHaveLength(2);
      expect(filtered.map(p => p.url)).toEqual([
        'https://example.com/en',
        'https://example.com/unknown',
      ]);
    });

    it('should match language prefix (en matches en-US)', () => {
      const pages: PageContent[] = [
        { url: 'https://example.com/en-us', language: 'en-US' },
        { url: 'https://example.com/en-gb', language: 'en-GB' },
        { url: 'https://example.com/fr', language: 'fr' },
      ];

      const filtered = filterPagesByLanguage(pages, 'en');

      expect(filtered).toHaveLength(2);
    });
  });

  describe('matchKeywordsWithRankedData', () => {
    it('should match keywords with fuzzy matching (score > 70)', async () => {
      const extractedKeywords = [
        { keyword: 'AI consulting', relevanceScore: 0.9 },
        { keyword: 'machine learning', relevanceScore: 0.8 },
      ];

      const rankedKeywords = [
        { keyword: 'ai consulting services', position: 5, searchVolume: 1200 },
        { keyword: 'deep learning', position: 10, searchVolume: 800 },
      ];

      const result = await matchKeywordsWithRankedData(extractedKeywords, rankedKeywords);

      expect(result.enrichedKeywords).toHaveLength(2);
      expect(result.enrichedKeywords[0].keyword).toBe('AI consulting');
      expect(result.enrichedKeywords[0].searchVolume).toBe(1200); // Matched with ranked
      expect(result.enrichedKeywords[0].position).toBe(5);
    });

    it('should use relevanceScore * 1000 as fallback volume for unmatched keywords', async () => {
      const extractedKeywords = [
        { keyword: 'unique keyword', relevanceScore: 0.75 },
      ];

      const rankedKeywords = [
        { keyword: 'completely different', position: 1, searchVolume: 1000 },
      ];

      const result = await matchKeywordsWithRankedData(extractedKeywords, rankedKeywords);

      expect(result.enrichedKeywords[0].searchVolume).toBe(750); // 0.75 * 1000
      expect(result.enrichedKeywords[0].position).toBe(1); // index + 1
    });

    it('should return unmatched ranked keywords separately', async () => {
      const extractedKeywords = [
        { keyword: 'AI consulting', relevanceScore: 0.9 },
      ];

      const rankedKeywords = [
        { keyword: 'ai consulting services', position: 5, searchVolume: 1200 },
        { keyword: 'unmatched keyword', position: 10, searchVolume: 800 },
      ];

      const result = await matchKeywordsWithRankedData(extractedKeywords, rankedKeywords);

      expect(result.unmatchedRankedKeywords).toHaveLength(1);
      expect(result.unmatchedRankedKeywords[0].keyword).toBe('unmatched keyword');
      expect(result.unmatchedRankedKeywords[0].searchVolume).toBe(800);
    });
  });

  describe('scrapeImportantPages', () => {
    it('should scrape only homepage and canonicalize URL', async () => {
      const mockPageScraper = {
        scrapePages: vi.fn().mockResolvedValue([
          { url: 'https://example.com/', content: 'Home', language: 'en' },
        ]),
      };

      const deps = {
        pageScraper: mockPageScraper,
        logger: { debug: vi.fn() },
      };

      const pages = await scrapeImportantPages('example.com', deps);

      const calledUrls = mockPageScraper.scrapePages.mock.calls[0][0] as string[];
      expect(calledUrls).toEqual(['https://example.com/']);
      expect(pages).toHaveLength(1);
    });

    it('should normalize www and protocol to https and root path', async () => {
      const mockPageScraper = {
        scrapePages: vi.fn().mockResolvedValue([
          { url: 'https://example.com/', content: 'Home', language: 'en' },
        ]),
      };

      const deps = {
        pageScraper: mockPageScraper,
        logger: { debug: vi.fn() },
      };

      await scrapeImportantPages('WWW.Example.COM', deps as any);

      const calledUrls = mockPageScraper.scrapePages.mock.calls[0][0] as string[];
      expect(calledUrls).toEqual(['https://example.com/']);
    });

    it('should cap results at MAX_PAGES = 1', async () => {
      const mockPageScraper = {
        scrapePages: vi.fn().mockResolvedValue([
          { url: 'https://example.com/', content: 'Home', language: 'en' },
          { url: 'https://example.com/2', content: '2', language: 'en' },
        ]),
      };

      const deps = {
        pageScraper: mockPageScraper,
        logger: { debug: vi.fn() },
      };

      const pages = await scrapeImportantPages('example.com', deps);

      expect(pages).toHaveLength(1);
      expect(pages[0].url).toBe('https://example.com/');
    });
  });
});
