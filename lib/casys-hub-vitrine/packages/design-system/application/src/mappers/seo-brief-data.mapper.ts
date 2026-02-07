import type {
  BlogRecommendationsDTO,
  CompetitiveAnalysisDTO,
  ContentGapDTO,
  ContentStrategyDTO,
  KeywordTagDTO,
  SearchIntentDTO,
  SeoBriefDataDTO,
  TopicClusterDTO,
  SeoAnalysisAgentOutputDTO,
} from '@casys/shared';
import type {
  BlogRecommendations,
  CompetitiveAnalysis,
  ContentGap,
  ContentStrategy,
  KeywordTag,
  SearchIntent,
  SeoBriefDataV3,
  TopicCluster,
} from '@casys/core';
import { slugifyKeyword } from '@casys/core';
import {
  mapCompetitiveAnalysisDTOToCore,
  mapContentStrategyDTOToCore,
  mapKeywordTagDTOToCore,
  mapSearchIntentDTOToCore,
} from './seo-core.mapper';

/**
 * Mapper: KeywordTag (core domain) → KeywordTagDTO (shared DTO)
 *
 * slug: Généré depuis label si absent (utile pour déduplication)
 * source: Optionnel, attribué en cours de route
 */
export function mapKeywordTagToDTO(tag: KeywordTag): KeywordTagDTO {
  return {
    label: tag.label,
    slug: tag.slug ?? slugifyKeyword(tag.label), // Générer si absent pour dédup
    source: tag.source, // Optionnel, sera attribué en cours de route
    sources: tag.sources,
    weight: tag.weight,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
    priority: tag.priority,
    clusterType: tag.clusterType,
    searchVolume: tag.searchVolume,
    difficulty: tag.difficulty,
    cpc: tag.cpc,
    competition: tag.competition,
    lowTopOfPageBid: tag.lowTopOfPageBid,
    highTopOfPageBid: tag.highTopOfPageBid,
    monthlySearches: tag.monthlySearches,
    aiEnrichment: tag.aiEnrichment,
  };
}

/**
 * Mapper: ContentGap (core domain) → ContentGapDTO (shared DTO)
 * V3: Core et DTO utilisent tous deux KeywordTag/KeywordTagDTO
 */
export function mapContentGapToDTO(gap: ContentGap): ContentGapDTO {
  return {
    keyword: mapKeywordTagToDTO(gap.keyword),
    gap: gap.gap,
    reason: gap.reason,
    details: gap.details,
    type: gap.type,
    opportunityScore: gap.opportunityScore,
  };
}

/**
 * Mapper: TopicCluster (core domain) → TopicClusterDTO (shared DTO)
 */
export function mapTopicClusterToDTO(cluster: TopicCluster): TopicClusterDTO {
  return {
    pillarTag: cluster.pillarTag ? mapKeywordTagToDTO(cluster.pillarTag) : undefined!,
    satelliteTags: (cluster.satelliteTags ?? []).map(mapKeywordTagToDTO),
  };
}

/**
 * Mapper: BlogRecommendations (core domain) → BlogRecommendationsDTO (shared DTO)
 */
export function mapBlogRecommendationsToDTO(
  reco: BlogRecommendations
): BlogRecommendationsDTO {
  return {
    seo: reco.seo,
    editorial: reco.editorial,
    technical: reco.technical,
  };
}

/**
 * Mapper: SearchIntent (core domain) → SearchIntentDTO (shared DTO)
 */
export function mapSearchIntentToDTO(intent: SearchIntent): SearchIntentDTO {
  // contentRecommendations peut être string[] | ContentRecommendations | undefined
  // On garde tel quel (le DTO accepte les deux types)
  const contentRecs = typeof intent.contentRecommendations === 'object' && !Array.isArray(intent.contentRecommendations)
    ? intent.contentRecommendations
    : undefined;

  return {
    intent: intent.intent,
    confidence: intent.confidence,
    supportingQueries: intent.supportingQueries,
    contentRecommendations: contentRecs,
  };
}

/**
 * Mapper: ContentStrategy (core domain) → ContentStrategyDTO (shared DTO)
 */
export function mapContentStrategyToDTO(strategy: ContentStrategy): ContentStrategyDTO {
  return {
    topicClusters: strategy.topicClusters?.map(mapTopicClusterToDTO),
    recommendations: strategy.recommendations
      ? mapBlogRecommendationsToDTO(strategy.recommendations)
      : undefined,
  };
}

/**
 * Mapper: CompetitiveAnalysis (core domain) → CompetitiveAnalysisDTO (shared DTO)
 * Note: Core has competitorTitles: string[], DTO has competitors: CompetitorDataDTO[]
 */
export function mapCompetitiveAnalysisToDTO(
  analysis: CompetitiveAnalysis
): CompetitiveAnalysisDTO {
  // Convert competitorTitles to CompetitorDataDTO[]
  const competitors = (analysis.competitorTitles ?? []).map(title => ({
    title,
    description: undefined,
    url: undefined,
    keywords: undefined,
  }));

  return {
    contentGaps: analysis.contentGaps?.map(mapContentGapToDTO),
    competitors,
  };
}

/**
 * Mapper principal: SeoBriefDataV3 (core domain) → SeoBriefDataDTO (shared DTO)
 *
 * Convertit la structure de domaine complète vers le DTO partagé.
 * Utilisé par les mappers qui préparent les données pour les agents/templates.
 */
export function toSeoBriefDataDTO(v3: SeoBriefDataV3): SeoBriefDataDTO {
  return {
    keywordTags: v3.keywordTags.map(mapKeywordTagToDTO),
    searchIntent: mapSearchIntentToDTO(v3.searchIntent),
    contentStrategy: mapContentStrategyToDTO(v3.contentStrategy),
    competitiveAnalysis: mapCompetitiveAnalysisToDTO(v3.competitiveAnalysis),
  };
}

/**
 * Construit un SeoBriefDataV3 (core) à partir du résultat d'agent SEO
 * et des tags enrichis (KeywordTagDTO) prêts à être persistés.
 */
export function buildSeoBriefDataV3(
  enrichmentResult: SeoAnalysisAgentOutputDTO,
  enrichedTags: KeywordTagDTO[]
): SeoBriefDataV3 {
  return {
    keywordTags: enrichedTags.map(mapKeywordTagDTOToCore),
    searchIntent: mapSearchIntentDTOToCore(enrichmentResult.searchIntent),
    contentStrategy: mapContentStrategyDTOToCore(enrichmentResult.contentStrategy),
    competitiveAnalysis: mapCompetitiveAnalysisDTOToCore(enrichmentResult.competitiveAnalysis),
  };
}
