// Export public API
// export { GenerateArticleUseCaseImpl as GenerateArticleUseCase } from './usecases/generate-article.usecase'; // Temporairement commenté - fichier exclu du build
export * from './usecases/generate-component-from-comment.usecase';
export * from './usecases/generate-cover-image.usecase';

// SEO Keyword plan use case
export * from './usecases/index-project-seed-keywords.usecase';
export * from './usecases/suggest-article-tags.usecase';
export * from './usecases/upsert-article-tags.usecase';

// SEO Angle generation
export * from './usecases/seo-analysis/generate-angle.usecase';

// SEO Analysis
export {
  SeoAnalysisUseCase,
  type SeoAnalysisUseCaseDeps,
} from './usecases/seo-analysis/seo-analysis.usecase';

// Export container
export * from './application.container';

// Article use cases
export { SyncArticlesFromGithubUseCase } from './usecases/article-analysis/sync-articles-from-github.usecase';
export {
  createIndexArticlesUseCase,
  IndexArticlesUseCaseImpl as IndexArticlesUseCase,
} from './usecases/index-articles.usecase';
export { ListArticlesUseCaseImpl as ListArticlesUseCase } from './usecases/list-articles.usecase';
export type { ListArticlesUseCaseDeps } from './usecases/list-articles.usecase';

// Component use cases
export * from './usecases/index-components.usecase';
export type { IndexComponentsUseCaseDeps } from './usecases/index-components.usecase';
export * from './usecases/list-components.usecase';
export type { ListComponentsUseCaseDeps } from './usecases/list-components.usecase';

// Schemas
export * from './schemas/agents/outline-writer.schemas';
export * from './schemas/agents/review-article.schemas';
export * from './schemas/agents/section-writer.schemas';
export * from './schemas/agents/topic-selector.schemas';

// Ports
export * from './ports/out';

// Deps interfaces for use cases
export type { IndexArticlesUseCaseDeps } from './usecases/index-articles.usecase';
export type { LeadAnalysisUseCaseDeps } from './usecases/lead/types';

// Domain Services (déplacés de core pour éviter dépendance inversée)
export * from './services/article-indexing.service';
export * from './services/article-listing.service';
export { ArticlePublicationService } from './services/article-publication.service';
export * from './services/article-structure-search.service';
export * from './services/component-indexing.service';
export * from './services/component-listing.service';
export * from './services/component-usage.service';
export * from './services/component-vector-search.service';
export * from './services/frontmatter.service';
export * from './services/image-generator.service';
// Note: text-normalization.service reste dans @casys/core (pas de dépendances externes)
// Export types des services pour compatibilité
export type {
  ComponentIndexingGlobal,
  ComponentIndexingParams,
  ComponentIndexingProject,
  ComponentIndexingResult,
  ComponentIndexingTenant,
} from './services/component-indexing.service';
export type { GetComponentParams, GetComponentResult } from './services/component-listing.service';

// Application services & use cases (new)
export * from './mappers/graph-context.mapper';
export * from './usecases/create-editorial-brief.usecase';
export * from './usecases/generate-article/generate-article-linear.usecase';
export * from './usecases/index-article-progressively.usecase';
export * from './usecases/outline-writer.usecase';
export * from './usecases/publish-article.usecase';
// Article analysis (orchestrator + atomic use cases)
export * from './usecases/article-analysis';
export * from './usecases/discover-topics.usecase';
export * from './usecases/manage-topic-clusters.usecase';

// Outline Writer (POML builder + mapper)
export * from './mappers/outline-writer.mapper';
export * from './prompts/outline-writer.prompt';

// Section Writer (POML builder + mapper)
export * from './mappers/section-writer.mapper';
export * from './prompts/section-writer.prompt';
// Section Summarizer (POML builder)
export * from './prompts/section-summarizer.prompt';

// Topic Selector (Use case + POML builder + mapper)
export * from './mappers/topic-selector.mapper';
export * from './prompts/topic-selector.prompt';
export * from './usecases/select-topic.usecase';

// Angle Selection (POML builder + mapper)
export * from './mappers/angle-selection.mapper';
export * from './prompts/angle-selection.prompt';

// Editorial Brief (POML builder + mapper)
export * from './mappers/editorial-brief.mapper';
export * from './prompts/editorial-brief.prompt';

// SEO Brief Data mapper (V3 domain → DTO)
export * from './mappers/seo-brief-data.mapper';

// Agents
// BusinessContextAnalysisAgent is implemented in infrastructure and must NOT be re-exported here.

// Generic/provider mappers for locales and domain analysis
export * from './mappers/dataforseo-locale.mapper';
export * from './mappers/domain-analysis.mapper';
export * from './mappers/search-locale.mapper';

// Lead Analysis
export * from './usecases/lead';

// RSS Discovery
export * from './usecases/topics/discover-rss-feeds.usecase';

// RSS Subscriptions
export * from './usecases/rss/subscribe-to-feed.usecase';
export * from './usecases/rss/list-subscriptions.usecase';
export * from './usecases/rss/manage-subscription.usecase';
