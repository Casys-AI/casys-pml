import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', async () => {
  const actual: any = await vi.importActual('axios');
  return {
    ...actual,
    default: {
      get: vi.fn(),
      isAxiosError: (e: any) => !!e && typeof e === 'object' && 'response' in e,
    },
    get: vi.fn(),
    AxiosError: actual.AxiosError,
  };
});

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import axios from 'axios';

import { NewsDataArticleFetcherAdapter } from '../newsdata-article-fetcher.adapter';

describe('NewsDataArticleFetcherAdapter', () => {
  const axiosGet = axios.get as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEWSDATA_API_KEY = 'dummy';
  });

  it('utilise le paramètre q et rejette avec 422', async () => {
    const searchParams = new URLSearchParams([
      ['apikey', 'dummy'],
      ['q', 'foo OR bar'],
    ]);

    axiosGet.mockRejectedValueOnce({
      message: 'Request failed with status code 422',
      response: { status: 422, data: { status: 'error' } },
      config: { params: searchParams },
    });

    const adapter = new NewsDataArticleFetcherAdapter();

    await expect(adapter.discoverCandidates({ seoKeywords: ['foo', 'bar'] })).rejects.toThrow(
      /NewsData fetch failed: 422/
    );

    // Vérifie que axios a été appelé sur /news et que q est présent (pas qInTitle)
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, config] = axiosGet.mock.calls[0];
    expect(String(url)).toContain('/news');
    const params = config.params as URLSearchParams;
    const paramsStr = params.toString();
    expect(paramsStr).toContain('q=');
    expect(paramsStr).not.toContain('qInTitle=');

    // On ne vérifie pas le logger ici pour éviter un couplage fragile
  });
});
