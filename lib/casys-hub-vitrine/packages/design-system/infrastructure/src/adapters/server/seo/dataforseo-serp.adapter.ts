import { type CompetitorDataDTO } from '@casys/shared';
import { getDataForSEOLocationCode } from '@casys/core';
import { type GoogleScrapingPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

/**
 * Adaptateur DataForSEO pour remplacer le scraping SERP maison.
 * Implémente le port `GoogleScrapingPort` pour rester compatible avec l'application.
 *
 * Configuration requise (env):
 * - DATAFORSEO_API_KEY (recommandé) ou DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 * - DATAFORSEO_BASE_URL (optionnel, défaut: https://api.dataforseo.com)
 * - DATAFORSEO_TIMEOUT_MS (optionnel, défaut: 20000)
 * - SEO_SERP_LANGUAGE (optionnel, défaut: 'fr')
 * - SEO_SERP_REGION (optionnel, défaut: 'FR')
 */
export class DataForSeoSerpAdapter implements GoogleScrapingPort {
  private readonly logger = createLogger('DataForSeoSerpAdapter');
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    const login = env.DATAFORSEO_LOGIN;
    const password = env.DATAFORSEO_PASSWORD;
    const apiKey = env.DATAFORSEO_API_KEY;
    this.baseUrl = env.DATAFORSEO_BASE_URL ?? 'https://api.dataforseo.com';
    this.timeoutMs = Number(env.DATAFORSEO_TIMEOUT_MS ?? '40000');

    if (apiKey && apiKey.trim().length > 0) {
      this.authHeader = `Bearer ${apiKey.trim()}`;
    } else if (login && password) {
      this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
    } else {
      throw new Error(
        'DataForSEO credentials missing: set DATAFORSEO_API_KEY or DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD'
      );
    }
  }

  private isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object';
  }

  private toNumber(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  async scrapeTopResults(query: string, limit = 10): Promise<CompetitorDataDTO[]> {
    if (!query?.trim()) throw new Error('Search query cannot be empty');
    if (limit <= 0) throw new Error('Limit must be greater than 0');

    // Endpoint SERP Live
    const url = `${this.baseUrl}/v3/serp/google/organic/live/advanced`; // advanced pour récupérer title/snippet/url

    // Locale
    const languageCode = (this.env.SEO_SERP_LANGUAGE ?? 'fr').toLowerCase(); // ex: 'fr'
    const region = (this.env.SEO_SERP_REGION ?? 'FR').toUpperCase(); // ex: 'FR'
    const locationCode = getDataForSEOLocationCode(region);

    // Une seule tâche par POST
    const payload = [
      {
        keyword: query,
        language_code: languageCode,
        location_code: locationCode,
        device: 'desktop',
        os: 'windows',
        // Optional tunables: depth, se_domain, etc.
        // depth: 50, // laisser défaut, on limite ensuite avec `limit`
      },
    ];

    this.logger.debug?.('Requesting DataForSEO SERP...', { query, region, languageCode });

    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error('DataForSEO SERP error response', {
        status: res.status,
        text: text.slice(0, 300),
      });
      throw new Error(`DataForSEO SERP failed: HTTP ${res.status}`);
    }

    const json: unknown = await res.json();

    // Fail-fast provider-level (docs: status_code 20000 = success)
    const top = this.isRecord(json) ? json : {};
    const topStatus = this.toNumber(top.status_code);
    const tasksError = this.toNumber(top.tasks_error);
    if (topStatus && topStatus !== 20000) {
      throw new Error(`DataForSEO SERP failed: status_code ${topStatus}`);
    }
    if (tasksError > 0) {
      throw new Error(`DataForSEO SERP failed: tasks_error ${tasksError}`);
    }

    // Mapping CompetitorData[] à partir de la structure DataForSEO
    const out: CompetitorDataDTO[] = [];
    try {
      const tasks = Array.isArray(top.tasks) ? top.tasks : [];
      for (const task of tasks) {
        if (!this.isRecord(task)) continue;
        const tStatus = this.toNumber(task.status_code);
        if (tStatus && tStatus !== 20000) {
          throw new Error(`DataForSEO SERP failed: task.status_code ${tStatus}`);
        }
        const results = Array.isArray(task.result) ? task.result : [];
        for (const r of results) {
          if (!this.isRecord(r)) continue;
          const items = Array.isArray(r.items) ? r.items : [];
          for (const it of items) {
            if (!this.isRecord(it)) continue;
            if (out.length >= limit) break;
            const itemUrl = typeof it.url === 'string' ? it.url : '';
            const title = typeof it.title === 'string' ? it.title : itemUrl;
            const snippet = typeof it.description === 'string' ? it.description : '';
            if (!itemUrl) continue;

            out.push({
              url: itemUrl,
              title,
              description: snippet,
              keywords: this.extractKeywordsFromContent(`${title} ${snippet}`),
            });
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to map DataForSEO SERP JSON', e);
      if (e instanceof Error) throw new Error(`DataForSEO SERP mapping error: ${e.message}`);
      throw new Error('DataForSEO SERP mapping error: unknown');
    }

    if (out.length === 0) {
      throw new Error(`DataForSEO SERP returned no results for query="${query}"`);
    }

    this.logger.debug?.(`DataForSEO SERP success: ${out.length}`);
    return out.slice(0, limit);
  }

  private extractKeywordsFromContent(content: string): string[] {
    // simple extraction naïve, on garde aligné avec GoogleScrapingAdapter
    const words = content
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
