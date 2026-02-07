import * as dfs from 'dataforseo-client';

import type { DomainAnalysisDTO } from '@casys/shared';
import {
  type DetectionInfo,
  type DomainAnalysisPort,
  type DomainRawMetrics,
  mapDetectionToSearchLocale,
  mapSearchLocaleToDataForSEOParams,
  mapToDomainAnalysisDTO,
} from '@casys/application';
import { mapCountryToLanguage, mapTldToCountry } from '@casys/core';

import { createLogger } from '../../../utils/logger';

/**
 * Adapter DataFor SEO Domain Analytics API
 * Analyse les métriques de domaines concurrents
 */
export class DataForSeoDomainAdapter implements DomainAnalysisPort {
  private readonly logger = createLogger('DataForSeoDomainAdapter');
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly labs: dfs.DataforseoLabsApi;
  private readonly backlinks: dfs.BacklinksApi;
  private readonly authFetch: (url: RequestInfo, init?: RequestInit) => Promise<Response>;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    const login = env.DATAFORSEO_LOGIN;
    const password = env.DATAFORSEO_PASSWORD;
    const apiKey = env.DATAFORSEO_API_KEY;
    this.baseUrl = env.DATAFORSEO_BASE_URL ?? 'https://api.dataforseo.com';
    this.timeoutMs = Number(env.DATAFORSEO_TIMEOUT_MS ?? '60000');

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
      const headers = {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: this.authHeader,
      };
      return fetch(url, { ...init, headers });
    };

    // Initialize Labs client from SDK (we use Labs endpoints for domain overview and ranked keywords)
    this.labs = new dfs.DataforseoLabsApi(this.baseUrl, { fetch: this.authFetch });
    // Initialize Backlinks client for backlinks metrics
    this.backlinks = new dfs.BacklinksApi(this.baseUrl, { fetch: this.authFetch });
  }

  async analyzeDomains(domains: string[]): Promise<DomainAnalysisDTO[]> {
    if (!Array.isArray(domains) || domains.length === 0) {
      throw new Error('Domains array cannot be empty');
    }

    // Détecter location et language pour chaque domaine (en parallèle, fail-fast)
    const detections = await Promise.all(
      domains.slice(0, 10).map(domain => this.detectLocationAndLanguage(domain))
    );
    // Préparation des requêtes SDK
    const slice = domains.slice(0, 10);
    const rankReqs = slice.map((domain, i) => {
      const det = detections[i];
      const locale = mapDetectionToSearchLocale({
        countryCode: det.countryCode,
        languageCode: det.languageCode,
      });
      const { location_code, language_code } = mapSearchLocaleToDataForSEOParams(locale);
      const req = new dfs.DataforseoLabsGoogleDomainRankOverviewLiveRequestInfo();
      req.target = this.sanitizeDomain(domain);
      // Centralisation via core utils: codes plutôt que noms
      req.location_code = location_code;
      req.language_code = language_code;
      req.limit = 100;
      return req;
    });

    const kwReqs = slice.map((domain, i) => {
      const det = detections[i];
      const locale = mapDetectionToSearchLocale({
        countryCode: det.countryCode,
        languageCode: det.languageCode,
      });
      const { location_code, language_code } = mapSearchLocaleToDataForSEOParams(locale);
      const req = new dfs.DataforseoLabsGoogleRankedKeywordsLiveRequestInfo();
      req.target = this.sanitizeDomain(domain);
      req.location_code = location_code;
      req.language_code = language_code;
      req.limit = 10; // top 10 mots-clés
      req.item_types = ['organic'];
      return req;
    });

    // Backlinks summary requests (best-effort: will gracefully fallback on failure)
    const backlinksReqs = slice.map((domain) => {
      const req = new dfs.BacklinksSummaryLiveRequestInfo();
      req.target = this.sanitizeDomain(domain);
      return req;
    });

    this.logger.debug?.('Requesting DataForSEO Labs via SDK...', {
      count: slice.length,
      rankReqs: rankReqs.map(r => ({
        target: r.target,
        location_code: r.location_code,
        language_code: r.language_code,
        limit: r.limit,
      })),
      kwReqs: kwReqs.map(r => ({
        target: r.target,
        location_code: r.location_code,
        language_code: r.language_code,
        limit: r.limit,
      })),
    });

    // Appels SDK (Live) - en parallèle pour optimiser la latence
    // Backlinks: best-effort, do not block
    const [rankResp, kwResp, backlinksResp] = await Promise.all([
      this.labs.googleDomainRankOverviewLive(rankReqs),
      this.labs.googleRankedKeywordsLive(kwReqs),
      (async () => {
        try {
          const resp = await this.backlinks.summaryLive(backlinksReqs);
          return resp as unknown as { status_code?: number; tasks_error?: number; tasks?: unknown[] };
        } catch (e) {
          this.logger.warn?.('Backlinks summaryLive failed (non-bloquant)', e);
          return { status_code: 20000, tasks_error: 0, tasks: [] };
        }
      })(),
    ]);

    // Vérifications provider-level
    const ensureOk = (resp: any, label: string) => {
      if (!resp) throw new Error(`${label} failed: empty response`);
      const sc = this.toNumber(resp.status_code);
      const te = this.toNumber(resp.tasks_error);
      if (sc && sc !== 20000) throw new Error(`${label} failed: status_code ${sc}`);
      if (te > 0) throw new Error(`${label} failed: tasks_error ${te}`);
    };

    ensureOk(rankResp, 'Labs googleDomainRankOverviewLive');
    ensureOk(kwResp, 'Labs googleRankedKeywordsLive');
    // Backlinks check best-effort: si erreur, on a déjà renvoyé tasks:[] via fallback ci-dessus
    try {
      ensureOk(backlinksResp, 'Backlinks summaryLive');
    } catch (e) {
      this.logger.warn?.('Backlinks summaryLive not OK (non-bloquant)', e);
    }

    // Mapping via mapper application
    const results: DomainAnalysisDTO[] = [];
    try {
      interface DfsTask {
        status_code?: number;
        result?: unknown[];
      }
      interface RankResult {
        target?: string;
        items?: { metrics?: Record<string, { etv?: number } | number | undefined> }[];
      }
      interface KwResult {
        target?: string;
        items?: unknown[];
      }

      const rankTasks: DfsTask[] = Array.isArray((rankResp as any).tasks)
        ? (rankResp as any).tasks
        : [];
      const kwTasks: DfsTask[] = Array.isArray((kwResp as any).tasks) ? (kwResp as any).tasks : [];
      const backlinksTasks: DfsTask[] = Array.isArray((backlinksResp as any)?.tasks)
        ? ((backlinksResp as any).tasks as DfsTask[])
        : [];

      const items: { metrics: DomainRawMetrics; detection: DetectionInfo }[] = [];

      for (let i = 0; i < slice.length; i++) {
        const target = this.sanitizeDomain(slice[i]);
        const det = detections[i];

        // Rank overview → organicTraffic (etv), keywordsCount (count), domainValue (estimated_paid_traffic_cost)
        let organicTraffic: number | undefined = undefined;
        let keywordsCount: number | undefined = undefined;
        let domainValue: number | undefined = undefined;
        // Position Insights v2
        let positionDistribution: any = undefined;
        let keywordTrends: any = undefined;
        let trafficMetrics: any = undefined;

        const rTask = rankTasks.find(
          t => Array.isArray(t.result) && t.result.some((r: any) => r.target === target)
        );
        if (rTask && this.toNumber(rTask.status_code) === 20000) {
          const rRes = (
            Array.isArray(rTask.result)
              ? rTask.result.find(
                  r =>
                    r &&
                    typeof r === 'object' &&
                    'target' in (r as Record<string, unknown>) &&
                    (r as Record<string, unknown>).target === target
                )
              : undefined
          ) as RankResult | undefined;
          const rItems = Array.isArray(rRes?.items) ? rRes.items : [];

          if (rItems.length > 0 && rItems[0]?.metrics) {
            const metricsObj = rItems[0].metrics as Record<string, any>;
            const m = metricsObj.organic; // Utiliser metrics.organic directement

            if (m) {
              // Métriques de base
              organicTraffic = this.toNumber(m.etv) || undefined;
              keywordsCount = this.toNumber(m.count) || undefined;
              domainValue = this.toNumber(m.estimated_paid_traffic_cost) || undefined;

              // Position Distribution (pos_1 à pos_91_100)
              positionDistribution = {
                pos_1: this.toNumber(m.pos_1) || 0,
                pos_2_3: this.toNumber(m.pos_2_3) || 0,
                pos_4_10: this.toNumber(m.pos_4_10) || 0,
                pos_11_20: this.toNumber(m.pos_11_20) || 0,
                pos_21_30: this.toNumber(m.pos_21_30) || 0,
                pos_31_40: this.toNumber(m.pos_31_40) || 0,
                pos_41_50: this.toNumber(m.pos_41_50) || 0,
                pos_51_60: this.toNumber(m.pos_51_60) || 0,
                pos_61_70: this.toNumber(m.pos_61_70) || 0,
                pos_71_80: this.toNumber(m.pos_71_80) || 0,
                pos_81_90: this.toNumber(m.pos_81_90) || 0,
                pos_91_100: this.toNumber(m.pos_91_100) || 0,
              };

              // Keyword Trends
              keywordTrends = {
                isNew: this.toNumber(m.is_new) || 0,
                isUp: this.toNumber(m.is_up) || 0,
                isDown: this.toNumber(m.is_down) || 0,
                isLost: this.toNumber(m.is_lost) || 0,
              };

              // Traffic Metrics
              trafficMetrics = {
                estimatedTrafficValue: this.toNumber(m.etv) || 0,
                estimatedPaidTrafficCost: this.toNumber(m.estimated_paid_traffic_cost) || 0,
                totalKeywordsCount: this.toNumber(m.count) || 0,
              };

              this.logger.debug?.('[DataForSEO] Extracted position insights:', {
                positionGroups: `Top 3: ${positionDistribution.pos_1 + positionDistribution.pos_2_3}`,
                trends: `New: ${keywordTrends.isNew}, Up: ${keywordTrends.isUp}, Down: ${keywordTrends.isDown}`,
              });
            }
          }
        }

        // Ranked keywords → topKeywords
        let topKeywords: { keyword: string; position: number; searchVolume: number }[] | undefined =
          undefined;
        const kTask = kwTasks.find(
          t =>
            Array.isArray(t.result) &&
            t.result.some(
              r =>
                r &&
                typeof r === 'object' &&
                'target' in (r as Record<string, unknown>) &&
                (r as Record<string, unknown>).target === target
            )
        );
        if (kTask && this.toNumber(kTask.status_code) === 20000) {
          const kRes = (
            Array.isArray(kTask.result)
              ? kTask.result.find(
                  r =>
                    r &&
                    typeof r === 'object' &&
                    'target' in (r as Record<string, unknown>) &&
                    (r as Record<string, unknown>).target === target
                )
              : undefined
          ) as KwResult | undefined;
          const kItems = Array.isArray(kRes?.items) ? kRes.items : [];
          const computed = kItems
            .slice(0, 10)
            .map((it: any) => {
              const keyword = String(it.keyword ?? it?.keyword_data?.keyword ?? '');
              const position = this.toNumber(
                it?.ranked_serp_element?.serp_item?.rank_absolute ?? it.rank_absolute
              );
              const searchVolume = this.toNumber(
                it?.keyword_data?.keyword_info?.search_volume ?? it.search_volume
              );
              return { keyword, position, searchVolume };
            })
            .filter((x: any) => x.keyword);
          topKeywords = computed.length > 0 ? computed : undefined;
        }

        // Backlinks summary → backlinksCount, referringDomains
        let backlinksCount: number | undefined = undefined;
        let referringDomains: number | undefined = undefined;
        const bTask = backlinksTasks.find(
          t => Array.isArray(t.result) && t.result.some((r: any) => r.target === target)
        );
        if (bTask && this.toNumber(bTask.status_code) === 20000) {
          const bRes = (
            Array.isArray(bTask.result)
              ? bTask.result.find(
                  r =>
                    r &&
                    typeof r === 'object' &&
                    'target' in (r as Record<string, unknown>) &&
                    (r as Record<string, unknown>).target === target
                )
              : undefined
          ) as { target?: string; backlinks?: number; referring_domains?: number } | undefined;
          if (bRes) {
            backlinksCount = this.toNumber(bRes.backlinks);
            referringDomains = this.toNumber(bRes.referring_domains);
          }
        }

        items.push({
          metrics: {
            domain: target,
            domainRank: undefined, // NOTE: DataForSEO Domain Rank Overview API does NOT provide domainRank/Domain Rating
            organicTraffic,
            keywordsCount,
            domainValue,
            backlinksCount,
            referringDomains,
            topKeywords,
            // Position Insights v2
            positionDistribution,
            keywordTrends,
            trafficMetrics,
          },
          detection: {
            countryCode: det?.countryCode,
            languageCode: det?.languageCode,
          },
        });
      }

      const mapped = mapToDomainAnalysisDTO(items);
      // cast léger vers DomainAnalysisDTO si formes équivalentes
      (mapped as unknown as DomainAnalysisDTO[]).forEach(m => results.push(m));
    } catch (e) {
      this.logger.error('Failed to map DataForSEO Domain JSON', {
        error: e instanceof Error ? e.message : String(e),
      });
      if (e instanceof Error) throw new Error(`DataForSEO Domain mapping error: ${e.message}`);
      throw new Error('DataForSEO Domain mapping error: unknown');
    }

    if (results.length === 0) {
      throw new Error(`DataForSEO Domain returned no results for domains=${domains.join(', ')}`);
    }

    this.logger.debug?.(`DataForSEO Domain success: ${results.length}`);
    return results;
  }

  private sanitizeDomain(domain: string): string {
    // SDK docs: domain should be without https:// and www.
    const d = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    return d.split('/')[0];
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

  private async detectLocationAndLanguage(
    domain: string
  ): Promise<{ countryCode: string; languageCode: string; ip: string }> {
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];

    // 1. Tenter détection via TLD (priorité haute, rapide et fiable)
    let countryCode: string | undefined = mapTldToCountry(domain);
    let ip = ''; // Placeholder, sera rempli si on passe par geolocation

    // 2. Si TLD non mappé ou générique (.com, .org, .net), fallback sur IP geolocation
    if (!countryCode) {
      this.logger.debug?.(
        `[detectLocationAndLanguage] No country from TLD for ${domain}, using IP geolocation fallback`
      );

      // Résolution DNS → IP
      const { promises: dns } = await import('node:dns');
      const addresses = await dns.resolve4(cleanDomain);
      if (!addresses || addresses.length === 0) {
        throw new Error(`[detectLocationAndLanguage] DNS resolution failed for ${cleanDomain}`);
      }
      ip = addresses[0];

      // Géolocalisation IP → country
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!geoRes.ok) {
        throw new Error(
          `[detectLocationAndLanguage] Geolocation API failed for IP ${ip}: HTTP ${geoRes.status}`
        );
      }
      const geoData = (await geoRes.json()) as { countryCode?: string };
      if (!geoData.countryCode) {
        throw new Error(
          `[detectLocationAndLanguage] Geolocation API returned no countryCode for IP ${ip}`
        );
      }
      countryCode = geoData.countryCode;
      this.logger.debug?.(
        `[detectLocationAndLanguage] Country from IP geolocation: ${countryCode}`
      );
    } else {
      this.logger.debug?.(
        `[detectLocationAndLanguage] Country from TLD: ${countryCode} (no IP lookup needed)`
      );
    }

    // 3. Fetch HTML du domaine pour parser la balise lang (avec fallback www.)
    let htmlUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    let htmlRes: Response;

    try {
      htmlRes = await fetch(htmlUrl, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CasysBot/1.0)' },
      });
    } catch (err) {
      // Fallback: tenter avec www. si le domaine racine échoue
      const wwwDomain = domain.startsWith('www.') ? domain : `www.${cleanDomain}`;
      this.logger.warn?.(
        `[detectLocationAndLanguage] ${htmlUrl} failed, trying with www.${cleanDomain}`
      );
      htmlUrl = `https://${wwwDomain}`;
      htmlRes = await fetch(htmlUrl, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CasysBot/1.0)' },
      });
    }

    if (!htmlRes.ok) {
      throw new Error(
        `[detectLocationAndLanguage] HTML fetch failed for ${htmlUrl}: HTTP ${htmlRes.status}`
      );
    }
    const html = await htmlRes.text();
    const langRegex = /<html[^>]+lang=["']([^"']+)["']/i;
    const langMatch = langRegex.exec(html);

    let languageCode: string;
    if (langMatch?.[1]) {
      // Attribut lang trouvé dans le HTML
      languageCode = langMatch[1].split('-')[0].toLowerCase();
      this.logger.debug?.(`[detectLocationAndLanguage] Lang from HTML: ${languageCode}`);
    } else {
      // Fallback: inférer la langue depuis le pays
      const inferredLang = mapCountryToLanguage(countryCode);
      if (!inferredLang) {
        throw new Error(
          `[detectLocationAndLanguage] No lang attribute in HTML for ${htmlUrl} and no mapping for country ${countryCode}`
        );
      }
      languageCode = inferredLang;
      this.logger.warn?.(
        `[detectLocationAndLanguage] No lang attribute in HTML for ${htmlUrl}, using country-based fallback: ${countryCode} → ${languageCode}`
      );
    }

    this.logger.debug?.(`Detected for ${domain}:`, { ip, countryCode, languageCode });
    return { countryCode, languageCode, ip };
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
