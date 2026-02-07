import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { NewsDataArticleFetcherAdapter } from '../../server/news/newsdata-article-fetcher.adapter';

vi.mock('axios');

describe('NewsDataArticleFetcherAdapter - intégration minimale (sans réseau)', () => {
  const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...OLD_ENV, NEWSDATA_API_KEY: 'test_key' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('construit une requête protégée (parenthèses + guillemets) et <=100 chars, puis appelle axios avec ces params', async () => {
    // Arrange: capturer les params passés à axios
    let capturedUrl = '';
    let capturedParams: any;

    mockedAxios.get = vi.fn().mockImplementation((url: string, opts: any) => {
      capturedUrl = url;
      capturedParams = opts?.params; // URLSearchParams attendu
      return Promise.resolve({
        data: {
          status: 'success',
          results: [
            {
              article_id: 'a1',
              title: 'Test article',
              description: 'desc',
              link: 'https://example.com/a1',
              source_id: 'ex',
              pubDate: new Date().toISOString(),
              creator: ['john'],
            },
          ],
          totalResults: 1,
        },
      });
    });

    const adapter = new NewsDataArticleFetcherAdapter();

    const query: TopicFetchQuery = {
      seoKeywords: [
        'gestion administrative BTP',
        'conformité réglementaire chantier',
        'suivi administratif chantier',
      ],
      language: 'fr',
    } as any;

    // Act
    const res = await adapter.discoverCandidates(query);

    // Assert: axios a été appelé
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(capturedUrl.endsWith('/news')).toBe(true);

    // Params sont un URLSearchParams
    const params = capturedParams as URLSearchParams;
    expect(params).toBeInstanceOf(URLSearchParams);

    const q = params.get('q') ?? '';
    const language = params.get('language');

    // La requête construite doit être protégée et courte
    expect(q.length).toBeLessThanOrEqual(100);
    // Doit contenir des parenthèses, potentiellement des guillemets si multi-mots
    expect(q.startsWith('(')).toBe(true);
    expect(q.includes(' OR ') || q.endsWith(')')).toBe(true);

    // La langue est passée en paramètre (`language=fr`)
    expect(language).toBe('fr');

    // Résultats attendus non vides (fail fast si 0)
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
  });
});
