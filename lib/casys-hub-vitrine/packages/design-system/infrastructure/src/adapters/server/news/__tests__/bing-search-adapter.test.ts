import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicSource } from '@casys/core';

import { BingSearchAdapter } from '../bing-search-adapter';

// Définir les mocks avec vi.hoisted pour éviter les erreurs de hoisting
const { getMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn();
  const createMock = vi.fn(() => ({ get: getMock }));
  return { getMock, createMock };
});

// Mock axios module pour intercepter create/get
vi.mock('axios', () => ({
  default: { create: createMock },
  create: createMock,
}));

function makeResult(name: string, url: string, extra: Partial<any> = {}) {
  return {
    name,
    url,
    snippet: `${name} snippet`,
    datePublished: new Date().toISOString(),
    provider: [{ name: 'Prov' }],
    image: { thumbnail: { contentUrl: 'https://img/x.jpg' } },
    ...extra,
  };
}

describe('BingSearchAdapter', () => {
  beforeEach(() => {
    getMock.mockReset();
    createMock.mockClear();
  });

  it('mappe web et news, construit les requêtes, tri/limit, et filtre sources', async () => {
    // Arrange axios mocks
    getMock.mockImplementation(async (path: string, { params }: any) => {
      if (path === '/search') {
        // vérifier mkt (market code) dérivé de query.language
        expect(params.mkt).toBe('fr-FR');
        return {
          data: {
            webPages: {
              value: [
                makeResult('Web A', 'https://w/a', { datePublished: '2025-01-05T00:00:00.000Z' }),
                makeResult('Web B', 'https://w/b', { datePublished: '2025-01-01T00:00:00.000Z' }),
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
                makeResult('News C', 'https://n/c', { datePublished: '2025-01-03T00:00:00.000Z' }),
              ],
            },
          },
        };
      }
      throw new Error('unexpected path');
    });

    const sourceA: TopicSource = {
      id: 's1',
      type: 'custom',
      name: 'S1',
      enabled: true,
      params: { language: 'fr', searchModifier: 'site:example.com' },
    };
    const sourceB: TopicSource = { id: 's2', type: 'custom', name: 'S2', enabled: false };
    const adapter = new BingSearchAdapter('key', [sourceA, sourceB]);

    const out = await adapter.discoverCandidates({
      language: 'fr',
      seoKeywords: ['energie', 'solaire'],
      limit: 2,
      sources: ['s1'],
    } as any);

    // Vérifie mapping et limit (2 éléments après tri par date desc)
    expect(out.length).toBe(2);
    // Ordre attendu: Web A (2025-01-05), News C (2025-01-03) -> limit 2
    expect(out[0].sourceUrl).toBe('https://w/a');
    expect(out[1].sourceUrl).toBe('https://n/c');

    // IDs préfixés
    expect(out.some(c => c.id.startsWith('bing-web-'))).toBe(true);
    expect(out.some(c => c.id.startsWith('bing-news-'))).toBe(true);

    // language des candidats issu de source.params.language ou défaut
    expect(out[0].language).toBe('fr');

    // Vérifie que seul s1 (enabled) a été utilisé
    expect(createMock).toHaveBeenCalledTimes(1);
    // Deux endpoints appelés
    expect(getMock).toHaveBeenCalledWith('/search', expect.anything());
    expect(getMock).toHaveBeenCalledWith('/news/search', expect.anything());
  });

  it('tolère des erreurs réseau sur un endpoint et continue avec l’autre', async () => {
    // /search ok, /news/search en erreur
    getMock
      .mockImplementationOnce(async () => ({
        data: { webPages: { value: [makeResult('Web A', 'https://w/a')] } },
      }))
      .mockRejectedValueOnce(new Error('network'));

    const source: TopicSource = { id: 's1', type: 'custom', name: 'S1', enabled: true };
    const adapter = new BingSearchAdapter('key', [source]);

    const out = await adapter.discoverCandidates({
      language: 'en',
      seoKeywords: ['ai'],
      limit: 5,
    } as any);
    expect(out.length).toBe(1);
    expect(out[0].sourceUrl).toBe('https://w/a');
  });

  it('getMarketCode couvre fr/en/es/de/default', async () => {
    getMock.mockResolvedValue({ data: {} });
    const adapter = new BingSearchAdapter('key', [
      { id: 's', type: 'custom', name: 'S', enabled: true },
    ]);

    await adapter.discoverCandidates({ language: 'fr', seoKeywords: ['x'] } as any);
    expect(getMock.mock.calls[0][1].params.mkt).toBe('fr-FR');

    getMock.mockClear();
    await adapter.discoverCandidates({ language: 'es', seoKeywords: ['x'] } as any);
    expect(getMock.mock.calls[0][1].params.mkt).toBe('es-ES');

    getMock.mockClear();
    await adapter.discoverCandidates({ language: 'de', seoKeywords: ['x'] } as any);
    expect(getMock.mock.calls[0][1].params.mkt).toBe('de-DE');

    getMock.mockClear();
    await adapter.discoverCandidates({ language: 'en', seoKeywords: ['x'] } as any);
    expect(getMock.mock.calls[0][1].params.mkt).toBe('en-US');

    getMock.mockClear();
    await adapter.discoverCandidates({ language: undefined as any, seoKeywords: ['x'] } as any);
    expect(getMock.mock.calls[0][1].params.mkt).toBe('en-US');
  });
});
