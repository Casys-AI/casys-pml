import { type TrendDataDTO } from '@casys/shared';
import { getDataForSEOLocationCode } from '@casys/core';
import { type GoogleTrendsPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

// Interfaces pour typer la réponse de l'API
interface DataForSeoTaskResult {
  location_name: string;
  timeline: ({ value: number; values?: number[] } | number)[];
  keyword: string;
  keywords: string[];
  related_queries: { query: string }[];
  rising_queries: { query: string }[];
}

interface DataForSeoTask {
  status_code: number;
  result: DataForSeoTaskResult[];
}

interface DataForSeoResponse {
  status_code: number;
  tasks_error: number;
  tasks: DataForSeoTask[];
}

// Type guard pour valider la structure de la réponse
function isDataForSeoResponse(data: unknown): data is DataForSeoResponse {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as DataForSeoResponse;
  return (
    typeof d.status_code === 'number' && typeof d.tasks_error === 'number' && Array.isArray(d.tasks)
  );
}

export class DataForSeoTrendsAdapter implements GoogleTrendsPort {
  private readonly logger = createLogger('DataForSeoTrendsAdapter');
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    const login = env.DATAFORSEO_LOGIN;
    const password = env.DATAFORSEO_PASSWORD;
    const apiKey = env.DATAFORSEO_API_KEY;
    this.baseUrl = env.DATAFORSEO_BASE_URL ?? 'https://api.dataforseo.com';
    this.timeoutMs = Number(env.DATAFORSEO_TIMEOUT_MS ?? '80000');

    if (apiKey && apiKey.trim().length > 0) {
      this.authHeader = `Bearer ${apiKey.trim()}`;
    } else if (login && password) {
      this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
    } else {
      throw new Error(
        'DataForSEO credentials missing: set DATAFORSEO_API_KEY or DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD'
      );
    }

    this.logger.debug?.('DataForSEO Trends adapter configured', {
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      authMode: apiKey && apiKey.trim().length > 0 ? 'bearer' : 'basic',
    });
  }

  async getTrends(keywords: string[], region = 'FR'): Promise<TrendDataDTO[]> {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords array cannot be empty');
    }

    const url = `${this.baseUrl}/v3/keywords_data/google_trends/explore/live`;
    const locationCode = getDataForSEOLocationCode(region);
    const limitedKeywords = keywords.slice(0, 5);

    if (keywords.length > 5) {
      this.logger.debug?.('Keywords trimmed to 5 for DataForSEO task', {
        provided: keywords.length,
      });
    }

    const payload = [
      {
        keywords: limitedKeywords,
        location_code: locationCode,
      },
    ];

    this.logger.debug?.('Requesting DataForSEO trends...', {
      url,
      timeoutMs: this.timeoutMs,
      count: limitedKeywords.length,
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
      this.logger.error('DataForSEO error response', {
        status: res.status,
        text: text.slice(0, 300),
      });
      throw new Error(`DataForSEO trends failed: HTTP ${res.status}`);
    }

    const json: unknown = await res.json();

    if (!isDataForSeoResponse(json)) {
      throw new Error('Invalid response structure from DataForSEO');
    }

    if (json.status_code !== 20000) {
      throw new Error(`DataForSEO trends failed: status_code ${json.status_code}`);
    }
    if (json.tasks_error > 0) {
      throw new Error(`DataForSEO trends failed: tasks_error ${json.tasks_error}`);
    }

    const results: TrendDataDTO[] = [];
    try {
      for (const task of json.tasks) {
        if (task.status_code !== 20000) {
          throw new Error(`DataForSEO trends failed: task.status_code ${task.status_code}`);
        }
        for (const r of task.result) {
          const timeframe = 'last 12 months';
          const regionOut = String(r.location_name ?? region);

          if (
            Array.isArray(r.timeline) &&
            r.timeline.length > 0 &&
            Array.isArray((r.timeline[0] as { values: number[] })?.values)
          ) {
            const seriesCount = (r.timeline[0] as { values: number[] }).values.length;
            if (seriesCount > 0) {
              const sums: number[] = new Array<number>(seriesCount).fill(0);
              const counts: number[] = new Array<number>(seriesCount).fill(0);
              for (const point of r.timeline) {
                const values: number[] = (
                  ((point as { values: unknown })?.values as unknown[]) ?? []
                )
                  .map(v => Number(v))
                  .filter(v => Number.isFinite(v) && v >= 0);

                for (let i = 0; i < seriesCount; i++) {
                  const v = values[i] ?? 0;
                  sums[i] += v;
                  if (v > 0) counts[i] += 1;
                }
              }
              const interests = sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
              const kwList: string[] = Array.isArray(r.keywords)
                ? r.keywords.map(k => String(k))
                : limitedKeywords;
              for (let i = 0; i < seriesCount; i++) {
                const keyword = String(kwList[i] ?? `kw_${i + 1}`);
                const interest = interests[i] ?? 0;
                const trend: 'rising' | 'stable' | 'declining' = interest > 60 ? 'rising' : interest > 30 ? 'stable' : 'declining';
                results.push({
                  keyword,
                  trend,
                  relatedQueries: [],
                  searchVolume: interest,
                });
              }
              continue;
            }
          }

          const timeline: ({ value: number; values?: number[] } | number)[] = Array.isArray(
            r.timeline
          )
            ? r.timeline
            : [];
          const values: number[] = timeline
            .map(p => (typeof p === 'number' ? p : Number(p?.value ?? 0)))
            .filter((n: number) => Number.isFinite(n) && n >= 0);
          const interest = values.length
            ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
            : 0;

          const keyword = String(r.keyword ?? limitedKeywords[0] ?? '');
          const relatedQueries: string[] = Array.isArray(r.related_queries)
            ? r.related_queries
                .slice(0, 5)
                .map(x => String(x.query ?? ''))
                .filter(s => Boolean(s))
            : [];
          const risingQueries: string[] = Array.isArray(r.rising_queries)
            ? r.rising_queries
                .slice(0, 5)
                .map(x => String(x.query ?? ''))
                .filter(s => Boolean(s))
            : [];

          // Map to TrendDataDTO (no 'interest' field). Use interest as searchVolume proxy.
          const trend: 'rising' | 'stable' | 'declining' = interest > 60 ? 'rising' : interest > 30 ? 'stable' : 'declining';
          results.push({
            keyword,
            trend,
            relatedQueries,
            searchVolume: interest,
          });
        }
      }
    } catch (e) {
      this.logger.error('Failed to map DataForSEO trends JSON', e);
      if (e instanceof Error) throw new Error(`DataForSEO mapping error: ${e.message}`);
      throw new Error('DataForSEO mapping error: unknown');
    }

    if (results.length === 0) {
      throw new Error(
        `DataForSEO trends returned no data for region=${region}, keywords=${limitedKeywords.join(', ')}`
      );
    }

    this.logger.debug?.(`DataForSEO trends success: ${results.length}/${limitedKeywords.length}`);
    return results;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      this.logger.debug?.('DataForSEO trends fetch start', { url, timeoutMs: this.timeoutMs });
      const res = await fetch(url, { ...init, signal: controller.signal });
      const elapsedMs = Date.now() - startedAt;
      this.logger.debug?.('DataForSEO trends fetch done', { status: res.status, elapsedMs });
      return res;
    } catch (e) {
      const elapsedMs = Date.now() - startedAt;
      type UndiciError = Error & { code?: string; name?: string };
      const err = e as UndiciError;
      this.logger.error('DataForSEO trends fetch error', {
        url,
        elapsedMs,
        aborted: controller.signal.aborted,
        code: err && 'code' in err ? err.code : undefined,
        name: err?.name,
        message: err instanceof Error ? err.message : String(e),
      });
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
