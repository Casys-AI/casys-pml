import {
  type ArticleStructure,
  type CompetitorData,
  type KeywordTag,
  type ProjectContext,
  type SearchIntentData,
  type SectionNode,
  type SeoBriefData,
  type SeoBriefDataV3,
  type SeoStrategy,
  type TrendData,
} from '@casys/core';

import { createLogger } from '../../utils/logger';
import { toSlug } from './keyword.util';

/**
 * Service de domaine pour l'analyse SEO
 * Responsabilité : logique métier (analyse concurrents, trends, construction stratégie)
 * L'orchestration est dans UseCase, l'IA dans Agent
 */
export class SeoStrategyService {
  private readonly logger = createLogger('SeoStrategyService');

  /**
   * Construit une stratégie SEO complète avec données déjà collectées par le use case
   * Logique métier pure: identification des gaps, assemblage de la stratégie
   */
  async buildSeoStrategy(
    keywordPlan: SeoStrategy['keywordPlan'],
    searchIntent: SearchIntentData,
    competitors: CompetitorData[],
    trends: TrendData[],
    opts?: { language?: string; projectContext?: ProjectContext }
  ): Promise<SeoStrategy> {
    try {
      const enrichedKeywords = keywordPlan.tags.map(tag => tag.label);
      this.logger.debug(`Building SEO strategy for ${enrichedKeywords.length} enriched keywords`, {
        language: opts?.language,
        projectContext: opts?.projectContext,
      });

      // Construction de la stratégie finale (contentGaps maintenant dans SearchIntent)
      const strategy: SeoStrategy = {
        keywordPlan,
        searchIntent,
        competitors,
        trends,
        contentType: opts?.projectContext?.contentType,
      };

      this.logger.debug('SEO strategy built successfully');
      return Promise.resolve(strategy);
    } catch (error) {
      this.logger.error('SEO strategy building failed', error);
      if (error instanceof Error) {
        throw new Error(`SEO strategy building failed: ${error.message}`);
      }
      throw new Error('SEO strategy building failed: Unknown error');
    }
  }

  /**
   * Construit une SeoStrategy à partir d'un SeoBriefDataV3 existant (projet)
   * Compatible avec v2 legacy via duck-typing (briefAny)
   */
  fromExistingBrief(brief: SeoBriefDataV3 | SeoBriefData): SeoStrategy {
    const tags = this.sanitizeKeywordTags(brief.keywordTags ?? []);

    const intents: ReadonlyArray<SeoStrategy['searchIntent']['intent']> = [
      'informational',
      'commercial',
      'navigational',
      'transactional',
    ];
    const raw = String(brief.searchIntent ?? 'informational');
    const intent: SeoStrategy['searchIntent']['intent'] = (intents as readonly string[]).includes(raw)
      ? (raw as SeoStrategy['searchIntent']['intent'])
      : 'informational';

    // Support both v2 (flat) and v3 (nested objects) structures
    const briefAny = brief as any;
    const topicClusters = briefAny?.contentStrategy?.topicClusters || briefAny?.topicClusters;
    const recommendations = briefAny?.contentStrategy?.recommendations || briefAny?.recommendations;
    const contentGaps = briefAny?.competitiveAnalysis?.contentGaps || briefAny?.contentGaps;
    const userQuestions = briefAny?.searchIntent?.supportingQueries || briefAny?.userQuestions;
    const contentRecommendations = briefAny?.searchIntent?.contentRecommendations || briefAny?.contentRecommendations;
    
    const strategy: SeoStrategy = {
      keywordPlan: { 
        tags,
        // Blog strategy v2+v3 compatible
        topicClusters,
        recommendations,
        contentGaps: undefined, // contentGaps are in searchIntent (legacy)
      },
      searchIntent: {
        intent,
        confidence: briefAny?.searchIntent?.confidence ?? brief.searchConfidence ?? 0.5,
        supportingQueries: userQuestions ?? [],
        contentRecommendations: contentRecommendations ?? [],
        contentGaps: contentGaps ?? [],
        seoRecommendations: recommendations?.seo ?? brief.seoRecommendations ?? [],
      },
    };

    return strategy;
  }

  /**
   * Construit un SeoBriefDataV3 à partir d'une SeoStrategy
   * Note: Pour TopicSelector qui accepte v3
   */
  buildSeoBriefFromStrategy(strategy: SeoStrategy): SeoBriefDataV3 {
    // Extract from KeywordPlan (v2+v3 compatible)
    const topicClusters = (strategy.keywordPlan as any)?.topicClusters || (strategy.searchIntent as any)?.topicClusters;
    const recommendations = (strategy.keywordPlan as any)?.recommendations || (strategy.searchIntent as any)?.recommendations;

    return {
      keywordTags: this.sanitizeKeywordTags(strategy.keywordPlan.tags ?? []),
      searchIntent: {
        intent: strategy.searchIntent.intent,
        confidence: strategy.searchIntent.confidence ?? 0,
        supportingQueries: strategy.searchIntent.supportingQueries ?? [],
        contentRecommendations: strategy.searchIntent.contentRecommendations,
      },
      contentStrategy: {
        topicClusters,
        recommendations: recommendations ?? {
          seo: strategy.searchIntent.seoRecommendations ?? [],
          editorial: [],
          technical: [],
        },
      },
      competitiveAnalysis: {
        contentGaps: strategy.searchIntent.contentGaps ?? [],
        competitorTitles: [],
      },
    };
  }

  /**
   * Normalise/épure les KeywordTags (slug obligatoire, label trim)
   */
  private sanitizeKeywordTags(tags: KeywordTag[]): KeywordTag[] {
    return (tags ?? [])
      .map(t => ({
        label: String(t.label ?? '').trim(),
        slug: t.slug?.trim() ? t.slug : toSlug(String(t.label ?? '')),
        source: t.source,
        weight: t.weight,
        // Blog strategy v2
        priority: t.priority,
        clusterType: t.clusterType,
        // SEO metrics
        searchVolume: t.searchVolume,
        difficulty: t.difficulty,
        cpc: t.cpc,
        competition: t.competition,
        lowTopOfPageBid: t.lowTopOfPageBid,
        highTopOfPageBid: t.highTopOfPageBid,
        monthlySearches: t.monthlySearches,
      }))
      .filter(t => t.label.length > 0 && t.slug.length > 0);
  }

  /**
   * TODO: Post-évaluation SEO de l'article généré (non implémentée)
   * Point d'entrée domaine invoqué par le use case après génération complète.
   * Ne jette pas d'erreur et n'altère pas le flux métier tant que non implémenté.
   */
  public async evaluateFinalArticle(
    article: ArticleStructure['article'],
    sections: SectionNode[],
    opts?: { language?: string }
  ): Promise<void> {
    try {
      this.logger.warn?.('[TODO] SeoAnalysisService.evaluateFinalArticle non implémentée');
      return Promise.resolve();
      // À venir: calcul score SEO, recommandations meta/keywords/description, lisibilité, etc.
      this.logger.debug?.('evaluateFinalArticle (stub)', {
        language: opts?.language,
        sections: sections?.length ?? 0,
        hasContent: !!article?.content?.length,
      });
    } catch (e) {
      // Non bloquant: ignorer toute erreur tant que non implémenté
      this.logger.warn?.('Erreur evaluateFinalArticle (ignorée)', e);
    }
  }
}
