import { type KeywordMetricsDTO, type KeywordPlanDTO, type KeywordTagDTO } from '@casys/shared';
import {
  mapLanguageToRegion,
  normalizeKeyword,
  type SeoKeywordsMetricsCommand,
  type SeoKeywordsMetricsPort,
  type SeoKeywordsMetricsResult,
  slugifyKeyword,
} from '@casys/core';

import type {
  GoogleScrapingPort,
  GoogleTrendsPort,
  KeywordEnrichmentPort,
  KeywordPlanRepositoryPort,
  ProjectSeoSettingsPort,
  TagRepositoryPort,
} from '../../ports/out';
import { SeoDataEnrichmentService } from '../../services/seo/seo-data-enrichment.service';
import { applicationLogger as logger } from '../../utils/logger';
import { PersistKeywordPlanUseCase } from '../persist-keyword-plan.usecase';

interface SeoKeywordsMetricsDeps {
  data?: SeoDataEnrichmentService;
}

export class SeoKeywordsMetricsUseCase implements SeoKeywordsMetricsPort {
  private readonly persistKeywordPlanUseCase: PersistKeywordPlanUseCase;

  constructor(
    private readonly projectSettings: ProjectSeoSettingsPort,
    private readonly keywordEnrichment: KeywordEnrichmentPort,
    private readonly googleTrends: GoogleTrendsPort,
    private readonly googleScraping: GoogleScrapingPort,
    private readonly keywordPlanRepo: KeywordPlanRepositoryPort,
    private readonly tagRepository?: TagRepositoryPort,
    private readonly deps?: SeoKeywordsMetricsDeps
  ) {
    this.persistKeywordPlanUseCase = new PersistKeywordPlanUseCase(keywordPlanRepo);
  }

  async execute(cmd: SeoKeywordsMetricsCommand): Promise<SeoKeywordsMetricsResult> {
    const {
      tenantId,
      projectId,
      language,
      seedsOverride,
      depth = 2,
      forceRegenerate = false,
    } = cmd;

    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[SeoKeywordsMetricsUseCase] tenantId et projectId requis');
    }
    if (!language?.trim()) {
      throw new Error('[SeoKeywordsMetricsUseCase] language requis');
    }

    const settings = await this.projectSettings.getSeoProjectSettings(tenantId, projectId);
    const seedsRaw =
      seedsOverride && seedsOverride.length > 0 ? seedsOverride : (settings.seedKeywords ?? []);
    const seeds = Array.from(new Set(seedsRaw.map(s => String(s).trim()).filter(Boolean)));
    if (seeds.length === 0) {
      throw new Error('[SeoKeywordsMetricsUseCase] seedKeywords requis (override ou settings)');
    }

    const region = mapLanguageToRegion(String(language).trim());

    // Enrichissement DataForSEO (metrics + related)
    const enrichment =
      this.deps?.data ??
      new SeoDataEnrichmentService(this.keywordEnrichment, this.googleTrends, this.googleScraping);

    const errors: string[] = [];
    let relatedKeywordsCount = 0;
    let newPlansCount = 0;
    const planIds: string[] = [];

    // 1) Metrics pour tous les seeds
    const keywordMetrics: KeywordMetricsDTO[] = await enrichment.getKeywordMetrics(seeds, region);
    logger.debug('[SeoKeywordsMetricsUseCase] Metrics récupérées', {
      count: keywordMetrics.length,
    });
    const metricsMap = new Map(keywordMetrics.map(m => [normalizeKeyword(m.keyword), m]));

    // 1b) Upsert des seeds projet (source: 'seed')
    try {
      if (!cmd.dryRun && this.tagRepository && seeds.length > 0) {
        await this.tagRepository.upsertProjectSeedTags({
          tenantId,
          projectId,
          seeds: seeds.map(k => ({ label: k, slug: normalizeKeyword(k), source: 'seed' as const })),
        });
      }
    } catch (e) {
      logger.warn('[SeoKeywordsMetricsUseCase] upsertProjectSeedTags a échoué (non bloquant)', e);
      errors.push('upsertProjectSeedTags failed');
    }

    // 2) Pour chaque seed: related keywords + persistance du plan (inclure le seed avec ses métriques)

    for (const seed of seeds) {
      try {
        const seedNormalized = normalizeKeyword(seed);
        const existingPlan = await this.keywordPlanRepo.getKeywordPlanBySeed({
          tenantId,
          projectId,
          seedNormalized,
        });
        if (existingPlan && !forceRegenerate) {
          planIds.push(existingPlan.planId);
          continue;
        }

        const related = await enrichment.getRelatedKeywords([seed], region, { depth });
        relatedKeywordsCount += related.length;

        const now = new Date().toISOString();
        // Tag pour le seed lui-même avec ses métriques
        const seedMetric = metricsMap.get(seedNormalized);
        const seedTag: KeywordTagDTO = {
          label: seed,
          slug: seedNormalized,
          source: 'seed' as const,
          sources: ['seed' as const],
          createdAt: now,
          updatedAt: now,
          searchVolume: seedMetric?.searchVolume,
          difficulty: seedMetric?.difficulty,
          cpc: seedMetric?.cpc,
          competition: seedMetric?.competition,
          lowTopOfPageBid: seedMetric?.lowTopOfPageBid,
          highTopOfPageBid: seedMetric?.highTopOfPageBid,
          monthlySearches: seedMetric?.monthlySearches,
        };

        const keywordTags: KeywordTagDTO[] = [
          seedTag,
          ...related.map(kw => ({
            label: kw.keyword,
            slug: slugifyKeyword(kw.keyword),
            source: 'related_keywords' as const,
            sources: ['related_keywords' as const],
            createdAt: now,
            updatedAt: now,
            searchVolume: kw.searchVolume,
            difficulty: kw.difficulty,
            cpc: kw.cpc,
            competition: kw.competition,
            lowTopOfPageBid: kw.lowTopOfPageBid,
            highTopOfPageBid: kw.highTopOfPageBid,
            monthlySearches: kw.monthlySearches,
          })),
        ];

        const plan: KeywordPlanDTO = { tags: keywordTags };
        const planHash = `metrics-${seedNormalized}-${Date.now()}`;
        if (!cmd.dryRun) {
          const result = await this.persistKeywordPlanUseCase.execute({
            tenantId,
            projectId,
            plan,
            planHash,
            seedNormalized,
          });
          planIds.push(result.planId);
          newPlansCount += 1;
        }
      } catch (e) {
        logger.error('[SeoKeywordsMetricsUseCase] Échec traitement seed', { seed, error: e });
        errors.push(`seed:${seed}`);
      }
    }

    return {
      success: true,
      seedsCount: seeds.length,
      newPlansCount,
      relatedKeywordsCount,
      planIds,
      errors,
    } satisfies SeoKeywordsMetricsResult;
  }
}
