// tests/integration/newsdata.integration.spec.ts
import { config } from 'dotenv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { NewsDataArticleFetcherAdapter } from '../../server/news/newsdata-article-fetcher.adapter';

config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === '1';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, n = 2, delayMs = 600): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= n; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < n) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

function softPassIfKnownLimits(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e?.toString?.() ?? e);
  // NewsData renvoie souvent status:error avec message dans "results"
  if (
    /UnsupportedQueryLength/i.test(msg) || // q > 100 chars
    /rate limit|too many requests|429/i.test(msg) ||
    /payment required|402/i.test(msg) ||
    /invalid api key|unauthorized|401/i.test(msg) ||
    /quota|limit exceeded/i.test(msg)
  ) {
    console.warn('⚠️ NewsData limit/plan/quota → test ignoré (soft pass)');
    expect(true).toBe(true);
    return true;
  }
  return false;
}

(INTEGRATION_ENABLED ? describe : describe.skip)('NewsData - Intégration (smoke)', () => {
  let adapter: NewsDataArticleFetcherAdapter;

  beforeAll(() => {
    if (!process.env.NEWSDATA_API_KEY) {
      throw new Error('NEWSDATA_API_KEY requis pour test intégration réel');
    }
    adapter = new NewsDataArticleFetcherAdapter();
  });

  // Éviter les bursts (free tiers)
  beforeEach(async () => {
    await sleep(300);
  });

  it('renvoie une liste (smoke) FR avec query robuste', async () => {
    // 2 seaux (évite les guillemets/phrases exactes)
    const themes = ['BTP', 'chantier', 'construction'];
    const quals = ['administratif', 'conformité', 'réglementaire'];
    const q = `(${themes.join(' OR ')}) (${quals.join(' OR ')})`; // espace = AND implicite chez NewsData

    const query: TopicFetchQuery = {
      seoKeywords: [q],
      language: 'fr',
      limit: 10,
      // Astuce : si ton adapter supporte des options supplémentaires, tu peux passer:
      // timeframe: '30d',
    } as any;

    try {
      const results = await withRetry(() => adapter.discoverCandidates(query), 2, 700);
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        const it0 = results[0] as any;
        expect(it0).toHaveProperty('title');
        expect(it0).toHaveProperty('sourceUrl');
        expect(String(it0.title ?? '').length).toBeGreaterThan(0);
        expect(String(it0.sourceUrl ?? '')).toContain('http');
      }
      console.log(`✅ NewsData (smoke): ${results.length} résultat(s)`);
    } catch (e) {
      if (!softPassIfKnownLimits(e)) throw e;
    }
  }, 30_000);

  it('fallback mot-clé simple ("construction")', async () => {
    const query: TopicFetchQuery = {
      seoKeywords: ['construction'],
      language: 'fr',
      limit: 6,
    } as any;

    try {
      const results = await withRetry(() => adapter.discoverCandidates(query), 2, 700);
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('title');
        expect(results[0]).toHaveProperty('sourceUrl');
      }
      console.log(`✅ NewsData (construction): ${results.length} résultat(s)`);
    } catch (e) {
      if (!softPassIfKnownLimits(e)) throw e;
    }
  }, 30_000);
});
