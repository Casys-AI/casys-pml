import axios from 'axios';
import { config as dotenv } from 'dotenv';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';

import { WorldNewsArticleFetcherAdapter } from '../../server/news/worldnews-article-fetcher.adapter';

dotenv({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === '1';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

(INTEGRATION_ENABLED ? describe : describe.skip)(
  'WorldNews - request structure (live, guarded)',
  () => {
    let adapter: WorldNewsArticleFetcherAdapter;
    let captured: any;

    beforeAll(() => {
      const key = process.env.WORLD_NEWS_API_KEY;
      if (!key) throw new Error('WORLD_NEWS_API_KEY requis pour test intégration réel (WorldNews)');
      adapter = new WorldNewsArticleFetcherAdapter();

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

    it('params: endpoint /search-news, text<=100, source-countries=fr, tri publish-time DESC, number=20', async () => {
      const query: TopicFetchQuery = {
        seoKeywords: ['BTP', 'construction', 'réglementations'],
        language: 'fr',
      } as any;

      const results = await adapter.discoverCandidates(query);

      // 1) Structure de la requête envoyée (capturée)
      expect(String(captured?.url ?? '').endsWith('/search-news')).toBe(true);
      const params = captured?.params as URLSearchParams;
      expect(params).toBeInstanceOf(URLSearchParams);

      const text = String(params.get('text') ?? '');
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(100);
      // Doit contenir des OR entre tokens (sélecteur worldnews)
      expect(text.toLowerCase()).toContain(' or ');

      const sc = params.get('source-countries');
      expect(sc).toBe('fr');

      expect(params.get('sort-by')).toBe('publish-time');
      expect(params.get('sort-direction')).toBe('DESC');
      expect(params.get('number')).toBe('20');

      // 2) Résultats optionnels
      expect(Array.isArray(results)).toBe(true);
    }, 30_000);
  }
);
