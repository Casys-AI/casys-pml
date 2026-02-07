import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { WorldNewsArticleFetcherAdapter } from '../../server/news/worldnews-article-fetcher.adapter';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, { deep: true });

const baseQuery = (): TopicFetchQuery => ({
  seoKeywords: ['marketing', 'seo'],
  limit: 10,
  language: 'fr',
});

describe('Contract: TopicDiscoveryPort - WorldNews Adapter', () => {
  let adapter: WorldNewsArticleFetcherAdapter;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WORLD_NEWS_API_KEY;
    process.env.WORLD_NEWS_API_KEY = 'test-worldnews-key';
    vi.clearAllMocks();
    adapter = new WorldNewsArticleFetcherAdapter();
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.WORLD_NEWS_API_KEY = originalEnv;
    else delete process.env.WORLD_NEWS_API_KEY;
  });

  it('mappe et retourne des candidats', async () => {
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: {
        news: [
          {
            id: 'w2',
            title: 'SEO Strategies 2024',
            text: 'New SEO techniques for better rankings...',
            url: 'https://worldnews.example.com/article2',
            source: 'TechNews',
            publish_time: '2024-01-02T15:30:00Z',
          },
          {
            id: 'w1',
            title: 'Digital Marketing Evolution',
            text: 'The landscape of digital marketing is changing rapidly...',
            url: 'https://worldnews.example.com/article1',
            source: 'WorldNews',
            publish_time: '2024-01-01T10:00:00Z',
          },
        ],
      },
    });

    const res = await adapter.discoverCandidates(baseQuery());

    expect(res.length).toBe(2);
    const first = res[0];
    expect(first.title).toBe('SEO Strategies 2024');
    expect(first.sourceUrl).toBe('https://worldnews.example.com/article2');
    expect(first.sourceTitle).toBe('TechNews');
    expect(first.language).toBe('fr');
  });

  it('fail-fast sans WORLD_NEWS_API_KEY', () => {
    delete process.env.WORLD_NEWS_API_KEY;
    expect(() => new WorldNewsArticleFetcherAdapter()).toThrow();
  });
});
