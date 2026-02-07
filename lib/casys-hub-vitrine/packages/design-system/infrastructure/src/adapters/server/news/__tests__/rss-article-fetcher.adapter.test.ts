import type Parser from 'rss-parser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicSource } from '@casys/core';

import { RssArticleFetcherAdapter } from '../rss-article-fetcher.adapter';

function makeFeed(items: any[]): { items: any[] } {
  return { items };
}

describe('RssArticleFetcherAdapter', () => {
  let adapter: RssArticleFetcherAdapter;
  let source: TopicSource;

  beforeEach(() => {
    source = {
      id: 's1',
      type: 'rss',
      name: 'Feed',
      url: 'https://example.com/feed.xml',
      enabled: true,
    };
    adapter = new RssArticleFetcherAdapter([source]);
  });

  it('sources CRUD: add/list/get/update/remove', async () => {
    // list
    const list1 = adapter.listSources();
    expect(list1.length).toBe(1);
    expect(list1[0].id).toBe('s1');

    // get
    const got = adapter.getSource('s1');
    expect(got?.url).toBe('https://example.com/feed.xml');

    // update
    adapter.updateSource('s1', { name: 'NewName', enabled: false });
    const got2 = adapter.getSource('s1');
    expect(got2?.name).toBe('NewName');
    expect(got2?.enabled).toBe(false);

    // remove
    adapter.removeSource('s1');
    const list2 = adapter.listSources();
    expect(list2.length).toBe(0);
  });

  it('discoverCandidates: filtre date/langue/keywords, parse catégories/images et tri/limit', async () => {
    // réinitialiser avec source activée
    adapter = new RssArticleFetcherAdapter([
      { id: 's1', type: 'rss', name: 'Feed', url: 'https://feed', enabled: true },
    ]);

    // monkey-patch parser
    (adapter as any).parser = {
      parseURL: vi.fn(async (_url: string) =>
        makeFeed([
          // accepté: FR, mots-clés match, date récente, image, catégories diverses
          {
            title: 'TVA sur panneaux solaires: arrêté paru',
            link: 'https://site/a',
            pubDate: new Date().toISOString(),
            language: 'fr',
            categories: ['Energie', { _: 'Solaire ' }, 'Energie'],
            'content:encoded':
              '<p>Installations de panneaux solaires <img src="https://img/a.jpg"/></p>',
            'dc:creator': 'Auteur',
            guid: 'g1',
            contentSnippet: 'TVA 5,5% panneaux solaires',
            summary: 'Actu TVA',
          },
          // rejet: langue différente si item.language présent
          {
            title: 'Solar panels update',
            link: 'https://site/b',
            pubDate: new Date().toISOString(),
            language: 'en',
            categories: ['Energy'],
            contentSnippet: 'solar panels',
            guid: 'g2',
          },
          // rejet: ancien (before since)
          {
            title: 'Ancien article',
            link: 'https://site/c',
            pubDate: '2020-01-01T00:00:00.000Z',
            language: 'fr',
            categories: ['Divers'],
            guid: 'g3',
          },
          // rejet: manques obligatoires (link)
          {
            title: 'Sans lien',
            pubDate: new Date().toISOString(),
            language: 'fr',
            guid: 'g4',
          },
        ])
      ),
    } as unknown as Parser<any, any>;

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const out = await adapter.discoverCandidates({
      language: 'fr',
      seoKeywords: ['panneaux solaires'],
      since,
      limit: 10,
    } as any);

    expect(out.length).toBe(1);
    const c = out[0];
    expect(c.title).toMatch(/TVA/);
    expect(c.sourceUrl).toBe('https://site/a');
    expect(c.imageUrls?.[0]).toBe('https://img/a.jpg');
    expect(c.categories).toEqual(['Energie', 'Solaire']);
    expect(typeof c.publishedAt === 'string' || c.publishedAt instanceof Date).toBe(true);
  });

  it('discoverCandidates: résiste aux erreurs parseURL et continue', async () => {
    adapter = new RssArticleFetcherAdapter([
      { id: 's1', type: 'rss', name: 'Feed', url: 'https://ok', enabled: true },
      { id: 's2', type: 'rss', name: 'Feed2', url: 'https://ko', enabled: true },
    ]);
    const parseURL = vi
      .fn()
      .mockResolvedValueOnce(
        makeFeed([
          {
            title: 'A',
            link: 'https://a',
            pubDate: new Date().toISOString(),
            language: 'fr',
            guid: 'ga',
          },
        ])
      )
      .mockRejectedValueOnce(new Error('net'));
    (adapter as any).parser = { parseURL } as unknown as Parser<any, any>;

    const out = await adapter.discoverCandidates({
      language: 'fr',
      seoKeywords: [],
      limit: 5,
    } as any);
    // premier feed ok -> 1 élément, second en erreur -> ignoré
    expect(out.length).toBe(1);
    expect(out[0].sourceUrl).toBe('https://a');
  });
});
