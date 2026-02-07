import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicFetchQuery, TopicSource } from '@casys/core';

import { BingSearchAdapter } from '../../server/news/bing-search-adapter';

// Mock axios et axios.create
vi.mock('axios');
const mockedAxios = vi.mocked(axios, { deep: true });
const mockAxiosInstance = {
  get: vi.fn(),
};

const makeSources = (): TopicSource[] => [
  {
    id: 'bing-src',
    type: 'custom',
    name: 'Bing',
    url: 'https://api.bing.microsoft.com',
    enabled: true,
    params: { searchModifier: 'site:example.com' },
  },
];

const baseQuery = (): TopicFetchQuery => ({
  seoKeywords: ['marketing', 'seo'],
  limit: 5,
  language: 'en',
  sources: ['bing-src'],
});

describe('Contract: TopicDiscoveryPort - Bing Adapter', () => {
  let adapter: BingSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    adapter = new BingSearchAdapter('test-bing-key', makeSources());
  });

  it('mappe et retourne des candidats depuis web et news, triés et limités', async () => {
    // Mock /search (web)
    mockAxiosInstance.get.mockImplementation(async (path: string) => {
      if (path === '/search') {
        return {
          data: {
            webPages: {
              value: [
                {
                  name: 'Marketing Trends 2024',
                  url: 'https://example.com/marketing',
                  snippet: 'Latest trends in digital marketing',
                  datePublished: '2024-01-01T10:00:00Z',
                  provider: [{ name: 'Example Provider' }],
                  image: { thumbnail: { contentUrl: 'https://example.com/img1.jpg' } },
                },
              ],
            },
          },
        };
      }
      if (path === '/news/search') {
        return {
          data: {
            news: {
              value: [
                {
                  name: 'SEO Best Practices',
                  url: 'https://example.com/seo',
                  snippet: 'How to optimize for search engines',
                  datePublished: '2024-01-02T15:30:00Z',
                  provider: [{ name: 'News Provider' }],
                  image: { thumbnail: { contentUrl: 'https://example.com/img2.jpg' } },
                },
              ],
            },
          },
        };
      }
      throw new Error('Unexpected path');
    });

    const res = await adapter.discoverCandidates(baseQuery());

    expect(res.length).toBe(2);
    // Tri desc => news (2024-01-02) avant web (2024-01-01)
    expect(res[0].sourceUrl).toBe('https://example.com/seo');
    expect(res[1].sourceUrl).toBe('https://example.com/marketing');

    // Mapping
    expect(res[0].title).toBe('SEO Best Practices');
    expect(res[0].imageUrls?.[0]).toBe('https://example.com/img2.jpg');
    expect(res[0].sourceTitle).toBe('News Provider');
  });

  it('retourne [] si aucune source filtrée', async () => {
    const a = new BingSearchAdapter('test-bing-key');
    const res = await a.discoverCandidates({ ...baseQuery(), sources: ['unknown'] });
    expect(res).toEqual([]);
  });

  it('fail-fast sans API key', () => {
    expect(() => new BingSearchAdapter('')).toThrow();
  });
});
