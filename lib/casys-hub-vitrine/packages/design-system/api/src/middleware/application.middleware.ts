// Core in-ports and services
import { createMiddleware } from 'hono/factory';

import type {
  AITextModelPort,
  // Aggregated map
  ApplicationServiceMap,
  ArticleContentFetcherPort,
  // Services & Ports
  ArticlePublicationService,
  ArticleStructureRepositoryPort,
  ArticleStructureSearchPort,
  ArticleStructureStorePort,
  ComponentCatalogPort,
  ComponentSearchPort,
  ComponentUsageStorePort,
  ComponentVectorStorePort,
  GoogleScrapingPort,
  GoogleTrendsPort,
  ImageGeneratorPort,
  ImageUploaderPort,
  KeywordPlanRepositoryPort,
  OutlineWriterGenerateOutlinePort,
  PromptTemplatePort,
  SectionSummarizerSummarizeSectionPort,
  SectionWriterWriteSectionPort,
  TagRepositoryPort,
  TopicDiscoveryPort,
  TopicRelationsPort,
  TopicRepositoryPort,
  UserProjectConfigPort,
} from '@casys/application';

import { ctxSet, ctxSetUnsafe } from '../utils/hono-context';
import { appLogger, type Logger } from '../utils/logger';

// --- Diagnostic guard (log on change, then disable when analyze use case is available) ---
let lastDiagSnapshot: string | null = null;
let diagDisabled = false;

/**
 * Middleware Hono pour injecter les services Application
 * Use cases et agents LangChain
 */

// Types pour les services injectés dans le contexte Hono
export interface ApplicationVariables {
  // Use cases/agents exposés par le container application (opaques ici)
  topicSelectorAgent?: unknown;
  generateArticleLinearUseCase?: ApplicationServiceMap['generateArticleLinearUseCase'];
  indexComponentsUseCase?: ApplicationServiceMap['indexComponentsUseCase'];
  indexArticlesUseCase?: ApplicationServiceMap['indexArticlesUseCase'];
  syncArticlesFromGithubUseCase?: ApplicationServiceMap['syncArticlesFromGithubUseCase'];
  listArticlesUseCase?: ApplicationServiceMap['listArticlesUseCase'];
  listComponentsUseCase?: ApplicationServiceMap['listComponentsUseCase'];
  generateComponentFromCommentUseCase?: ApplicationServiceMap['generateComponentFromCommentUseCase'];
  generateCoverImageUseCase?: ApplicationServiceMap['generateCoverImageUseCase'];
  selectTopicUseCase?: ApplicationServiceMap['selectTopicUseCase'];
  seoAnalysisUseCase?: ApplicationServiceMap['seoAnalysisUseCase'];
  leadAnalysisUseCase?: ApplicationServiceMap['leadAnalysisUseCase'];
  discoverRssFeedsUseCase?: ApplicationServiceMap['discoverRssFeedsUseCase'];
  // RSS Subscriptions use cases
  subscribeToFeedUseCase?: ApplicationServiceMap['subscribeToFeedUseCase'];
  listSubscriptionsUseCase?: ApplicationServiceMap['listSubscriptionsUseCase'];
  manageSubscriptionUseCase?: ApplicationServiceMap['manageSubscriptionUseCase'];
  commentAgent?: unknown;

  appContainer?: unknown; // Container complet pour accès direct

  // Dépendances partagées (infrastructure)
  configReader?: UserProjectConfigPort;
  promptTemplate?: PromptTemplatePort;
  imageGenerator?: ImageGeneratorPort;
  imageUploaderFs?: ImageUploaderPort;
  imageUploaderGithub?: ImageUploaderPort;

  // Ports writers (fournis par l'infrastructure)
  outlineWriter?: OutlineWriterGenerateOutlinePort;
  sectionWriter?: SectionWriterWriteSectionPort;
  sectionSummarizer?: SectionSummarizerSummarizeSectionPort;
}

// Types étendus incluant les variables Core
type ExtendedVariables = ApplicationVariables & {
  logger?: Logger;
  articleGenerator?: unknown; // non exposé typé côté app (legacy)
  aiTextModel?: AITextModelPort;
  topicRepository?: TopicRepositoryPort;
  articleRepository?: unknown;
  articleStructureRepository?: ArticleStructureRepositoryPort;
  articleFetcher?: ArticleContentFetcherPort;
  trendAnalyzer?: unknown;
  topicSelector?: unknown;
  componentStore?: ComponentVectorStorePort;
  componentSearch?: ComponentSearchPort;
  componentUsageStore?: ComponentUsageStorePort;
  articleStructureStore?: ArticleStructureStorePort;
  componentCatalog?: ComponentCatalogPort;
  topicDiscovery?: TopicDiscoveryPort;
  // Services Core spécialisés
  componentVectorSearchService?: unknown;
  componentUsageService?: unknown;
  articleStructureSearchService?: ArticleStructureSearchPort;
  // Services transverses utilisés par l'application
  articlePublicationService?: ArticlePublicationService;
  // SEO
  googleScraping?: GoogleScrapingPort;
  googleTrends?: GoogleTrendsPort;
  keywordPlanRepo?: KeywordPlanRepositoryPort;
  tagRepository?: TagRepositoryPort;
  // Relations graphe (Article->Topic, Topic->KeywordPlan)
  topicRelations?: TopicRelationsPort;
};

export const applicationMiddleware = createMiddleware<{
  Variables: ExtendedVariables;
}>(async (c, next) => {
  try {
    const logger = c.get('logger') ?? appLogger;
    logger.log('[applicationMiddleware] Initialisation...');

    const container = c.get('container');

    if (!container) {
      logger.error('[applicationMiddleware] ❌ Container Awilix non disponible');
      return c.json({ error: 'DI container non disponible' }, 500);
    }

    // ✅ Résolution directe via Awilix - AVEC await car fonctions async
    // Note: Awilix types ne reflètent pas que async factories → Promises, mais runtime les retourne
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/await-thenable */
    const useCases = {
      listArticlesUseCase: await container.resolve('listArticlesUseCase'),
      indexArticlesUseCase: await container.resolve('indexArticlesUseCase'),
      seoAnalysisUseCase: await container.resolve('seoAnalysisUseCase'),
      generateArticleLinearUseCase: await container.resolve('generateArticleLinearUseCase'),
      analyzeExistingArticleUseCase: await container.resolve('analyzeExistingArticleUseCase'),
      indexComponentsUseCase: await container.resolve('indexComponentsUseCase'),
      listComponentsUseCase: await container.resolve('listComponentsUseCase'),
      leadAnalysisUseCase: await container.resolve('leadAnalysisUseCase'),
      discoverRssFeedsUseCase: await container.resolve('discoverRssFeedsUseCase'),
      // RSS Subscriptions use cases
      subscribeToFeedUseCase: await container.resolve('subscribeToFeedUseCase'),
      listSubscriptionsUseCase: await container.resolve('listSubscriptionsUseCase'),
      manageSubscriptionUseCase: await container.resolve('manageSubscriptionUseCase'),
    } as ApplicationServiceMap;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/await-thenable */

    logger.log('[applicationMiddleware] ✅ Use cases résolus via Awilix');

    // Résumé disponibilité des use cases
    // IMPORTANT: Awilix PROXY mode wraps undefined → on doit logger pour débugger
    // ✅ Validation générique: accepter tout objet avec un constructeur (robuste vs compilateur)
    const ucEntries = Object.entries(useCases as Record<string, unknown>);
    const enabledUseCases = ucEntries
      .filter(([_name, svc]) => {
        // ✅ Validation simple: objet + constructor valide
        // Indépendant du compilateur (esbuild underscore naming, minification, etc.)
        if (!svc || typeof svc !== 'object') return false;

        const constructor = (svc as { constructor?: unknown }).constructor;
        return typeof constructor === 'function';
      })
      .map(([id]) => id);
    const disabledUseCases = ucEntries
      .filter(([id]) => !enabledUseCases.includes(id))
      .map(([id]) => id);
    logger.log(
      `[applicationMiddleware] UseCases: ${enabledUseCases.length} enabled, ${disabledUseCases.length} disabled`
    );
    if (disabledUseCases.length > 0) {
      logger.debug('[applicationMiddleware] UseCases disabled', disabledUseCases);
    }
    if (enabledUseCases.length > 0) {
      logger.debug('[applicationMiddleware] UseCases enabled', enabledUseCases);
    }

    // Expose l'ensemble des use cases
    ctxSet(c, 'useCases', useCases);

    // Injecter le container complet pour un accès direct (opaque)
    ctxSetUnsafe(c, 'appContainer', useCases);

    // ✅ Exposer les services infra nécessaires aux routes (sans exposer tout le cradle)
    const infraServices = await container.resolve('infraServices');
    // Exposer l'objet complet pour les routes qui en ont besoin (ex: GitHub repo)
    ctxSetUnsafe(c, 'infraServices', infraServices);
    // Log diagnostic: clés disponibles côté infra
    try {
      const infraKeys = Object.keys(infraServices ?? {});
      logger.debug('[applicationMiddleware] infraServices keys', infraKeys);
    } catch {
      // ignore
    }
    if (infraServices?.configReader) {
      ctxSetUnsafe(c, 'configReader', infraServices.configReader);
    } else {
      logger.warn('[applicationMiddleware] ⚠️ configReader non disponible dans infraServices');
    }

    // --- DIAGNOSTIC TEMPORAIRE: état du container et dépendances clés (log on change) ---
    try {
      if (!diagDisabled) {
        const analyzeAvailable = Boolean(useCases?.analyzeExistingArticleUseCase);
        const seoAvailable = Boolean(useCases?.seoAnalysisUseCase);
        const listAvailable = Boolean(useCases?.listArticlesUseCase);
        // Snapshot minimal des deps côté infra utiles à AnalyzeExistingArticleUseCase
        const infraObj = c.get('infraServices') as Record<string, unknown> | undefined;
        const depFlags = {
          articleStructureStore: Boolean(infraObj?.articleStructureStore),
          articleStructureRepository: Boolean(infraObj?.articleStructureRepository),
          githubArticleRepository: Boolean(infraObj?.githubArticleRepository),
          articleParser: Boolean(infraObj?.mdxParser), // Mapping: mdxParser (infra) → articleParser (app)
          projectSeoSettings: Boolean(infraObj?.projectSeoSettings),
          tenantProjectStore: Boolean(infraObj?.tenantProjectStore),
          configReader: Boolean(infraObj?.configReader),
          tagRepository: Boolean(infraObj?.tagRepository),
          topicRepository: Boolean(infraObj?.topicRepository),
          topicRelations: Boolean(infraObj?.topicRelations),
          seoBriefStore: Boolean(infraObj?.seoBriefStore),
          editorialBriefStore: Boolean(infraObj?.briefStore),
          editorialAngleAgent: Boolean(infraObj?.editorialAngleAgent),
          topicDiscovery: Boolean(infraObj?.topicDiscovery),
          aiTextModel: Boolean(infraObj?.aiTextModel),
          googleScraping: Boolean(infraObj?.googleScraping),
          googleTrends: Boolean(infraObj?.googleTrends),
          keywordEnrichment: Boolean(infraObj?.keywordEnrichment),
          domainAnalysis: Boolean(infraObj?.domainAnalysis),
          keywordPlanRepo: Boolean(infraObj?.keywordPlanRepo),
        } as const;
        const snapshot = {
          analyzeExistingArticleUseCase: analyzeAvailable,
          seoAnalysisUseCase: seoAvailable,
          listArticlesUseCase: listAvailable,
          depFlags,
        } as const;
        const next = JSON.stringify(snapshot);
        if (next !== lastDiagSnapshot) {
          logger.log('[applicationMiddleware] UseCases disponibles', snapshot);
          lastDiagSnapshot = next;
        }
        if (analyzeAvailable) {
          diagDisabled = true;
          logger.log(
            '[applicationMiddleware] Diagnostic désactivé: analyzeExistingArticleUseCase disponible'
          );
        }
      }
    } catch (_e) {
      // ignorer les erreurs de log diagnostic
    }
  } catch (error) {
    const logger = c.get('logger') ?? appLogger;
    logger.error('Erreur lors de la création des services Application:', error);
    // Log stack trace pour debug
    if (error instanceof Error) {
      logger.error('Error stack:', error.stack);
      logger.error('Error message:', error.message);
    }
    return c.json({ error: 'Erreur de configuration des services Application' }, 500);
  }

  await next();
});
