import type * as axiosModule from 'axios';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof axiosModule>('axios');
  const get = vi.fn().mockResolvedValue({ data: { status: 'ok', articles: [] } });
  const create = vi.fn(() => ({ get }));
  return {
    ...actual,
    default: Object.assign(create, { create, get }),
    create,
    get,
  };
});

// logger mock minimal pour silence
vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { NewsApiArticleFetcherAdapter } from '../newsapi-article-fetcher.adapter';

describe('NewsApiArticleFetcherAdapter', () => {
  const axiosMock = axios as unknown as {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  const axiosCreate = axiosMock.create as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("défaut language = 'fr' quand non fourni", async () => {
    const client = axiosCreate.mock.results[0]?.value ?? axiosCreate();

    const adapter = new NewsApiArticleFetcherAdapter('apikey', [
      { id: 'NewsAPI', type: 'newsapi', name: 'NewsAPI', enabled: true, params: {} },
    ] as any);

    await adapter.discoverCandidates({ seoKeywords: ['btp', 'réglementation'] } as any);

    // Vérifie que l'appel axios GET a été fait avec language=fr
    const calls = client.get.mock.calls;
    expect(calls.length).toBe(1);
    const [_url, config] = calls[0];
    expect(config.params.language).toBe('fr');
  });
});
