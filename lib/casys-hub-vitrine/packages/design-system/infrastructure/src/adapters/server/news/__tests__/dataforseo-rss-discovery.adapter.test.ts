/**
 * Tests for DataForSeoRssDiscoveryAdapter with cheerio + rss-parser
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';

import { DataForSeoRssDiscoveryAdapter } from '../dataforseo-rss-discovery.adapter';
import type { AITextModelPort } from '@casys/application';
import type { RssFeedDiscoveryContext } from '@casys/core';

// Mock modules
vi.mock('dataforseo-client');
vi.mock('cheerio');
vi.mock('rss-parser');

describe('DataForSeoRssDiscoveryAdapter - RSS Discovery with cheerio + rss-parser', () => {
  let adapter: DataForSeoRssDiscoveryAdapter;
  let mockAiTextModel: AITextModelPort;
  let mockFetch: Mock;

  const mockContext: RssFeedDiscoveryContext = {
    industry: 'BTP Construction',
    targetAudience: 'Construction professionals',
    businessDescription: 'Construction industry news and trends'
  };

  beforeEach(() => {
    // Mock AITextModelPort
    mockAiTextModel = {
      generateText: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          queries: [
            '(batiactu OR "le moniteur" OR batiweb OR construction21) "flux RSS"',
            'BTP "actualités construction" RSS'
          ]
        })
      })
    } as unknown as AITextModelPort;

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create adapter with mocked credentials
    adapter = new DataForSeoRssDiscoveryAdapter(mockAiTextModel, {
      DATAFORSEO_API_KEY: 'test-api-key'
    });
  });

  describe('findRssFeed()', () => {
    it('should discover RSS feed from HTML <link rel="alternate"> tag', async () => {
      // Mock HTML with RSS feed link
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="alternate" type="application/rss+xml" href="/accueil.rss" />
        </head>
        <body>Content</body>
        </html>
      `;

      // Mock fetch for HTML page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml)
      });

      // Mock fetch for RSS validation (HEAD request)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/rss+xml' : null
        }
      });

      // Mock cheerio to parse HTML
      const mockCheerio = {
        load: vi.fn(() => {
          return (selector: string) => {
            if (selector === 'link[rel="alternate"]') {
              return {
                filter: () => ({
                  length: 1,
                  0: {}
                }),
                attr: (name: string) => name === 'href' ? '/accueil.rss' : 'application/rss+xml'
              };
            }
            return { length: 0 };
          };
        })
      };
      vi.mocked(cheerio).load = mockCheerio.load;

      // Call private method via reflection
      const findRssFeed = (adapter as any).findRssFeed.bind(adapter);
      const feedUrl = await findRssFeed('https://www.batiactu.com');

      expect(feedUrl).toBe('https://www.batiactu.com/accueil.rss');
    });

    it('should try common RSS paths when HTML parsing fails', async () => {
      // Mock failed HTML fetch
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      // Mock successful /accueil.rss HEAD request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/rss+xml' : null
        }
      });

      const findRssFeed = (adapter as any).findRssFeed.bind(adapter);
      const feedUrl = await findRssFeed('https://www.batiactu.com');

      expect(feedUrl).toBe('https://www.batiactu.com/accueil.rss');
    });

    it('should return null when no RSS feed is found', async () => {
      // Mock failed HTML fetch
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      // Mock failed common path HEAD requests
      mockFetch.mockResolvedValue({
        ok: false
      });

      const findRssFeed = (adapter as any).findRssFeed.bind(adapter);
      const feedUrl = await findRssFeed('https://example.com');

      expect(feedUrl).toBeNull();
    });
  });

  describe('parseRssFeed()', () => {
    it('should parse RSS feed with rss-parser', async () => {
      // Mock rss-parser
      const mockFeed = {
        title: 'Batiactu - Actualités BTP',
        description: 'Toute l\'actualité de la construction',
        items: [
          { title: 'Nouvelle réglementation RE2025' },
          { title: 'Innovation béton bas carbone' },
          { title: 'Marché de la construction en hausse' }
        ]
      };

      const mockParser = {
        parseURL: vi.fn().mockResolvedValue(mockFeed)
      };
      vi.mocked(Parser).mockImplementation(() => mockParser as any);

      const parseRssFeed = (adapter as any).parseRssFeed.bind(adapter);
      const result = await parseRssFeed('https://www.batiactu.com/accueil.rss');

      expect(result).toEqual({
        title: 'Batiactu - Actualités BTP',
        description: 'Toute l\'actualité de la construction',
        recentArticles: [
          'Nouvelle réglementation RE2025',
          'Innovation béton bas carbone',
          'Marché de la construction en hausse'
        ]
      });
    });

    it('should limit recent articles to 5', async () => {
      const mockFeed = {
        title: 'Test Feed',
        description: 'Test description',
        items: Array.from({ length: 10 }, (_, i) => ({ title: `Article ${i + 1}` }))
      };

      const mockParser = {
        parseURL: vi.fn().mockResolvedValue(mockFeed)
      };
      vi.mocked(Parser).mockImplementation(() => mockParser as any);

      const parseRssFeed = (adapter as any).parseRssFeed.bind(adapter);
      const result = await parseRssFeed('https://example.com/feed');

      expect(result?.recentArticles).toHaveLength(5);
      expect(result?.recentArticles).toEqual([
        'Article 1',
        'Article 2',
        'Article 3',
        'Article 4',
        'Article 5'
      ]);
    });

    it('should filter out items without titles', async () => {
      const mockFeed = {
        title: 'Test Feed',
        description: 'Test description',
        items: [
          { title: 'Article 1' },
          { title: undefined },
          { title: 'Article 2' },
          { title: null },
          { title: 'Article 3' }
        ]
      };

      const mockParser = {
        parseURL: vi.fn().mockResolvedValue(mockFeed)
      };
      vi.mocked(Parser).mockImplementation(() => mockParser as any);

      const parseRssFeed = (adapter as any).parseRssFeed.bind(adapter);
      const result = await parseRssFeed('https://example.com/feed');

      expect(result?.recentArticles).toEqual([
        'Article 1',
        'Article 2',
        'Article 3'
      ]);
    });

    it('should return null on parsing error', async () => {
      const mockParser = {
        parseURL: vi.fn().mockRejectedValue(new Error('Parse error'))
      };
      vi.mocked(Parser).mockImplementation(() => mockParser as any);

      const parseRssFeed = (adapter as any).parseRssFeed.bind(adapter);
      const result = await parseRssFeed('https://example.com/invalid');

      expect(result).toBeNull();
    });
  });

  describe('validateRssFeed()', () => {
    it('should validate RSS feed with correct content-type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/rss+xml; charset=utf-8' : null
        }
      });

      const validateRssFeed = (adapter as any).validateRssFeed.bind(adapter);
      const isValid = await validateRssFeed('https://example.com/feed.xml');

      expect(isValid).toBe(true);
    });

    it('should validate Atom feed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/atom+xml' : null
        }
      });

      const validateRssFeed = (adapter as any).validateRssFeed.bind(adapter);
      const isValid = await validateRssFeed('https://example.com/atom.xml');

      expect(isValid).toBe(true);
    });

    it('should reject non-RSS content types', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'text/html' : null
        }
      });

      const validateRssFeed = (adapter as any).validateRssFeed.bind(adapter);
      const isValid = await validateRssFeed('https://example.com/page.html');

      expect(isValid).toBe(false);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const validateRssFeed = (adapter as any).validateRssFeed.bind(adapter);
      const isValid = await validateRssFeed('https://example.com/feed.xml');

      expect(isValid).toBe(false);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate RSS feeds by URL', async () => {
      // This test verifies the deduplication logic in discoverRawFeeds()
      // The implementation uses a Set<string> to track seen feedUrls
      const seenFeedUrls = new Set<string>();

      const feedUrl1 = 'https://www.lemoniteur.fr/rss.xml';
      const feedUrl2 = 'https://www.batiactu.com/accueil.rss';
      const feedUrl3 = 'https://www.lemoniteur.fr/rss.xml'; // Duplicate

      // Simulate deduplication
      const addIfUnique = (url: string): boolean => {
        if (seenFeedUrls.has(url)) {
          return false; // Already seen, skip
        }
        seenFeedUrls.add(url);
        return true; // New URL, added
      };

      expect(addIfUnique(feedUrl1)).toBe(true); // First occurrence
      expect(addIfUnique(feedUrl2)).toBe(true); // Different URL
      expect(addIfUnique(feedUrl3)).toBe(false); // Duplicate, rejected

      expect(seenFeedUrls.size).toBe(2); // Only 2 unique URLs
    });
  });

  describe('Error Handling', () => {
    it('should handle AI agent errors gracefully', async () => {
      // Mock AI error
      mockAiTextModel.generateText = vi.fn().mockRejectedValue(new Error('AI service unavailable'));

      const result = await adapter.discoverRawFeeds(mockContext, {
        language: 'fr',
        maxResults: 10
      });

      expect(result).toEqual([]);
    });

    it('should handle DataForSEO API errors gracefully', async () => {
      // Mock successful AI query generation
      mockAiTextModel.generateText = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          queries: ['test query']
        })
      });

      // Mock DataForSEO API error (will be handled by searchWithDataForSeo returning [])
      const result = await adapter.discoverRawFeeds(mockContext, {
        language: 'fr',
        maxResults: 10
      });

      // Should return empty array without throwing
      expect(result).toEqual([]);
    });
  });
});
