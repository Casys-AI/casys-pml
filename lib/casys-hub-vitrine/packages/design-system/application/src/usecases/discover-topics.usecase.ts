import type {
  KeywordTag,
  SeoStrategy,
  TopicCandidate,
  TopicFetchQuery,
  TrendData,
} from '@casys/core';

import type { TopicDiscoveryPort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

export interface DiscoverTopicsInput {
  seoStrategy: SeoStrategy;
  tenantId: string;
  projectId: string;
  language: string;
}

/**
 * Use case atomique: Découverte de Topics candidats à partir d'une stratégie SEO
 * - Prépare les mots-clés courts pour les News APIs (tags + trends)
 * - Récupère les queries complètes (supportingQueries) pour le Web Agent
 * - Délègue la découverte au TopicDiscoveryPort
 */
export class DiscoverTopicsUseCase {
  constructor(private readonly topicDiscovery: TopicDiscoveryPort) {}

  async execute(cmd: DiscoverTopicsInput): Promise<TopicCandidate[]> {
    const { seoStrategy, tenantId, projectId, language } = cmd;

    logger.log('🔍 Découverte de sujets candidats à partir des keywords SEO...');

    // Extraire les keywords SEO courts (labels des tags) pour les News APIs
    const seoKeywords: string[] = Array.isArray(seoStrategy?.keywordPlan?.tags)
      ? seoStrategy.keywordPlan.tags
          .map((tag: KeywordTag) => String(tag.label ?? '').trim())
          .filter(Boolean)
      : [];

    // Extraire aussi les keywords des trends
    const trendKeywords: string[] = Array.isArray(seoStrategy?.trends)
      ? seoStrategy.trends.map((t: TrendData) => String(t.keyword ?? '').trim()).filter(Boolean)
      : [];

    // Fusionner et dédupliquer les keywords courts
    const newsKeywords = Array.from(new Set([...seoKeywords, ...trendKeywords]));

    // Extraire les questions complètes (supportingQueries) pour Tavily/WebAgent
    const supportingQueries: string[] = Array.isArray(seoStrategy?.searchIntent?.supportingQueries)
      ? seoStrategy.searchIntent.supportingQueries
          .map((q: string) => String(q).trim())
          .filter(Boolean)
      : [];

    if (newsKeywords.length === 0) {
      throw new Error(`Aucun keyword SEO disponible depuis l'analyse (keywordPlan.tags vide)`);
    }

    logger.debug('Topic discovery keywords', {
      newsKeywordsCount: newsKeywords.length,
      newsKeywordsSample: newsKeywords.slice(0, 5),
      webQueriesCount: supportingQueries.length,
      webQueriesSample: supportingQueries,
    });

    const fetchQuery: TopicFetchQuery & { tenantId: string; projectId: string } = {
      seoKeywords: newsKeywords,
      supportingQueries: supportingQueries.length > 0 ? supportingQueries : undefined,
      language,
      tenantId,
      projectId,
    };

    const topicCandidates = await this.topicDiscovery.discoverCandidates(fetchQuery);

    logger.log(
      `✅ ${Array.isArray(topicCandidates) ? topicCandidates.length : 0} sujets candidats découverts`
    );

    return topicCandidates;
  }
}
