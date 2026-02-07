import { asFunction, asValue, type AwilixContainer, createContainer, InjectionMode } from 'awilix';

import { registerSharedServices, type SharedCradle } from '@casys/shared';
import { ApplicationContainer, ArticlePublicationService } from '@casys/application';
import { createInfrastructureServices } from '@casys/infrastructure';

import type { ApiUseCasesCradle } from '../types/hono-context';
import { createLogger, type Logger } from '../utils/logger';
import * as factories from './factories';

// Types des services enregistrés dans le container
// ✅ Cradle = Use Cases API uniquement (SharedCradle + ApiUseCasesCradle)
// ❌ Infra reste caché (pas dans le cradle)
export interface DIServices extends SharedCradle, ApiUseCasesCradle {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  infraConfig: Record<string, unknown>;
  // Infra caché - accès via factories uniquement
  infraServices: Promise<Awaited<ReturnType<typeof createInfrastructureServices>>>;
  applicationServices: Promise<Awaited<ReturnType<typeof ApplicationContainer.prototype.build>>>;
  articlePublicationService: ArticlePublicationService | undefined;
}

export type DIContainer = AwilixContainer<DIServices>;

export function createRootContainer() {
  const container = createContainer<DIServices>({ injectionMode: InjectionMode.PROXY });

  // Enregistrer logger et env
  container.register({
    env: asValue(process.env),
    logger: asValue(createLogger('DI')),
  });

  // Enregistrer les services shared avec le pattern Cradle
  registerSharedServices(container, { logger: createLogger('Shared') });

  // Enregistrer les services infra et app (méthode canon Awilix avec disposer)
  container.register({
    infraConfig: asFunction(() => ({
      openaiApiKey: process.env.OPENAI_API_KEY,
      newsApiKey: process.env.NEWS_API_KEY,
      configBaseDir: process.env.CASYS_PROJECT_ROOT,
      kuzuDbPath: process.env.KUZU_DB_PATH,
      articlesOutputDir: process.env.ARTICLES_OUTPUT_DIR ?? './public/generated',
    })).singleton(),

    // ✅ Méthode canon: async factory avec disposer
    infraServices: asFunction(async (cradle: DIServices) => {
      return await createInfrastructureServices(cradle.infraConfig, cradle.logger);
    })
      .singleton()
      .disposer(async () => {
        // Cleanup des ressources si nécessaire (ex: fermer connexions DB)
      }),

    // ✅ Services applicatifs créés via ApplicationContainer
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    applicationServices: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      // Mapping des noms techniques (infra) vers noms métier (application)
      const appDeps = {
        ...infraServices,
        articleParser: infraServices.mdxParser, // Mapping explicite
        articleContentFetcher: infraServices.articleFetcher, // Mapping explicite
      };
      const appContainer = new ApplicationContainer(appDeps as any);
      return appContainer.build();
    }).singleton(),

    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    articlePublicationService: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      const cr = infraServices?.configReader as
        | import('@casys/application').UserProjectConfigPort
        | undefined;
      const fsPub = infraServices?.articlePublisher as
        | import('@casys/application').ArticlePublisherPort
        | undefined;
      const ghPub = infraServices?.articlePublisherGithub as
        | import('@casys/application').ArticlePublisherPort
        | undefined;
      if (!cr) return undefined;
      return new ArticlePublicationService(cr, fsPub, ghPub);
    }).singleton(),
  });

  // ✅ Enregistrer les use cases API uniquement (Cradle = contrat API)
  // Infra reste caché - les factories accèdent à infraServices directement
  container.register({
    // Articles
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    listArticlesUseCase: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      return factories.buildListArticlesUseCase(
        infraServices?.articleStructureRepository,
        cradle.logger
      );
    }).scoped(),
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    indexArticlesUseCase: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      return factories.buildIndexArticlesUseCase(
        infraServices?.articleStructureStore,
        cradle.logger
      );
    }).scoped(),

    // SEO
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    seoAnalysisUseCase: asFunction(async (cradle: DIServices) => {
      const appServices = await cradle.applicationServices;
      return appServices.seoAnalysisUseCase;
    }).scoped(),

    // Components
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    indexComponentsUseCase: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      return factories.buildIndexComponentsUseCase(infraServices, cradle.logger);
    }).scoped(),

    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    listComponentsUseCase: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      return factories.buildListComponentsUseCase(infraServices, cradle.logger);
    }).scoped(),

    // Lead Analysis
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    leadAnalysisUseCase: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      return factories.buildLeadAnalysisUseCase(infraServices, cradle.logger);
    }).scoped(),

    // RSS Discovery
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    discoverRssFeedsUseCase: asFunction(async (cradle: DIServices) => {
      const infraServices = await cradle.infraServices;
      return factories.buildDiscoverRssFeedsUseCase(infraServices, cradle.logger);
    }).scoped(),

    // RSS Subscriptions
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    subscribeToFeedUseCase: asFunction(async (cradle: DIServices) => {
      const appServices = await cradle.applicationServices;
      return appServices.subscribeToFeedUseCase;
    }).scoped(),

    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    listSubscriptionsUseCase: asFunction(async (cradle: DIServices) => {
      const appServices = await cradle.applicationServices;
      return appServices.listSubscriptionsUseCase;
    }).scoped(),

    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    manageSubscriptionUseCase: asFunction(async (cradle: DIServices) => {
      const appServices = await cradle.applicationServices;
      return appServices.manageSubscriptionUseCase;
    }).scoped(),

    // Génération & Analysis
    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    generateArticleLinearUseCase: asFunction(async (cradle: DIServices) => {
      const appServices = await cradle.applicationServices;
      return appServices.generateArticleLinearUseCase;
    }).scoped(),

    // @ts-expect-error - Awilix PROXY mode unwraps Promise at runtime
    analyzeExistingArticleUseCase: asFunction(async (cradle: DIServices) => {
      const appServices = await cradle.applicationServices;
      return appServices.analyzeExistingArticleUseCase;
    }).scoped(),
  });

  return container;
}
