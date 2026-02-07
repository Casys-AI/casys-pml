import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { NewsDataArticleFetcherAdapter } from '../../server/news/newsdata-article-fetcher.adapter';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, { deep: true });

const baseQuery = (): TopicFetchQuery => ({
  seoKeywords: ['marketing', 'digital'],
  limit: 10,
  language: 'fr',
});

describe('Contract: TopicDiscoveryPort - NewsData Adapter', () => {
  let adapter: NewsDataArticleFetcherAdapter;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NEWSDATA_API_KEY;
    process.env.NEWSDATA_API_KEY = 'test-newsdata-key';
    vi.clearAllMocks();
    adapter = new NewsDataArticleFetcherAdapter();
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.NEWSDATA_API_KEY = originalEnv;
    else delete process.env.NEWSDATA_API_KEY;
  });

  it('mappe et retourne des candidats (tri/limit gérés côté contrat en amont)', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 'success',
        results: [
          {
            article_id: 'nd2',
            title: 'SEO Best Practices',
            description: 'How to optimize for search engines',
            link: 'https://newsdata.example.com/article2',
            image_url: 'https://newsdata.example.com/img2.jpg',
            pubDate: '2024-01-02 15:30:00',
            source_id: 'SEO Weekly',
          },
          {
            article_id: 'nd1',
            title: 'Marketing Trends 2024',
            description: 'Latest trends in digital marketing',
            link: 'https://newsdata.example.com/article1',
            image_url: 'https://newsdata.example.com/img1.jpg',
            pubDate: '2024-01-01 10:00:00',
            source_id: 'Tech News',
          },
        ],
      },
    });

    const res = await adapter.discoverCandidates(baseQuery());

    expect(res.length).toBe(2);
    const first = res[0];
    expect(first.title).toBe('SEO Best Practices');
    expect(first.sourceUrl).toBe('https://newsdata.example.com/article2');
    expect(first.imageUrls?.[0]).toBe('https://newsdata.example.com/img2.jpg');
    expect(first.sourceTitle).toBe('SEO Weekly');
    expect(first.language).toBe('fr');
  });

  it('fail-fast sans NEWSDATA_API_KEY', () => {
    delete process.env.NEWSDATA_API_KEY;
    expect(() => new NewsDataArticleFetcherAdapter()).toThrow();
  });
});
