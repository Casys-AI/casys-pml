import { type KeywordMetricsDTO } from '@casys/shared';
import {
  type ArticleKeywordsMetricsCommand,
  type ArticleKeywordsMetricsPort,
  type ArticleKeywordsMetricsResult,
  mapLanguageToRegion,
  slugifyKeyword,
} from '@casys/core';

import type {
  GoogleScrapingPort,
  GoogleTrendsPort,
  KeywordEnrichmentPort,
  ProjectSeoSettingsPort,
  TagRepositoryPort,
} from '../../ports/out';
import { SeoDataEnrichmentService } from '../../services/seo/seo-data-enrichment.service';
import { applicationLogger as logger } from '../../utils/logger';

export class ArticleKeywordsMetricsUseCase implements ArticleKeywordsMetricsPort {
  constructor(
    private readonly projectSettings: ProjectSeoSettingsPort,
    private readonly keywordEnrichment: KeywordEnrichmentPort,
    private readonly googleTrends: GoogleTrendsPort,
    private readonly googleScraping: GoogleScrapingPort,
    private readonly tagRepository: TagRepositoryPort
  ) {}

  async execute(cmd: ArticleKeywordsMetricsCommand): Promise<ArticleKeywordsMetricsResult> {
    const { tenantId, projectId, language, labels, articleId, dryRun } = cmd;

    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[ArticleKeywordsMetricsUseCase] tenantId et projectId requis');
    }
    if (!language?.trim()) {
      throw new Error('[ArticleKeywordsMetricsUseCase] language requis');
    }
    if (!Array.isArray(labels) || labels.length === 0) {
      return { success: true, enrichedCount: 0, errors: [] };
    }

    // Région en fonction de la langue
    const region = mapLanguageToRegion(String(language).trim());

    // Enrichissement DataForSEO: metrics pour les labels d'article
    const enrichment = new SeoDataEnrichmentService(
      this.keywordEnrichment,
      this.googleTrends,
      this.googleScraping
    );

    let enrichedCount = 0;
    const errors: string[] = [];

    try {
      const metrics: KeywordMetricsDTO[] = await enrichment.getKeywordMetrics(labels, region);

      // Mapper vers KeywordTag (avec métriques) et upsert côté projet + lier à l'article
      const tags = metrics.map(m => ({
        label: m.keyword,
        slug: slugifyKeyword(m.keyword),
        source: 'article' as const,
        searchVolume: m.searchVolume,
        difficulty: m.difficulty,
        cpc: m.cpc,
        competition: m.competition,
        lowTopOfPageBid: m.lowTopOfPageBid,
        highTopOfPageBid: m.highTopOfPageBid,
        monthlySearches: m.monthlySearches,
      }));

      if (!dryRun) {
        await this.tagRepository.upsertArticleTags({
          tenantId,
          projectId,
          articleId: articleId ?? 'unknown',
          tags,
          linkToKeywordPlan: true,
        });
      }
      enrichedCount = tags.length;
    } catch (e) {
      logger.warn('[ArticleKeywordsMetricsUseCase] Enrichissement/Upsert a échoué', e);
      errors.push('enrichment_upsert_failed');
    }

    return { success: true, enrichedCount, errors };
  }
}
