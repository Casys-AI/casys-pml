import type { CompetitorDataDTO, KeywordTagDTO } from '@casys/shared';
import { Domain, type LeadSnapshot } from '@casys/core';

import {
  buildPagesSummary,
  scrapeImportantPages,
} from './helpers';
import type { DomainIdentityStreamingCallbacks,LeadAnalysisUseCaseDeps } from './types';
import { KeywordDiscoveryMapper } from '../../mappers/keyword-discovery.mapper';
import { createLogger, type Logger } from '../../utils/logger';

/**
 * Lead Analysis - Overview (Step 1)
 * Streams domain identity data (metrics, business context, keywords) via SSE callbacks
 * NO ontology building - fast preview mode only
 */
export class OverviewUseCase {
  private readonly logger: Logger;

  constructor(private readonly deps: LeadAnalysisUseCaseDeps) {
    this.logger = deps.logger as Logger ?? createLogger('OverviewUseCase');
  }

  /**
   * Execute Overview step with SSE streaming
   * Sends events as they arrive (metrics, pages, businessContext, keywords)
   */
  async execute(
    input: { domain: string; force?: boolean },
    callbacks: DomainIdentityStreamingCallbacks & {
      onPages: (count: number) => Promise<void>;
      onKeywords: (keywords: unknown) => Promise<void>;
    }
  ): Promise<LeadSnapshot> {
    // Créer le Domain VO (fail-fast si invalide)
    const domainVO = Domain.create(input.domain);
    const domain = domainVO.value; // Pour compatibilité avec code existant utilisant string

    await callbacks.onStatus('Analyzing domain...');

    // Fail-fast if missing required dependencies
    if (!this.deps.businessContextAgent) {
      throw new Error('[OverviewUseCase] businessContextAgent is required');
    }

    // Type narrowing
    const businessContextAgent = this.deps.businessContextAgent;

    // Fail-fast if missing keywordDiscovery
    if (!this.deps.keywordDiscovery) {
      throw new Error('[OverviewUseCase] keywordDiscovery is required');
    }
    const keywordDiscovery = this.deps.keywordDiscovery;

    // Parallelize domain analysis + page scraping (saves 3-5s)
    this.logger.debug?.('[Step1Streaming] Starting parallel domain analysis + page scraping...');
    const [domainData, importantPages] = await Promise.all([
      this.deps.domainAnalysis.analyzeDomains([domain]),
      scrapeImportantPages(domain, this.deps),
    ]);
    this.logger.debug?.('[Step1Streaming] Parallel operations completed');

    const metrics = domainData[0];
    await callbacks.onMetrics(metrics);
    await callbacks.onPages(importantPages.length);

    // NOTE: Keywords DataForSEO are now displayed in TopKeywordsCard via metrics.topKeywords
    // Previously they were streamed as ontology nodes which caused them to appear in "Topics Discovered"
    // instead of "Top Keywords". Keeping metrics.topKeywords for proper display.
    this.logger.debug?.('[Step1Streaming] Keywords will be displayed via metrics.topKeywords in TopKeywordsCard');

    // Language detection
    let language = String((metrics as unknown as { detectedLanguageCode?: string })?.detectedLanguageCode ?? '').toLowerCase();
    if (!language && importantPages.length > 0) {
      const counts = importantPages
        .map(p => String(p.language ?? '').toLowerCase())
        .filter(l => !!l)
        .reduce((acc, l) => { acc[l] = (acc[l] || 0) + 1; return acc; }, {} as Record<string, number>);
      const maj = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      language = maj ?? importantPages[0].language ?? 'en';
    }
    if (!language) language = 'en';

    // Ranked keywords from DataForSEO
    const metricsTyped = metrics as { topKeywords?: { keyword: string; position?: number; searchVolume?: number }[] };
    const rankedKeywordsFromDataForSEO = (metricsTyped.topKeywords ?? []).map(kw => ({
      keyword: kw.keyword,
      position: typeof kw.position === 'number' ? kw.position : 0,
      searchVolume: typeof kw.searchVolume === 'number' ? kw.searchVolume : 0
    }));

    // Build pages summary for business context
    const pagesSummary = buildPagesSummary(importantPages);

    this.logger.debug?.('[Step1Streaming] Starting Business Context + Keyword Discovery in parallel...');
    await callbacks.onStatus('Analyzing business context & discovering keywords...');

    // ⚡ Lancer Business Context ET Keyword Discovery en parallèle
    const [businessContext, aiKeywords]: [unknown, KeywordTagDTO[]] = await Promise.all([
      // Business Context (~5s) - commenced immediately
      (async () => {
        const bc = await businessContextAgent.analyze({ domain: domainVO, pagesSummary, language });
        this.logger.debug?.('[Step1Streaming] Business context analysis complete');
        await callbacks.onBusinessContext(bc);
        return bc;
      })(),

      // Keyword Discovery (AI-only, ~10-15s)
      (async () => {
        await callbacks.onStatus('Extracting keywords from content...');
        const keywords = await keywordDiscovery.discoverKeywords(
          domainVO,
          {
            pages: importantPages,
            rankedKeywords: rankedKeywordsFromDataForSEO,
            businessContext: {}, // Will be populated by BC result if needed later
          },
          language
        );
        await callbacks.onStatus('Keywords extracted');
        return keywords;
      })()
    ]);

    this.logger.debug?.('[Step1Streaming] Keyword discovery complete (AI-only)', {
      aiKeywordsCount: aiKeywords.length,
    });

    // Enrichir avec ranked keywords via Mapper (simple enrichissement basique)
    const mapper = new KeywordDiscoveryMapper(this.logger);
    const baseEnrichedKeywords = mapper.enrichWithRankedKeywords(aiKeywords, rankedKeywordsFromDataForSEO);

    this.logger.debug?.('[Step1Streaming] Base enrichment complete (ranked keywords)', {
      totalKeywords: baseEnrichedKeywords.length,
      withSearchVolume: baseEnrichedKeywords.filter(k => k.searchVolume).length,
    });

    // Enrich keywords with full DataForSEO metrics (difficulty, cpc, trends, etc.) in 2 phases
    // Phase 1: Enrich top 6-10 keywords IMMEDIATELY (for fast UX)
    // Phase 2: Enrich remaining keywords (batch)
    this.logger.debug?.('[Step1Streaming] Starting DataForSEO enrichment (2-phase strategy)...');

    let enrichedKeywords: KeywordTagDTO[] = baseEnrichedKeywords;
    const rankedMap = new Map(
      rankedKeywordsFromDataForSEO.map(kw => [kw.keyword.toLowerCase(), kw])
    );

    if (this.deps.keywordEnrichment && baseEnrichedKeywords.length > 0) {
      try {
        // Phase 1: Top 6-10 keywords (priority batch)
        const topKeywords: KeywordTagDTO[] = baseEnrichedKeywords.slice(0, 10);
        const remainingKeywords: KeywordTagDTO[] = baseEnrichedKeywords.slice(10);

        this.logger.debug?.('[Step1Streaming] Phase 1: Enriching top keywords...', {
          topCount: topKeywords.length,
        });
        await callbacks.onStatus(`Enriching top ${topKeywords.length} keywords...`);

        const topMetrics = await this.deps.keywordEnrichment.enrichKeywords(
          topKeywords.map(kw => kw.label),
          language === 'fr' ? 'FR' : 'US'
        );

        const topMetricsMap = new Map(topMetrics.map(m => [m.keyword.toLowerCase(), m]));

        // Enrich top keywords
        const enrichedTop = topKeywords.map((kw): KeywordTagDTO => {
          const ranked = rankedMap.get(kw.label.toLowerCase());
          const metrics = topMetricsMap.get(kw.label.toLowerCase());

          return {
            ...kw,
            searchVolume: metrics?.searchVolume ?? ranked?.searchVolume ?? kw.searchVolume,
            difficulty: metrics?.difficulty ?? kw.difficulty,
            cpc: metrics?.cpc ?? kw.cpc,
            competition: metrics?.competition ?? kw.competition,
            lowTopOfPageBid: metrics?.lowTopOfPageBid,
            highTopOfPageBid: metrics?.highTopOfPageBid,
            monthlySearches: metrics?.monthlySearches,
            sources: [
              ...(kw.sources ?? []),
              ...(ranked ? ['serp_discovered' as const] : []),
              ...(metrics ? ['ai_plus_dataforseo' as const] : []),
            ],
            source: metrics ? 'ai_plus_dataforseo' : ranked ? 'serp_discovered' : kw.source,
            updatedAt: new Date().toISOString(),
          };
        });

        this.logger.debug?.('[Step1Streaming] Phase 1 complete', {
          enrichedCount: enrichedTop.length,
          withMetrics: enrichedTop.filter(k => k.difficulty !== undefined).length,
        });

        // Phase 2: Remaining keywords (if any)
        let enrichedRemaining: KeywordTagDTO[] = remainingKeywords;
        if (remainingKeywords.length > 0) {
          this.logger.debug?.('[Step1Streaming] Phase 2: Enriching remaining keywords...', {
            remainingCount: remainingKeywords.length,
          });
          await callbacks.onStatus(`Enriching ${remainingKeywords.length} additional keywords...`);

          const remainingMetrics = await this.deps.keywordEnrichment.enrichKeywords(
            remainingKeywords.map(kw => kw.label),
            language === 'fr' ? 'FR' : 'US'
          );

          const remainingMetricsMap = new Map(remainingMetrics.map(m => [m.keyword.toLowerCase(), m]));

          enrichedRemaining = remainingKeywords.map((kw): KeywordTagDTO => {
            const ranked = rankedMap.get(kw.label.toLowerCase());
            const metrics = remainingMetricsMap.get(kw.label.toLowerCase());

            return {
              ...kw,
              searchVolume: metrics?.searchVolume ?? ranked?.searchVolume ?? kw.searchVolume,
              difficulty: metrics?.difficulty ?? kw.difficulty,
              cpc: metrics?.cpc ?? kw.cpc,
              competition: metrics?.competition ?? kw.competition,
              lowTopOfPageBid: metrics?.lowTopOfPageBid,
              highTopOfPageBid: metrics?.highTopOfPageBid,
              monthlySearches: metrics?.monthlySearches,
              sources: [
                ...(kw.sources ?? []),
                ...(ranked ? ['serp_discovered' as const] : []),
                ...(metrics ? ['ai_plus_dataforseo' as const] : []),
              ],
              source: metrics ? 'ai_plus_dataforseo' : ranked ? 'serp_discovered' : kw.source,
              updatedAt: new Date().toISOString(),
            };
          });

          this.logger.debug?.('[Step1Streaming] Phase 2 complete', {
            enrichedCount: enrichedRemaining.length,
          });
        }

        // Combine both phases
        enrichedKeywords = [...enrichedTop, ...enrichedRemaining];

        this.logger.debug?.('[Step1Streaming] Keywords enrichment complete (2 phases)', {
          totalEnriched: enrichedKeywords.length,
          withMetrics: enrichedKeywords.filter(k => k.difficulty !== undefined).length,
          withTrends: enrichedKeywords.filter(k => k.monthlySearches !== undefined).length,
        });
      } catch (error) {
        this.logger.warn?.('[Step1Streaming] DataForSEO enrichment failed, using discovered keywords as-is', error);
        // Continue with discovered keywords without DataForSEO enrichment
      }
    } else {
      this.logger.warn?.('[Step1Streaming] keywordEnrichment port not available, skipping DataForSEO enrichment');
    }

    // 🚀 STREAMING: Envoyer les keywords complètement enrichis au frontend
    // Strategy: Top 6 keywords d'abord (fast UX), puis le reste
    this.logger.debug?.('[Step1Streaming] Starting keyword streaming...', {
      totalKeywords: enrichedKeywords.length,
    });

    const topKeywordsToStream = enrichedKeywords.slice(0, 6);
    for (const kw of topKeywordsToStream) {
      await callbacks.onKeyword(kw);
    }
    await callbacks.onStatus(`Streamed ${topKeywordsToStream.length} top keywords`);

    const remainingKeywordsToStream = enrichedKeywords.slice(6);
    for (const kw of remainingKeywordsToStream) {
      await callbacks.onKeyword(kw);
    }
    await callbacks.onStatus(`Discovered ${enrichedKeywords.length} keywords total`);

    this.logger.debug?.('[Step1Streaming] Keyword streaming complete');

    // Use enriched keywords as proposed seeds
    this.logger.debug?.('[Step1Streaming] Using enriched keywords as proposed seeds...');
    const proposedSeeds = enrichedKeywords.map(kw => kw.label);
    this.logger.debug?.(`[Step1Streaming] Prepared ${proposedSeeds.length} proposed seeds from enriched keywords`);

    // SERP competitors: disabled for this step
    const competitors: CompetitorDataDTO[] = [];

    // Save snapshot
    this.logger.debug?.('[Step1Streaming] Saving snapshot...');
    const now = new Date().toISOString();
    const id = `lead-${domain}-${Date.now()}`;
    const toNum = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
      return undefined;
    };

    const partialSnapshot = {
      id,
      domain,
      createdAt: now,
      updatedAt: now,
      version: 1,
      etag: `${id}`,
      seeds: { proposed: proposedSeeds, selected: [] },
      domainMetrics: {
        domainRank: toNum((metrics as unknown as Record<string, unknown>)?.domainRank),
        organicTraffic: toNum((metrics as unknown as Record<string, unknown>)?.organicTraffic),
        backlinksCount: toNum((metrics as unknown as Record<string, unknown>)?.backlinksCount),
        referringDomains: toNum((metrics as unknown as Record<string, unknown>)?.referringDomains),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topKeywords: (metrics as any)?.topKeywords,
      },
      businessContext,
      discoveredKeywords: enrichedKeywords, // KeywordTagDTO[] fully enriched with DataForSEO metrics
      competitors,
      keywordMetrics: [],
      trends: [],
      keywordPlan: { tags: [], recommendations: [], contentGaps: [] },
      searchIntent: { intent: 'informational', confidence: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    try {
      await this.deps.store.save({ snapshot: partialSnapshot });
      this.logger.debug?.('[Step1Streaming] Snapshot saved successfully');
    } catch (error) {
      this.logger.error?.('[Step1Streaming] Error saving snapshot:', error);
      throw error;
    }

    this.logger.log?.(`✅ Domain Identity (streaming) completed for ${domain}`);
    return partialSnapshot;
  }
}
