import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicFetchQuery, TopicSource } from '@casys/core';

import { NewsApiArticleFetcherAdapter } from '../../server/news/newsapi-article-fetcher.adapter';

// Mock axios et axios.create
vi.mock('axios');
const mockedAxios = vi.mocked(axios, { deep: true });
const mockAxiosInstance = {
  get: vi.fn(),
};

const makeSources = (): TopicSource[] => [
  {
    id: 'newsapi-src',
    type: 'newsapi',
    name: 'Tech News',
    url: 'https://example.com/na',
    enabled: true,
  },
];

const baseQuery = (): TopicFetchQuery => ({
  seoKeywords: ['marketing', 'seo'],
  limit: 10,
  language: 'en',
  sources: ['newsapi-src'],
});

describe('Contract: TopicDiscoveryPort - NewsAPI Adapter', () => {
  let adapter: NewsApiArticleFetcherAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    adapter = new NewsApiArticleFetcherAdapter('test-key', makeSources());
  });

  it('mappe et retourne des candidats triés/limités', async () => {
    const mockResponse = {
      data: {
        status: 'ok',
        articles: [
          {
            title: 'SEO Best Practices',
            description: 'How to optimize for search engines',
            url: 'https://newsapi.com/article2',
            urlToImage: 'https://newsapi.com/image2.jpg',
            publishedAt: '2024-01-02T15:30:00Z',
            source: { name: 'SEO Weekly' },
          },
          {
            title: 'Marketing Trends 2024',
            description: 'Latest trends in digital marketing',
            url: 'https://newsapi.com/article1',
            urlToImage: 'https://newsapi.com/image1.jpg',
            publishedAt: '2024-01-01T10:00:00Z',
            source: { name: 'Tech News' },
          },
        ],
      },
    };

    mockAxiosInstance.get.mockResolvedValue(mockResponse);

    const res = await adapter.discoverCandidates(baseQuery());

    expect(res.length).toBe(2);
    // tri desc par date: article2 d'abord
    expect(res[0].sourceUrl).toBe('https://newsapi.com/article2');
    expect(res[1].sourceUrl).toBe('https://newsapi.com/article1');

    // mapping minimal
    expect(res[0].title).toBe('SEO Best Practices');
    expect(res[0].imageUrls?.[0]).toBe('https://newsapi.com/image2.jpg');
    expect(res[0].sourceTitle).toBe('SEO Weekly');
  });

  it('retourne [] si aucune source filtrée', async () => {
    const a = new NewsApiArticleFetcherAdapter('test-key');
    const res = await a.discoverCandidates({ ...baseQuery(), sources: ['unknown'] });
    expect(res).toEqual([]);
  });

  it('fail-fast sans API key', () => {
    expect(() => new NewsApiArticleFetcherAdapter('')).toThrow();
  });
});
