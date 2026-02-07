/**
 * Article Analysis Use Cases
 * Modular structure: orchestrator + atomic use cases
 *
 * Main orchestrator: AnalyzeExistingArticleUseCase
 * Atomic use cases: can be used independently or composed
 */

// Main orchestrator
export { AnalyzeExistingArticleUseCase } from './analyze-existing-article.usecase';

// Atomic use cases
export { LinkInternalReferencesUseCase } from './link-internal-references.usecase';
export { LinkSectionsToTopicsUseCase } from './link-sections-topics.usecase';
export { LinkTopicsToKeywordTagsUseCase } from './link-topics-to-keywordtags.usecase';

// Types
export type * from './analyze-existing-article.usecase';
export * from './types';

// Helpers
export * from './helpers';
