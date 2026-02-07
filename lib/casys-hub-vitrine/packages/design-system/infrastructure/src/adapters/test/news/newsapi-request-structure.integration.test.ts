import type { AxiosInstance } from 'axios';
import { config } from 'dotenv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { NewsApiArticleFetcherAdapter } from '../../server/news/newsapi-article-fetcher.adapter';

config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === '1';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

(INTEGRATION_ENABLED ? describe : describe.skip)(
  'NewsAPI - structure requête (live, guardée)',
  () => {
    let adapter: NewsApiArticleFetcherAdapter;
    let captured: any;

    beforeAll(() => {
      const key = process.env.NEWS_API_KEY;
      if (!key) throw new Error('NEWS_API_KEY requis pour test intégration réel (structure)');
      adapter = new NewsApiArticleFetcherAdapter(key, [
        { id: 'NewsAPI', type: 'newsapi', name: 'NewsAPI', enabled: true, params: {} } as any,
      ]);

      // Intercepteur pour capturer la requête réelle (pas de mock)
      const client = (adapter as any).client as AxiosInstance;
      client.interceptors.request.use(cfg => {
        captured = cfg;
        return cfg;
      });
    });

    beforeEach(async () => {
      captured = null;
      await sleep(200);
    });

    it('tout: q, language=fr, pageSize<=100, sortBy=publishedAt, from/until si fournis', async () => {
      const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
      const until = new Date();

      const themes = ['BTP', 'chantier', 'construction'];
      const quals = ['administratif', 'conformité', 'réglementaire'];
      const q = `(${themes.join(' OR ')}) AND (${quals.join(' OR ')})`;

      const query: TopicFetchQuery = {
        seoKeywords: [q],
        language: 'fr',
        limit: 25,
        since,
        until,
        sources: ['NewsAPI'],
      } as any;

      const results = await adapter.discoverCandidates(query);

      // 1) Structure de la requête envoyée (capturée via intercepteur)
      expect(captured?.url).toBe('/everything');
      const params = captured?.params as Record<string, any>;
      expect(typeof params.q).toBe('string');
      expect(params.q.length).toBeGreaterThan(0);
      // On s'attend à une requête protégée par ProviderKeywordSelector
      // et à des opérateurs logiques dans q
      expect(params.q.includes('(')).toBe(true);
      expect(params.q.includes(')')).toBe(true);
      expect(params.q.toLowerCase()).toMatch(/ or | and /);

      expect(params.language).toBe('fr');
      expect(typeof params.pageSize).toBe('number');
      expect(params.pageSize).toBeLessThanOrEqual(100);
      expect(params.sortBy).toBe('publishedAt');
      // since/until → dates YYYY-MM-DD
      if (since) expect(String(params.from)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (until) expect(String(params.to)).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // 2) Résultat optionnel: pas d'exigence sur la longueur (dépend du provider)
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        const it0 = results[0] as any;
        expect(it0).toHaveProperty('title');
        expect(it0).toHaveProperty('sourceUrl');
      }
    }, 30_000);
  }
);
