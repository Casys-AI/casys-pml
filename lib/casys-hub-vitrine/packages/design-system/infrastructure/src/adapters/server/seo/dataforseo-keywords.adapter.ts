import { getDataForSEOLocationCode } from '@casys/core';
import type { KeywordMetricsDTO } from '@casys/shared';
import type { KeywordEnrichmentPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

/**
 * Adapter DataForSEO Keywords Data API
 * Fournit les métriques SEO réelles (volume, difficulté, CPC, etc.)
 */
export class DataForSeoKeywordsAdapter implements KeywordEnrichmentPort {
  private readonly logger = createLogger('DataForSeoKeywordsAdapter');
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

  async enrichKeywords(keywords: string[], region = 'FR'): Promise<KeywordMetricsDTO[]> {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords array cannot be empty');
    }

    // Endpoint Keywords Data (search volume, difficulty, CPC)
    const url = `${this.baseUrl}/v3/keywords_data/google_ads/search_volume/live`;
    const locationCode = getDataForSEOLocationCode(region);
    const languageCode = region === 'FR' ? 'fr' : 'en';

    const payload = [
      {
        keywords: keywords.slice(0, 100), // Limite DataForSEO
        location_code: locationCode,
        language_code: languageCode,
      },
    ];

    this.logger.debug?.('Requesting DataForSEO Keywords Data...', {
      count: keywords.length,
      region,
      locationCode,
    });

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
      this.logger.error('DataForSEO Keywords error response', {
        status: res.status,
        text: text.slice(0, 300),
      });
      throw new Error(`DataForSEO Keywords failed: HTTP ${res.status}`);
    }

    const json: unknown = await res.json();

    // Fail-fast provider-level
    const top = this.isRecord(json) ? json : {};
    const topStatus = this.toNumber(top.status_code);
    const tasksError = this.toNumber(top.tasks_error);

    if (topStatus && topStatus !== 20000) {
      throw new Error(`DataForSEO Keywords failed: status_code ${topStatus}`);
    }
    if (tasksError > 0) {
      throw new Error(`DataForSEO Keywords failed: tasks_error ${tasksError}`);
    }

    // Mapping vers KeywordMetricsDTO
    const results: KeywordMetricsDTO[] = [];
    try {
      const tasks = Array.isArray(top.tasks) ? top.tasks : [];
      for (const task of tasks) {
        if (!this.isRecord(task)) continue;
        const tStatus = this.toNumber(task.status_code);
        if (tStatus && tStatus !== 20000) {
          throw new Error(`DataForSEO Keywords failed: task.status_code ${tStatus}`);
        }

        const result = Array.isArray(task.result) ? task.result : [];
        for (const item of result) {
          if (!this.isRecord(item)) continue;

          const keyword = String(item.keyword ?? '');
          const searchVolume = this.toNumber(item.search_volume);
          // DataForSEO search_volume endpoint uses 'competition_index' (0-100) instead of 'keyword_difficulty'
          const difficulty = this.toNumber(item.competition_index ?? item.keyword_difficulty);
          const cpc = typeof item.cpc === 'number' ? item.cpc : undefined;
          const competition = this.mapCompetition(item.competition);
          const relatedKeywords = Array.isArray(item.related_keywords)
            ? item.related_keywords.map(k => String(k)).filter(Boolean)
            : undefined;
          
          // CPC range (top of page bids)
          const lowTopOfPageBid = typeof item.low_top_of_page_bid === 'number' ? item.low_top_of_page_bid : undefined;
          const highTopOfPageBid = typeof item.high_top_of_page_bid === 'number' ? item.high_top_of_page_bid : undefined;
          
          // Monthly searches (seasonal trends)
          const monthlySearches = Array.isArray(item.monthly_searches)
            ? item.monthly_searches
                .filter(ms => this.isRecord(ms))
                .map(ms => ({
                  year: this.toNumber(ms.year),
                  month: this.toNumber(ms.month),
                  searchVolume: this.toNumber(ms.search_volume),
                }))
                .filter(ms => ms.year > 0 && ms.month > 0)
            : undefined;

          if (!keyword) continue;

          results.push({
            keyword,
            searchVolume,
            difficulty,
            cpc,
            competition,
            relatedKeywords,
            lowTopOfPageBid,
            highTopOfPageBid,
            monthlySearches,
          });
        }
      }
    } catch (e) {
      this.logger.error('Failed to map DataForSEO Keywords JSON', e);
      if (e instanceof Error) throw new Error(`DataForSEO Keywords mapping error: ${e.message}`);
      throw new Error('DataForSEO Keywords mapping error: unknown');
    }

    if (results.length === 0) {
      throw new Error(
        `DataForSEO Keywords returned no results for region=${region}, keywords=${keywords.join(', ')}`
      );
    }

    this.logger.debug?.(`DataForSEO Keywords success: ${results.length}`);
    return results;
  }

  async getRelatedKeywords(
    keywords: string[],
    region = 'FR',
    options?: { limit?: number; depth?: number }
  ): Promise<KeywordMetricsDTO[]> {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords array cannot be empty');
    }

    const limit = options?.limit; // no default cap; provider may default internally
    const depth = options?.depth ?? 2; // 1 = direct related, 2 = related + their related
    const locationCode = getDataForSEOLocationCode(region);
    const languageCode = region === 'FR' ? 'fr' : 'en';

    // Endpoint Related Keywords (DataForSEO Labs)
    const url = `${this.baseUrl}/v3/dataforseo_labs/google/related_keywords/live`;

    const allRelatedKeywords: KeywordMetricsDTO[] = [];
    const processedSeeds = new Set<string>();

    // Process each seed keyword (no artificial cap)
    for (const seed of keywords) {
      if (processedSeeds.has(seed.toLowerCase())) continue;
      processedSeeds.add(seed.toLowerCase());

      const payload = [
        {
          keyword: seed,
          location_code: locationCode,
          language_code: languageCode,
          limit, // undefined -> omitted by JSON.stringify
          depth,
          include_seed_keyword: false, // Don't include the seed in results
          include_serp_info: false, // We don't need SERP data here
        },
      ];

      this.logger.debug?.('Requesting DataForSEO Related Keywords...', {
        seed,
        region,
        limit,
        depth,
      });

      try {
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
          this.logger.warn('DataForSEO Related Keywords error for seed', {
            seed,
            status: res.status,
            text: text.slice(0, 200),
          });
          continue; // Skip this seed, continue with others
        }

        const json: unknown = await res.json();
        const top = this.isRecord(json) ? json : {};
        const topStatus = this.toNumber(top.status_code);

        if (topStatus && topStatus !== 20000) {
          this.logger.warn(`DataForSEO Related Keywords failed for seed ${seed}: status ${topStatus}`);
          continue;
        }

        // Parse results
        const tasks = Array.isArray(top.tasks) ? top.tasks : [];
        for (const task of tasks) {
          if (!this.isRecord(task)) continue;
          const tStatus = this.toNumber(task.status_code);
          if (tStatus && tStatus !== 20000) continue;

          const result = Array.isArray(task.result) ? task.result : [];
          for (const item of result) {
            if (!this.isRecord(item)) continue;

            const items = Array.isArray(item.items) ? item.items : [];
            for (const kw of items) {
              if (!this.isRecord(kw)) continue;

              const kwData = this.isRecord(kw.keyword_data) ? kw.keyword_data : null;
              if (!kwData) continue;

              const keyword = typeof kwData.keyword === 'string' ? kwData.keyword : '';
              if (!keyword) continue;

              const keywordInfo = this.isRecord(kwData.keyword_info) ? kwData.keyword_info : null;
              const keywordProps = this.isRecord(kwData.keyword_properties) ? kwData.keyword_properties : null;

              const searchVolume = keywordInfo ? this.toNumber(keywordInfo.search_volume) : 0;
              const difficulty = keywordProps ? this.toNumber(keywordProps.keyword_difficulty) : 0;
              const cpc = keywordInfo && typeof keywordInfo.cpc === 'number' ? keywordInfo.cpc : undefined;
              const competition = keywordInfo ? this.mapCompetition(keywordInfo.competition) : undefined;

              allRelatedKeywords.push({
                keyword,
                searchVolume,
                difficulty,
                cpc,
                competition,
              });
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to get related keywords for seed ${seed}`, e);
        continue; // Continue with next seed
      }
    }

    // Deduplicate by keyword (case-insensitive)
    const uniqueKeywords = new Map<string, KeywordMetricsDTO>();
    for (const kw of allRelatedKeywords) {
      const key = kw.keyword.toLowerCase();
      if (!uniqueKeywords.has(key)) {
        uniqueKeywords.set(key, kw);
      }
    }

    const results = Array.from(uniqueKeywords.values());

    this.logger.debug?.(`DataForSEO Related Keywords success: ${results.length} unique keywords from ${processedSeeds.size} seeds`);
    return results;
  }

  private mapCompetition(value: unknown): 'low' | 'medium' | 'high' | undefined {
    const str = String(value ?? '').toUpperCase();
    if (str === 'LOW') return 'low';
    if (str === 'MEDIUM') return 'medium';
    if (str === 'HIGH') return 'high';
    return undefined;
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
