/**
 * Factories pour les use cases API
 * Feature gating : retournent undefined si dépendances manquantes
 */

export {
  buildAnalyzeExistingArticleUseCase,
  buildIndexArticlesUseCase,
  buildListArticlesUseCase,
} from './article-analysis';
export { buildIndexComponentsUseCase, buildListComponentsUseCase } from './components';
export { buildGenerateArticleLinearUseCase } from './generation';
export { buildLeadAnalysisUseCase } from './leads';
export { buildDiscoverRssFeedsUseCase } from './rss';
export { buildSeoAnalysisUseCase } from './seo';
