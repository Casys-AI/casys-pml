import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDataForSEOLocationCode } from '@casys/core';

import { DataForSeoTrendsAdapter } from '../../server/seo/dataforseo-trends.adapter';

const ORIGINAL_ENV = { ...process.env } as NodeJS.ProcessEnv;
const originalFetch = globalThis.fetch;

// Utilitaires
function setEnv(vars: Partial<NodeJS.ProcessEnv>) {
  Object.assign(process.env, vars);
}
function resetEnv() {
  process.env = { ...ORIGINAL_ENV } as NodeJS.ProcessEnv;
}

// Fixture de réponse DataForSEO (simplifiée)
function makeSuccessPayload() {
  return {
    status_code: 20000,
    tasks_error: 0,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            keyword: 'vitest',
            location_name: 'France',
            timeline: [10, 20, 30],
            related_queries: [{ query: 'vitest tutorial' }, { query: 'vitest vs jest' }],
            rising_queries: [{ query: 'vitest config' }],
          },
        ],
      },
    ],
  };
}

describe('DataForSeoTrendsAdapter (contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnv({
      DATAFORSEO_API_KEY: 'api-key-123',
      DATAFORSEO_BASE_URL: 'https://api.dataforseo.com',
      DATAFORSEO_TIMEOUT_MS: '20000',
    });
    // Mock global fetch
    (globalThis as any).fetch = vi.fn();
  });

  afterEach(() => {
    // Restore fetch et env
    (globalThis as any).fetch = originalFetch as any;
    resetEnv();
  });

  it('fail-fast si credentials manquants (ni API key ni login/password)', () => {
    delete process.env.DATAFORSEO_API_KEY;
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;

    expect(() => new DataForSeoTrendsAdapter()).toThrow(
      'DataForSEO credentials missing: set DATAFORSEO_API_KEY or DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD'
    );
  });

  it('envoie Authorization Bearer quand API key présente et mappe la réponse en TrendData[]', async () => {
    const adapter = new DataForSeoTrendsAdapter();

    const json = makeSuccessPayload();
    vi.mocked(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => JSON.stringify(json),
    } as any);

    const res = await adapter.getTrends(['vitest'], 'FR');

    // Assertions fetch
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(globalThis.fetch as any).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live');
    expect(init?.method).toBe('POST');
    expect((init?.headers as any)?.Authorization).toBe('Bearer api-key-123');
    expect((init?.headers as any)?.['Content-Type']).toBe('application/json');

    // Payload
    const rawBody = typeof init?.body === 'string' ? init.body : 'null';
    const body = JSON.parse(rawBody);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      keywords: ['vitest'],
      location_code: getDataForSEOLocationCode('FR'),
    });

    // Mapping TrendData
    expect(res).toHaveLength(1);
    const t = res[0];
    expect(t.keyword).toBe('vitest');
    expect(t.trend).toBe('declining'); // 20 is < 30, so 'declining'
    expect(typeof t.searchVolume).toBe('number');
    expect(t.searchVolume).toBe(20); // moyenne de [10,20,30]
    expect(t.relatedQueries).toEqual(['vitest tutorial', 'vitest vs jest']);
  });

  it('supporte le Basic Auth quand login/password fournis', async () => {
    setEnv({ DATAFORSEO_API_KEY: '', DATAFORSEO_LOGIN: 'user', DATAFORSEO_PASSWORD: 'pass' });
    const adapter = new DataForSeoTrendsAdapter();

    const json = makeSuccessPayload();
    vi.mocked(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => JSON.stringify(json),
    } as any);

    await adapter.getTrends(['vitest'], 'FR');

    const [, init] = vi.mocked(globalThis.fetch as any).mock.calls[0] as [string, RequestInit];
    expect(String((init?.headers as any)?.Authorization)).toMatch(/^Basic\s.+/);
  });

  it('échoue avec HTTP non-ok en exposant le code', async () => {
    const adapter = new DataForSeoTrendsAdapter();

    vi.mocked(globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as any);

    await expect(adapter.getTrends(['vitest'], 'FR')).rejects.toThrow(
      'DataForSEO trends failed: HTTP 401'
    );
  });

  it('fail-fast si keywords vide', async () => {
    const adapter = new DataForSeoTrendsAdapter();
    await expect(adapter.getTrends([], 'FR')).rejects.toThrow('Keywords array cannot be empty');
  });

  it('propage une erreur AbortError (timeout)', async () => {
    setEnv({ DATAFORSEO_TIMEOUT_MS: '5' });
    const adapter = new DataForSeoTrendsAdapter();

    // Simule un abort immédiat du fetch
    const abortErr = new DOMException('Aborted', 'AbortError');
    vi.mocked(globalThis.fetch as any).mockRejectedValue(abortErr);

    await expect(adapter.getTrends(['vitest'], 'FR')).rejects.toThrow(/AbortError|Aborted/);
  });
});
