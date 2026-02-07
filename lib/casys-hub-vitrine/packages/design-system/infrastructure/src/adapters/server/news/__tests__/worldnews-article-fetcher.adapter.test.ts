import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', async () => {
  const actual: any = await vi.importActual('axios');
  const get = vi.fn().mockResolvedValue({ status: 200, data: { news: [] } });
  const def = { get };
  return {
    ...actual,
    default: def,
    get,
  };
});

// logger mock minimal pour silence
vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import axios from 'axios';

import { WorldNewsArticleFetcherAdapter } from '../worldnews-article-fetcher.adapter';

describe('WorldNewsArticleFetcherAdapter', () => {
  const axiosGet = axios.get as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORLD_NEWS_API_KEY = 'dummy';
  });

  it("contraint text <= 100 chars et séparateur ' '", async () => {
    const adapter = new WorldNewsArticleFetcherAdapter();

    const longKw = 'x'.repeat(150);
    const kw = [longKw, 'btp', 'reglementation', 'chantier'];
    (axios.get as any).mockResolvedValueOnce({ status: 200, data: { news: [] } });
    await adapter.discoverCandidates({ seoKeywords: kw } as any);

    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, config] = axiosGet.mock.calls[0];
    expect(String(url)).toContain('/search-news');

    const params: URLSearchParams = config.params;
    const text = params.get('text') ?? '';
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.includes(' OR ')).toBe(false);
  });
});
