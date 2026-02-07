// tests/integration/newsapi.integration.spec.ts
import { config } from 'dotenv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { NewsApiArticleFetcherAdapter } from '../../server/news/newsapi-article-fetcher.adapter';

config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === '1';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, n = 2, delayMs = 600): Promise<T> {
  let err: unknown;
  for (let i = 0; i <= n; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      if (i < n) await sleep(delayMs * (i + 1));
    }
  }
  throw err;
}

function softPassIfRateOrQuota(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e?.toString?.() ?? e);
  if (
    /429|Too Many Requests/i.test(msg) || // rate limit
    /maximum allowed|exceeded|quota/i.test(msg) || // quota
    /developer plan/i.test(msg) // plan gratuit restrictions
  ) {
    // Soft pass: on logge et on n'échoue pas le test d'intégration
    console.warn('⚠️ NewsAPI quota/rate limit → test ignoré (soft pass)');
    expect(true).toBe(true);
    return true;
  }
  return false;
}

(INTEGRATION_ENABLED ? describe : describe.skip)('NewsAPI - Intégration (smoke)', () => {
  let adapter: NewsApiArticleFetcherAdapter;

  beforeAll(() => {
    const key = process.env.NEWS_API_KEY;
    if (!key) throw new Error('NEWS_API_KEY requis pour test intégration réel');
    // Ton adapter prend déjà la clé en param
    adapter = new NewsApiArticleFetcherAdapter(key);
  });

  // Espace légèrement les appels pour éviter burst (free tier)
  beforeEach(async () => {
    await sleep(300);
  });

  it('renvoie une liste (smoke) FR avec query robuste', async () => {
    // 2 seaux : thème + qualificatif (évite les phrases exactes rares)
    const themes = ['BTP', 'chantier', 'construction'];
    const quals = ['administratif', 'conformité', 'réglementaire'];
    const q = `(${themes.join(' OR ')}) AND (${quals.join(' OR ')})`;

    const query: TopicFetchQuery = {
      seoKeywords: [q],
      language: 'fr', // assure le param language=fr côté adapter
      limit: 10,
      // Optionnel: cibler des domaines FR BTP (décommente si besoin)
      // domains: ['batiactu.com','lemoniteur.fr','batiweb.com','preventionbtp.fr','travail-emploi.gouv.fr'],
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
      console.log(`✅ NewsAPI (smoke): ${results.length} résultat(s)`);
    } catch (e) {
      if (!softPassIfRateOrQuota(e)) throw e;
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
      console.log(`✅ NewsAPI (construction): ${results.length} résultat(s)`);
    } catch (e) {
      if (!softPassIfRateOrQuota(e)) throw e;
    }
  }, 30_000);
});
