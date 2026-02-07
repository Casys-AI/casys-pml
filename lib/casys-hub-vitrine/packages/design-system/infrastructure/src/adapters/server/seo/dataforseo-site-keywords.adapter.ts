import * as dfs from 'dataforseo-client';

import { getDataForSEOLocationCode } from '@casys/core';
import type { SiteKeywordsPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

/**
 * Adapter DataForSEO Labs: keywords_for_site
 * Renvoie des mots-clés pertinents pour un domaine (pas seulement ceux où il rank)
 */
export class DataForSeoSiteKeywordsAdapter implements SiteKeywordsPort {
  private readonly logger = createLogger('DataForSeoSiteKeywordsAdapter');
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly labs: dfs.DataforseoLabsApi;
  private readonly authFetch: (url: RequestInfo, init?: RequestInit) => Promise<Response>;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    const login = env.DATAFORSEO_LOGIN;
    const password = env.DATAFORSEO_PASSWORD;
    const apiKey = env.DATAFORSEO_API_KEY;
    this.baseUrl = env.DATAFORSEO_BASE_URL ?? 'https://api.dataforseo.com';
    if (apiKey && apiKey.trim().length > 0) {
      this.authHeader = `Bearer ${apiKey.trim()}`;
    } else if (login && password) {
      this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
    } else {
      throw new Error(
        'DataForSEO credentials missing: set DATAFORSEO_API_KEY or DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD'
      );
    }

    // Authenticated fetch passed to SDK so it can inject Authorization header on all calls
    this.authFetch = (url: RequestInfo, init?: RequestInit) => {
      const headers = { ...(init?.headers as Record<string, string> | undefined), Authorization: this.authHeader };
      return fetch(url, { ...init, headers });
    };

    // Initialize Labs client from SDK
    this.labs = new dfs.DataforseoLabsApi(this.baseUrl, { fetch: this.authFetch });
  }

  async getKeywordsForSite(domain: string, region: string, language: string, limit = 20): Promise<string[]> {
    const clean = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!clean) throw new Error('domain is required');

    const locationCode = getDataForSEOLocationCode(region);
    const languageCode = String(language ?? 'en').toLowerCase();

    const req = new dfs.DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo();
    req.target = clean;
    req.location_code = locationCode;
    req.language_code = languageCode;
    req.limit = Math.max(1, Math.min(100, limit));

    this.logger.debug?.('Requesting DataForSEO Labs keywords_for_site (SDK)...', {
      target: clean,
      region,
      languageCode,
      limit: req.limit,
    });

    const resp = await this.labs.googleKeywordsForSiteLive([req]);

    // Provider-level checks
    const ensureOk = (r: any, label: string) => {
      if (!r) throw new Error(`${label} failed: empty response`);
      const sc = this.toNumber(r.status_code);
      const te = this.toNumber(r.tasks_error);
      if (sc && sc !== 20000) throw new Error(`${label} failed: status_code ${sc}`);
      if (te > 0) throw new Error(`${label} failed: tasks_error ${te}`);
    };
    ensureOk(resp, 'Labs keywordsForSiteLive');

    const out: string[] = [];
    try {
      const tasks: any[] = Array.isArray((resp as any).tasks) ? (resp as any).tasks : [];
      for (const t of tasks) {
        const tStatus = this.toNumber(t?.status_code);
        if (tStatus && tStatus !== 20000) continue;
        const results: any[] = Array.isArray(t?.result) ? t.result : [];
        for (const r of results) {
          const items: any[] = Array.isArray(r?.items) ? r.items : [];
          for (const it of items) {
            const kw = String(it?.keyword ?? it?.keyword_data?.keyword ?? '');
            if (kw) out.push(kw);
            if (out.length >= limit) break;
          }
          if (out.length >= limit) break;
        }
        if (out.length >= limit) break;
      }
    } catch (e) {
      this.logger.error('Failed to map keywords_for_site SDK response', e);
      if (e instanceof Error) throw new Error(`keywords_for_site mapping error: ${e.message}`);
      throw new Error('keywords_for_site mapping error: unknown');
    }

    if (out.length === 0) {
      this.logger.warn('keywords_for_site returned no keywords', { target: clean, region, languageCode });
    }

    return out.slice(0, limit);
  }

  private toNumber(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }
}
