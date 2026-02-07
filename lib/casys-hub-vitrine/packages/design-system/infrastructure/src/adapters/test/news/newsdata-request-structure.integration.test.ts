import axios from 'axios';
import { config as dotenv } from 'dotenv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { NewsDataArticleFetcherAdapter } from '../../server/news/newsdata-article-fetcher.adapter';

dotenv({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === '1';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

(INTEGRATION_ENABLED ? describe : describe.skip)(
  'NewsData - request structure (live, guarded)',
  () => {
    let adapter: NewsDataArticleFetcherAdapter;
    let captured: any;

    beforeAll(() => {
      const key = process.env.NEWSDATA_API_KEY;
      if (!key) throw new Error('NEWSDATA_API_KEY requis pour test intégration réel (NewsData)');
      adapter = new NewsDataArticleFetcherAdapter();

      // Intercepteur global axios pour capturer la requête
      axios.interceptors.request.use(cfg => {
        captured = cfg;
        return cfg;
      });
    });

    beforeEach(async () => {
      captured = null;
      await sleep(200);
    });

    it('params: endpoint /news, q protégé (parenthèses/quotes), size=10, language=fr si fourni, q.length<=100', async () => {
      const query: TopicFetchQuery = {
        seoKeywords: [
          'gestion administrative BTP',
          'conformité réglementaire chantier',
          'suivi administratif chantier',
        ],
        language: 'fr',
      } as any;

      const results = await adapter.discoverCandidates(query);

      // 1) Structure de la requête envoyée (capturée)
      expect(String(captured?.url ?? '').endsWith('/news')).toBe(true);
      const params = captured?.params as URLSearchParams;
      expect(params).toBeInstanceOf(URLSearchParams);

      const q = String(params.get('q') ?? '');
      expect(q.length).toBeGreaterThan(0);
      expect(q.length).toBeLessThanOrEqual(100);
      // Doit contenir des parenthèses et potentiellement des guillemets pour multi-mots
      expect(q.includes('(') && q.includes(')')).toBe(true);

      const lang = params.get('language');
      expect(lang).toBe('fr');

      const size = params.get('size');
      expect(size).toBe('10');

      // 2) Résultats optionnels
      expect(Array.isArray(results)).toBe(true);
    }, 30_000);
  }
);
