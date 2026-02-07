import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataForSeoSerpAdapter } from '../dataforseo-serp.adapter';

function makeResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  const jsonBody = JSON.stringify(body);
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => JSON.parse(jsonBody),
    text: async () => jsonBody,
  } as unknown as Response;
}

describe('DataForSeoSerpAdapter', () => {
  const VALID_ENV = {
    DATAFORSEO_API_KEY: 'test-key',
  } as unknown as NodeJS.ProcessEnv;

  const ERROR_TOP = {
    status_code: 10000,
    tasks_error: 0,
  };

  const ERROR_TASKS = {
    status_code: 20000,
    tasks_error: 1,
  };

  const SUCCESS_MINIMAL = {
    status_code: 20000,
    tasks_error: 0,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            items: [
              { url: 'https://example.com/a', title: 'A title', description: 'Snippet A' },
              { url: 'https://example.com/b', title: 'B title', description: 'Snippet B' },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fail-fast: credentials manquantes → constructor throw', () => {
    expect(() => new DataForSeoSerpAdapter({} as any)).toThrow(/DataForSEO credentials missing/i);
  });

  it('fail-fast: query vide → scrapeTopResults throw', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    await expect(adapter.scrapeTopResults('')).rejects.toThrow(/Search query cannot be empty/i);
  });

  it('fail-fast: limit <= 0 → throw', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    await expect(adapter.scrapeTopResults('kw', 0)).rejects.toThrow(
      /Limit must be greater than 0/i
    );
  });

  it('provider: HTTP non-ok → throw', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({}, { ok: false, status: 500 })));
    await expect(adapter.scrapeTopResults('kw')).rejects.toThrow(
      /DataForSEO SERP failed: HTTP 500/
    );
  });

  it('provider: status_code top != 20000 → throw', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(ERROR_TOP)));
    await expect(adapter.scrapeTopResults('kw')).rejects.toThrow(/status_code 10000/);
  });

  it('provider: tasks_error > 0 → throw', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(ERROR_TASKS)));
    await expect(adapter.scrapeTopResults('kw')).rejects.toThrow(/tasks_error 1/);
  });

  it('success: mappe items en CompetitorData et respecte limit', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(SUCCESS_MINIMAL)));
    const res = await adapter.scrapeTopResults('kw', 1);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      url: 'https://example.com/a',
      title: 'A title',
      description: 'Snippet A',
    });
    expect(Array.isArray(res[0].keywords)).toBe(true);
  });

  it('locale: utilise SEO_SERP_LANGUAGE/REGION par défaut si non fournis', async () => {
    const adapter = new DataForSeoSerpAdapter(VALID_ENV);
    const spy = vi
      .spyOn<any, any>(adapter as any, 'fetchWithTimeout')
      .mockResolvedValue(makeResponse(SUCCESS_MINIMAL));
    await adapter.scrapeTopResults('kw', 1);
    expect(spy).toHaveBeenCalledTimes(1);
    const reqInit1 = (spy as any).mock.calls[0][1] as any;
    const body = JSON.parse(reqInit1.body as string);
    expect(body[0].language_code).toBe('fr');
  });

  it('locale: prend SEO_SERP_LANGUAGE/REGION depuis env', async () => {
    const env = {
      DATAFORSEO_API_KEY: 'k',
      SEO_SERP_LANGUAGE: 'en',
      SEO_SERP_REGION: 'US',
    } as unknown as NodeJS.ProcessEnv;
    const adapter = new DataForSeoSerpAdapter(env);
    const spy = vi
      .spyOn<any, any>(adapter as any, 'fetchWithTimeout')
      .mockResolvedValue(makeResponse(SUCCESS_MINIMAL));
    await adapter.scrapeTopResults('iphone', 2);
    const reqInit2 = (spy as any).mock.calls[0][1] as any;
    const body = JSON.parse(reqInit2.body as string);
    expect(body[0].language_code).toBe('en');
  });
});
