// Value Objects
export * from './value-objects/domain.vo';

// Entities
export * from './entities/article-structure.entity';
export * from './aggregates/editorial-brief.aggregate';
export * from './entities/lead-snapshot';
export * from './entities/ontology.entity';
export * from './entities/project.entity';
export * from './entities/tenant.entity';
export * from './entities/topic.entity';

// Value Objects
export { createKeywordTag } from './factories/keyword-tag.factory';
export type {
  BlogRecommendations,
  CompetitorData,
  KeywordPlan,
  KeywordTag,
  KeywordTagSearchResult,
  ProjectContext,
  SearchIntentData,
  SeoBriefData,
  SeoBriefDataV3,
  SearchIntent,
  ContentStrategy,
  CompetitiveAnalysis,
  SeoStrategy,
  TagSource,
  TopicCluster,
  TrendData,
} from './types/seo.types';
export { toV2SeoBriefData, toV3SeoBriefData } from './types/seo.types';
export * from './value-objects/content-gap.value';
export * from './value-objects/editorial-angle.value';
export * from './value-objects/extracted-keyword.value';
export * from './value-objects/keyword.value';
export { buildKeywordTagId } from './value-objects/keyword-tag-id.value';
export type { PageCandidate } from './value-objects/page-candidate.value';
export * from './value-objects/project-seo-settings.value';
export * from './value-objects/seo-brief.value';

// Types
export * from './types/analyze-existing-article.types';
export * from './types/angle-selection.types';
export * from './types/article-generation.workflow.types';
export * from './types/domain-position-insights.types';
export * from './types/editorial-brief.types';
export * from './types/index-article-from-repo.types';
export * from './types/keyword-extraction.types';
export * from './types/keyword-indexing.types';
export * from './types/link-internal-references.types';
export * from './types/link-sections-to-topics.types';
export * from './types/link-topics-to-keywordtags.types';
export * from './types/outline-writer.types';
export * from './types/rss-feed-discovery.types';
export * from './types/rss-subscription.types';
export * from './types/seo-analysis.types';
export * from './types/topic-building.types';
export * from './types/topic-selection.types';
// export * from './entities/editorial-line.value'; // removed
// export * from './entities/keyword-plan.aggregate'; // removed

// Types des services du domaine
export type {
  ComponentDefinition,
  ComponentIdentifiers,
  ComponentListingArticle,
  ComponentListingGlobal,
  ComponentListingProject,
  ComponentListingTenant,
  ComponentOperationResult,
  ComponentOperationWithIds,
  ComponentSearchResult,
  ComponentUsage,
  PropDefinition,
} from './entities/component.entity';
// Types des services déplacés vers @casys/application:
// - ComponentIndexingGlobal, ComponentIndexingParams, etc. (depuis ComponentIndexingService)
// - GetComponentParams, GetComponentResult (depuis ComponentListingService)
// Importer depuis @casys/application si nécessaire

// Services restant dans core (aucune dépendance externe)
export * from './services/text-normalization.service';
export * from './services/topic-from-urls.builder';

// Ports IN (driving) exposés côté core pour les adaptateurs entrants
export * from './ports/in/analyze-existing-article.port';
export * from './ports/in/create-editorial-brief.port';
export * from './ports/in/generate-article.port';
export * from './ports/in/index-article-from-repo.port';
export * from './ports/in/link-internal-references.port';
export * from './ports/in/link-sections-to-topics.port';
export * from './ports/in/link-topics-to-keywordtags.port';
export * from './ports/in/outline-writer.port';
export * from './ports/in/seo-analysis.port';
export * from './ports/in/seo-keywords-metrics.port';
export * from './ports/in/article-keywords-metrics.port';
export * from './ports/in/write-sections.port';
export * from './ports/in/manage-topic-clusters.port';

// RSS Subscriptions
export * from './ports/in/subscribe-to-feed.port';
export * from './ports/in/list-subscriptions.port';
export * from './ports/in/manage-subscription.port';
