// tests/integration/worldnews.integration.spec.ts
import { config } from 'dotenv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { WorldNewsArticleFetcherAdapter } from '../../server/news/worldnews-article-fetcher.adapter';

// Charge le .env à la racine (ajuste le path si besoin)
config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === '1';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, n = 2, delayMs = 600): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= n; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < n) await sleep(delayMs * (i + 1));
    }
  }
  throw lastErr;
}

function skipIfQuotaOrRateLimit(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e?.toString?.() ?? e);
  if (
    /402|payment required/i.test(msg) ||
    /daily points limit/i.test(msg) ||
    /quota|rate limit/i.test(msg)
  ) {
    // On marque le test comme "passé" conditionnellement (pas de throw)
    // et on log l’info pour visibilité.
    // Vitest n'a pas de "pending" explicite → soft pass.
    console.warn('⚠️ WorldNews quota/limit atteint → test ignoré (soft pass)');
    expect(true).toBe(true);
    return true;
  }
  return false;
}

(INTEGRATION_ENABLED ? describe : describe.skip)('WorldNews - Intégration (smoke)', () => {
  let adapter: WorldNewsArticleFetcherAdapter;

  beforeAll(() => {
    if (!process.env.WORLD_NEWS_API_KEY) {
      throw new Error('WORLD_NEWS_API_KEY requis pour test intégration réel');
    }
    adapter = new WorldNewsArticleFetcherAdapter();
  });

  // Petit spacing entre tests pour éviter les bursts (free tier)
  beforeEach(async () => {
    await sleep(400);
  });

  it('renvoie une liste (smoke) sur une requête robuste FR', async () => {
    // 2 seaux : thème + qualificatif (évite les phrases exactes rares)
    const themes = ['BTP', 'chantier', 'construction'];
    const quals = ['administratif', 'conformité', 'réglementaire'];
    const q = `(${themes.join(' OR ')}) AND (${quals.join(' OR ')})`;

    const query: TopicFetchQuery = {
      // On passe la requête “construite” comme unique mot-clé
      seoKeywords: [q],
      language: 'fr',
      limit: 8,
    } as any;

    try {
      const results = await withRetry(() => adapter.discoverCandidates(query), 2, 700);

      // Toujours vérifier la forme sans exiger >0 (news volatiles)
      expect(Array.isArray(results)).toBe(true);

      // Si on a des résultats, on contrôle la structure minimale
      if (results.length > 0) {
        const item = results[0] as any;
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('sourceUrl');
        expect(String(item.title ?? '').length).toBeGreaterThan(0);
        expect(String(item.sourceUrl ?? '')).toContain('http');
      }

      console.log(`✅ WorldNews (smoke): ${results.length} résultat(s)`);
    } catch (e) {
      if (!skipIfQuotaOrRateLimit(e)) throw e;
    }
  }, 30_000);

  it('accepte aussi un mot-clé simple (fallback "construction")', async () => {
    const query: TopicFetchQuery = {
      seoKeywords: ['construction'],
      language: 'fr',
      limit: 5,
    } as any;

    try {
      const results = await withRetry(() => adapter.discoverCandidates(query), 2, 700);
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('title');
        expect(results[0]).toHaveProperty('sourceUrl');
      }
      console.log(`✅ WorldNews (construction): ${results.length} résultat(s)`);
    } catch (e) {
      if (!skipIfQuotaOrRateLimit(e)) throw e;
    }
  }, 30_000);
});
