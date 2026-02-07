import { z } from 'zod';

import type {
  AnalyzeExistingArticleDeps,
  GenerateArticleLinearUseCaseDeps,
  IndexArticlesUseCaseDeps,
  IndexComponentsUseCaseDeps,
  LeadAnalysisUseCaseDeps,
  ListArticlesUseCaseDeps,
  ListComponentsUseCaseDeps,
  SeoAnalysisUseCaseDeps,
} from '@casys/application';

/**
 * ✅ Schemas Zod réutilisant les interfaces Deps des use cases
 * Single source of truth + Validation runtime
 * Pattern: helpers type-safe pour éliminer les any
 */

// Helper type-safe pour vérifier la présence d'une méthode sur un port
function hasMethod(obj: unknown, methodName: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const port = obj as Record<string, unknown>;
  return typeof port[methodName] === 'function';
}

// ✅ Schema SEO Analysis - Réutilise SeoAnalysisUseCaseDeps
export const SeoAnalysisDepsSchema = z.custom<Partial<SeoAnalysisUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    // Valider les deps obligatoires avec helper type-safe et les VRAIS noms de méthodes
    return (
      (!obj.aiTextModel || hasMethod(obj.aiTextModel, 'generate')) &&
      (!obj.promptTemplate || hasMethod(obj.promptTemplate, 'loadTemplate')) &&
      (!obj.googleScraping || hasMethod(obj.googleScraping, 'scrapeTopResults')) &&
      (!obj.googleTrends || hasMethod(obj.googleTrends, 'getTrends')) &&
      (!obj.keywordEnrichment || hasMethod(obj.keywordEnrichment, 'enrichKeywords')) &&
      (!obj.domainAnalysis || hasMethod(obj.domainAnalysis, 'analyzeDomains')) &&
      (!obj.projectSettings || hasMethod(obj.projectSettings, 'getSeoProjectSettings')) &&
      (!obj.configReader || hasMethod(obj.configReader, 'getProjectConfig')) &&
      (!obj.keywordPlanRepo || hasMethod(obj.keywordPlanRepo, 'findByKeyword'))
    );
  },
  { message: 'Invalid SeoAnalysisUseCaseDeps' }
);

// Schema Articles - Réutilise les interfaces
export const ListArticlesDepsSchema = z.custom<Partial<ListArticlesUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    return !obj.articleStructureRepository || hasMethod(obj.articleStructureRepository, 'findById');
  },
  { message: 'Invalid ListArticlesUseCaseDeps' }
);

export const IndexArticlesDepsSchema = z.custom<Partial<IndexArticlesUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    return !obj.articleStructureStore || hasMethod(obj.articleStructureStore, 'indexArticleStructure');
  },
  { message: 'Invalid IndexArticlesUseCaseDeps' }
);

// Schema Components - Réutilise les interfaces
export const IndexComponentsDepsSchema = z.custom<Partial<IndexComponentsUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    return (
      (!obj.componentUsageStore || hasMethod(obj.componentUsageStore, 'createComponentUsages')) &&
      (!obj.componentVectorStore || hasMethod(obj.componentVectorStore, 'indexComponent'))
    );
  },
  { message: 'Invalid IndexComponentsUseCaseDeps' }
);

export const ListComponentsDepsSchema = z.custom<Partial<ListComponentsUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    return !obj.componentListing || hasMethod(obj.componentListing, 'getAllComponents');
  },
  { message: 'Invalid ListComponentsUseCaseDeps' }
);

// Schema Lead Analysis - Réutilise LeadAnalysisUseCaseDeps
export const LeadAnalysisDepsSchema = z.custom<Partial<LeadAnalysisUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    return (
      (!obj.store || hasMethod(obj.store, 'save')) &&
      (!obj.businessContextAgent || hasMethod(obj.businessContextAgent, 'analyze')) &&
      (!obj.domainAnalysis || hasMethod(obj.domainAnalysis, 'analyzeDomains')) &&
      (!obj.siteKeywords || hasMethod(obj.siteKeywords, 'getKeywordsForSite')) &&
      (!obj.keywordEnrichment || hasMethod(obj.keywordEnrichment, 'enrichKeywords')) &&
      (!obj.googleTrends || hasMethod(obj.googleTrends, 'getTrends')) &&
      (!obj.googleScraping || hasMethod(obj.googleScraping, 'scrapeTopResults')) &&
      (!obj.promptTemplate || hasMethod(obj.promptTemplate, 'loadTemplate')) &&
      (!obj.seoAnalysisAgent || hasMethod(obj.seoAnalysisAgent, 'invoke')) &&
      (!obj.keywordDiscovery || hasMethod(obj.keywordDiscovery, 'discoverKeywords')) &&
      (!obj.pageScraper || hasMethod(obj.pageScraper, 'scrapePages'))
    );
  },
  { message: 'Invalid LeadAnalysisUseCaseDeps' }
);

// Schema GenerateArticleLinear - Réutilise GenerateArticleLinearUseCaseDeps
export const GenerateArticleLinearDepsSchema = z.custom<Partial<GenerateArticleLinearUseCaseDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    // Valider les deps critiques avec helper type-safe
    return (
      (!obj.topicDiscovery || hasMethod(obj.topicDiscovery, 'discoverCandidates')) &&
      (!obj.selectTopicUseCase || hasMethod(obj.selectTopicUseCase, 'execute')) &&
      (!obj.seoAnalysisUseCase || hasMethod(obj.seoAnalysisUseCase, 'execute')) &&
      (!obj.contentFetcher || hasMethod(obj.contentFetcher, 'fetchFullContent')) &&
      (!obj.configReader || hasMethod(obj.configReader, 'getProjectConfig')) &&
      (!obj.projectSettings || hasMethod(obj.projectSettings, 'getSeoProjectSettings')) &&
      (!obj.generateAngleUseCase || hasMethod(obj.generateAngleUseCase, 'execute')) &&
      (!obj.indexArticleUseCase || hasMethod(obj.indexArticleUseCase, 'indexOutline'))
    );
  },
  { message: 'Invalid GenerateArticleLinearUseCaseDeps' }
);

// Schema AnalyzeExistingArticle - Réutilise AnalyzeExistingArticleDeps
export const AnalyzeExistingArticleDepsSchema = z.custom<Partial<AnalyzeExistingArticleDeps>>(
  val => {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    // Valider les deps critiques avec helper type-safe
    return (
      (!obj.articleStore || hasMethod(obj.articleStore, 'indexOutlineProgressively')) &&
      (!obj.articleReader || hasMethod(obj.articleReader, 'findById')) &&
      (!obj.githubRepository || hasMethod(obj.githubRepository, 'findById')) &&
      (!obj.projectSettings || hasMethod(obj.projectSettings, 'getSeoProjectSettings')) &&
      (!obj.articleParser || hasMethod(obj.articleParser, 'parseArticleStructure')) &&
      (!obj.seoAnalysisUseCase || hasMethod(obj.seoAnalysisUseCase, 'execute')) &&
      (!obj.seoKeywordsMetricsUseCase || hasMethod(obj.seoKeywordsMetricsUseCase, 'execute')) &&
      (!obj.articleKeywordsMetricsUseCase || hasMethod(obj.articleKeywordsMetricsUseCase, 'execute')) &&
      (!obj.keywordPlanRepo || hasMethod(obj.keywordPlanRepo, 'findByKeyword')) &&
      (!obj.tagRepository || hasMethod(obj.tagRepository, 'findByLabel')) &&
      (!obj.topicRepository || hasMethod(obj.topicRepository, 'findById')) &&
      (!obj.topicRelations || hasMethod(obj.topicRelations, 'linkTopicToArticle')) &&
      (!obj.ensureTenantProject || hasMethod(obj.ensureTenantProject, 'execute')) &&
      (!obj.seoBriefStore || hasMethod(obj.seoBriefStore, 'findById')) &&
      (!obj.topicDiscovery || hasMethod(obj.topicDiscovery, 'discoverCandidates')) &&
      (!obj.syncArticlesFromGithub || hasMethod(obj.syncArticlesFromGithub, 'execute')) &&
      (!obj.editorialAngleAgent || hasMethod(obj.editorialAngleAgent, 'generateAngle')) &&
      (!obj.editorialBriefStore || hasMethod(obj.editorialBriefStore, 'save')) &&
      (!obj.indexArticleFromRepo || hasMethod(obj.indexArticleFromRepo, 'execute'))
    );
  },
  { message: 'Invalid AnalyzeExistingArticleDeps' }
);

// Types inférés (réutilisent directement les interfaces)
export type SeoAnalysisDeps = z.infer<typeof SeoAnalysisDepsSchema>;
export type ListArticlesDeps = z.infer<typeof ListArticlesDepsSchema>;
export type IndexArticlesDeps = z.infer<typeof IndexArticlesDepsSchema>;
export type IndexComponentsDeps = z.infer<typeof IndexComponentsDepsSchema>;
export type ListComponentsDeps = z.infer<typeof ListComponentsDepsSchema>;
export type LeadAnalysisDeps = z.infer<typeof LeadAnalysisDepsSchema>;
export type GenerateArticleLinearDeps = z.infer<typeof GenerateArticleLinearDepsSchema>;
// Note: AnalyzeExistingArticleDeps type is imported from @casys/application, no need to re-export
