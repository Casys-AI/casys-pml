import type { ApiResponse } from '@casys/shared';
import type { DIContainer } from '../di/container';
import { Logger } from '../utils/logger';

/**
 * Cradle API minimal : use cases exposés aux routes
 * Feature gating préservé : tous optionnels (?)
 * Pattern: utiliser les Ports (interfaces) pour découplage maximal
 */
export interface ApiUseCasesCradle {
  // Articles
  listArticlesUseCase?: import('@casys/application').ListArticlesUseCase;
  indexArticlesUseCase?: import('@casys/application').IndexArticlesUseCase;
  analyzeExistingArticleUseCase?: import('@casys/core').AnalyzeExistingArticlePort;
  
  // SEO
  seoAnalysisUseCase?: import('@casys/core').SeoAnalysisPort;
  
  // Génération
  generateArticleLinearUseCase?: import('@casys/core').GenerateArticlePort;
  
  // Components
  indexComponentsUseCase?: import('@casys/application').IndexComponentsUseCase;
  listComponentsUseCase?: import('@casys/application').ListComponentsUseCase;
  
  // Lead Analysis
  leadAnalysisUseCase?: import('@casys/application').LeadAnalysisStreamingUseCase;

  // RSS Discovery
  discoverRssFeedsUseCase?: import('@casys/application').DiscoverRssFeedsUseCase;
}

/**
 * Extension des types pour le contexte Hono
 * Permet un typage correct des services injectés via c.set() et c.get()
 */
declare module 'hono' {
  interface ContextVariableMap {
    // DI Container (Awilix)
    container?: DIContainer;
    
    // Services shared exposés directement (type-safe, sans container.resolve())
    createApiResponse: <T = unknown>(
      success: boolean,
      data?: T,
      error?: string
    ) => ApiResponse<T>;
    
    // Aggregated infrastructure and application
    infraServices: unknown;
    useCases: import('@casys/application').ApplicationServiceMap;
    appContainer: unknown;

    // Minimal utils
    logger: Logger;
    configService: unknown;
    webSocketService: unknown;
    articlePublicationService?: import('@casys/core').ArticlePublicationService;
    configReader?: import('@casys/application').UserProjectConfigPort;
    leadAnalysisStore: import('@casys/application').LeadAnalysisStorePort;
    authUserId?: string;
  }
}
