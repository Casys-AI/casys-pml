import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicCandidate, TopicFetchQuery, TopicSource } from '@casys/core';

import { RssArticleFetcherAdapter } from '../../server/news/rss-article-fetcher.adapter';
import feedA from '../fixtures/news/rss/feed-a.sample';
import feedB from '../fixtures/news/rss/feed-b.sample';

// Mock rss-parser to return deterministic fixtures
vi.mock('rss-parser', () => {
  class ParserMock<TFeed = Record<string, unknown>, TItem = Record<string, unknown>> {
    async parseURL(url: string): Promise<{ items: TItem[] } & TFeed> {
      const db: Record<string, any> = {
        'https://example.com/feed-a.xml': feedA,
        'https://example.com/feed-b.xml': feedB,
        'https://example.com/feed-empty.xml': { items: [] },
      };
      return db[url] ?? { items: [] };
    }
  }
  return { default: ParserMock };
});

const makeSources = (): TopicSource[] => [
  {
    id: 'Feed A',
    type: 'rss',
    name: 'Feed A',
    url: 'https://example.com/feed-a.xml',
    enabled: true,
  },
  {
    id: 'Feed B',
    type: 'rss',
    name: 'Feed B',
    url: 'https://example.com/feed-b.xml',
    enabled: true,
  },
];

const baseQuery = (): TopicFetchQuery => ({
  seoKeywords: [],
  limit: 50,
  language: 'fr',
});

describe('Contract: TopicDiscoveryPort - RSS Adapter', () => {
  let adapter: RssArticleFetcherAdapter;

  beforeEach(async () => {
    adapter = new RssArticleFetcherAdapter(makeSources());
  });

  it('mappe correctement un item RSS en TopicCandidate (titres, dates, liens, images, catégories)', async () => {
    const query: TopicFetchQuery = { ...baseQuery(), sources: ['Feed A'] };

    const res = await adapter.discoverCandidates(query);

    expect(res.length).toBeGreaterThan(0);
    const first = res.find(a => a.id === 'a-1');
    expect(first).toBeDefined();
    expect(first!.title).toBe('Article A1');
    expect(first!.sourceUrl).toBe('https://news.example.com/a1');
    expect(new Date(first!.publishedAt).toISOString()).toBe('2024-02-03T10:00:00.000Z');
    expect(first!.imageUrls?.[0]).toBe('https://img.example.com/a1.jpg');
    expect((first as TopicCandidate)!.categories).toEqual(['Tech', 'AI']);
    expect(first!.language).toBe('fr');
  });

  it('filtre by since/until et seoKeywords et applique tri DESC + limit', async () => {
    const query: TopicFetchQuery = {
      ...baseQuery(),
      sources: ['Feed A'],
      since: new Date('2024-02-01T00:00:00Z'),
      until: new Date('2024-02-05T00:00:00Z'),
      seoKeywords: ['ai'],
      limit: 1,
    };

    const res = await adapter.discoverCandidates(query);

    // limit = 1 et tri par date desc => le plus récent qui match
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('a-1');
  });

  it('ignore les items invalides (sans title, link ou date)', async () => {
    const query: TopicFetchQuery = { ...baseQuery(), sources: ['Feed B'] };
    const res = await adapter.discoverCandidates(query);

    // feed-b contient des items invalides qui doivent être drop
    const ids = res.map(r => r.id);
    expect(ids).toContain('b-1'); // valide
    expect(ids).not.toContain('b-no-title');
    expect(ids).not.toContain('b-no-link');
    expect(ids).not.toContain('b-no-date');
  });

  it('filtre les sources via query.sources', async () => {
    const resA = await adapter.discoverCandidates({ ...baseQuery(), sources: ['Feed A'] });
    const resB = await adapter.discoverCandidates({ ...baseQuery(), sources: ['Feed B'] });
    const resBoth = await adapter.discoverCandidates({
      ...baseQuery(),
      sources: ['Feed A', 'Feed B'],
    });

    expect(resBoth.length).toBe(resA.length + resB.length);
  });
});
