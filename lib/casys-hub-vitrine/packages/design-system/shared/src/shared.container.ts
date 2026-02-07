import { type ApiResponse } from './dtos/api-response.dto';
import { type ArticleListResponseDTO, type ArticleMetadataDTO } from './dtos/article-metadata.dto';
import {
  type ComponentListResponseDTO,
  type ComponentMetadataDTO,
  type ComponentSearchResponseDTO,
} from './dtos/component-metadata.dto';
import {
  type ComponentUsageDTO,
  type ComponentUsageListResponseDTO,
  type ComponentUsageOperationResponseDTO,
} from './dtos/component-usage.dto';

/**
 * Interface pour les dépendances optionnelles du container shared
 */
export interface LoggerLike {
  log: (message: string, context?: unknown) => void;
  warn: (message: string, context?: unknown) => void;
  error: (message: string, context?: unknown) => void;
}

/**
 * Cradle typé pour les services shared (pour Awilix)
 * Contient uniquement les factories de DTOs (pas de dépendances complexes)
 */
export interface SharedCradle {
  logger?: LoggerLike;
  
  // Article DTOs
  createArticleMetadataDTO: (
    id: string,
    title: string,
    description: string,
    language: string,
    keywords: string[],
    createdAt: string,
    tenantId: string,
    projectId: string,
    sectionsCount: number,
    fragmentsCount: number,
    commentsCount: number,
    componentUsagesCount: number
  ) => ArticleMetadataDTO;
  
  createArticleListResponseDTO: (
    articles: ArticleMetadataDTO[],
    count: number,
    message?: string
  ) => ArticleListResponseDTO;
  
  // Component DTOs
  createComponentMetadataDTO: (
    id: string,
    name: string,
    category: string,
    subcategory: string,
    description: string,
    tags: string[],
    useCases: string[],
    tenantId?: string,
    projectId?: string,
    usageCount?: number
  ) => ComponentMetadataDTO;
  
  createComponentListResponseDTO: (
    components: ComponentMetadataDTO[],
    count: number,
    scope: 'global' | 'tenant' | 'project' | 'article',
    message?: string,
    tenantId?: string,
    projectId?: string,
    articleId?: string
  ) => ComponentListResponseDTO;
  
  createComponentSearchResponseDTO: (
    results: { id: string; score: number; component: ComponentMetadataDTO }[],
    count: number,
    query: string
  ) => ComponentSearchResponseDTO;
  
  // Component Usage DTOs
  createComponentUsageDTO: (
    id: string,
    componentId: string,
    sectionId: string,
    props: Record<string, unknown>,
    position: number,
    isSectionHeader?: boolean
  ) => ComponentUsageDTO;
  
  createComponentUsageListResponseDTO: (
    usages: ComponentUsageDTO[],
    count: number,
    message?: string,
    sectionId?: string,
    articleId?: string,
    componentId?: string
  ) => ComponentUsageListResponseDTO;
  
  createComponentUsageOperationResponseDTO: (
    success: boolean,
    message: string,
    usage?: ComponentUsageDTO
  ) => ComponentUsageOperationResponseDTO;
  
  // API Response
  createApiResponse: <T>(success: boolean, data?: T, error?: string) => ApiResponse<T>;
}

// Type de retour explicite des services shared
export type SharedServices = ReturnType<typeof createSharedServices>;

export interface SharedDependencies {
  logger?: LoggerLike;
}

function isLoggerLike(value: unknown): value is LoggerLike {
  const v = value as Record<string, unknown> | null | undefined;
  return (
    !!v &&
    typeof v.log === 'function' &&
    typeof v.warn === 'function' &&
    typeof v.error === 'function'
  );
}

/**
 * Enregistre les services shared dans un container Awilix
 * À utiliser avec le pattern Cradle pour type-safety
 * 
 * @example
 * ```typescript
 * import { createContainer } from 'awilix';
 * import { registerSharedServices } from '@casys/shared';
 * 
 * const container = createContainer<SharedCradle>();
 * registerSharedServices(container, { logger });
 * 
 * // Utilisation typée
 * const dto = container.cradle.createArticleMetadataDTO(...);
 * ```
 */
export function registerSharedServices(
  container: { register: (registrations: Record<string, unknown>) => void },
  dependencies: SharedDependencies = {}
) {
  const { logger } = dependencies;
  
  container.register({
    // Logger (optionnel)
    logger: { resolve: () => logger },
    
    // Article DTOs
    createArticleMetadataDTO: {
      resolve: () => (
        id: string,
        title: string,
        description: string,
        language: string,
        keywords: string[],
        createdAt: string,
        tenantId: string,
        projectId: string,
        sectionsCount: number,
        fragmentsCount: number,
        commentsCount: number,
        componentUsagesCount: number
      ): ArticleMetadataDTO => ({
        id,
        title,
        description,
        language,
        tags: keywords || [],
        createdAt,
        tenantId,
        projectId,
        sectionsCount,
        fragmentsCount,
        commentsCount,
        componentUsagesCount,
      }),
    },
    
    createArticleListResponseDTO: {
      resolve: () => (
        articles: ArticleMetadataDTO[],
        count: number,
        message?: string
      ): ArticleListResponseDTO => ({
        articles,
        count,
        message: message ?? `${count} articles trouvés`,
      }),
    },
    
    // Component DTOs
    createComponentMetadataDTO: {
      resolve: () => (
        id: string,
        name: string,
        category: string,
        subcategory: string,
        description: string,
        tags: string[],
        useCases: string[],
        tenantId?: string,
        projectId?: string,
        usageCount?: number
      ): ComponentMetadataDTO => ({
        id,
        name,
        category,
        subcategory,
        description,
        tags,
        useCases,
        tenantId,
        projectId,
        usageCount,
      }),
    },
    
    createComponentListResponseDTO: {
      resolve: () => (
        components: ComponentMetadataDTO[],
        count: number,
        scope: 'global' | 'tenant' | 'project' | 'article',
        message?: string,
        tenantId?: string,
        projectId?: string,
        articleId?: string
      ): ComponentListResponseDTO => ({
        components,
        count,
        scope,
        message: message ?? `${count} composants trouvés`,
        tenantId,
        projectId,
        articleId,
      }),
    },
    
    createComponentSearchResponseDTO: {
      resolve: () => (
        results: { id: string; score: number; component: ComponentMetadataDTO }[],
        count: number,
        query: string
      ): ComponentSearchResponseDTO => ({
        results,
        count,
        query,
      }),
    },
    
    // Component Usage DTOs
    createComponentUsageDTO: {
      resolve: () => (
        id: string,
        componentId: string,
        sectionId: string,
        props: Record<string, unknown>,
        position: number,
        isSectionHeader?: boolean
      ): ComponentUsageDTO => ({
        id,
        componentId,
        sectionId,
        props,
        position,
        isSectionHeader,
      }),
    },
    
    createComponentUsageListResponseDTO: {
      resolve: () => (
        usages: ComponentUsageDTO[],
        count: number,
        message?: string,
        sectionId?: string,
        articleId?: string,
        componentId?: string
      ): ComponentUsageListResponseDTO => ({
        usages,
        count,
        message: message ?? `${count} usages de composants trouvés`,
        sectionId,
        articleId,
        componentId,
      }),
    },
    
    createComponentUsageOperationResponseDTO: {
      resolve: () => (
        success: boolean,
        message: string,
        usage?: ComponentUsageDTO
      ): ComponentUsageOperationResponseDTO => ({
        success,
        message,
        usage,
      }),
    },
    
    // API Response
    createApiResponse: {
      resolve: () => <T>(success: boolean, data?: T, error?: string): ApiResponse<T> => ({
        success,
        data,
        error: error ?? null,
      }),
    },
  });
  
  logger?.log('📦 Services shared enregistrés dans Awilix');
}

/**
 * Crée les services shared (DTOs et utilitaires partagés)
 * 
 * @deprecated Utiliser `registerSharedServices()` avec Awilix à la place
 * Cette fonction est gardée pour compatibilité temporaire
 * 
 * Ce container expose les factories de DTOs pour être utilisées
 * dans les couches API et CLI sans créer de dépendances directes
 */
export function createSharedServices(dependencies: SharedDependencies = {}) {
  const { logger } = dependencies;
  if (logger && !isLoggerLike(logger)) {
    throw new Error('[shared.container] logger invalide: doit exposer log/warn/error functions');
  }
  const log = logger;

  log?.log('📦 Initialisation des services shared...');

  return {
    dtos: {
      article: {
        /**
         * Factory pour créer un ArticleMetadataDTO
         */
        createMetadataDTO: (
          id: string,
          title: string,
          description: string,
          language: string,
          keywords: string[],
          createdAt: string,
          tenantId: string,
          projectId: string,
          sectionsCount: number,
          fragmentsCount: number,
          commentsCount: number,
          componentUsagesCount: number
        ): ArticleMetadataDTO => ({
          id,
          title,
          description,
          language,
          tags: keywords || [],
          createdAt,
          tenantId,
          projectId,
          sectionsCount,
          fragmentsCount,
          commentsCount,
          componentUsagesCount,
        }),

        /**
         * Factory pour créer un ArticleListResponseDTO
         */
        createListResponseDTO: (
          articles: ArticleMetadataDTO[],
          count: number,
          message?: string
        ): ArticleListResponseDTO => ({
          articles,
          count,
          message: message ?? `${count} articles trouvés`,
        }),
      },

      component: {
        /**
         * Factory pour créer un ComponentMetadataDTO
         */
        createMetadataDTO: (
          id: string,
          name: string,
          category: string,
          subcategory: string,
          description: string,
          tags: string[],
          useCases: string[],
          tenantId?: string,
          projectId?: string,
          usageCount?: number
        ): ComponentMetadataDTO => ({
          id,
          name,
          category,
          subcategory,
          description,
          tags,
          useCases,
          tenantId,
          projectId,
          usageCount,
        }),

        /**
         * Factory pour créer un ComponentListResponseDTO
         */
        createListResponseDTO: (
          components: ComponentMetadataDTO[],
          count: number,
          scope: 'global' | 'tenant' | 'project' | 'article',
          message?: string,
          tenantId?: string,
          projectId?: string,
          articleId?: string
        ): ComponentListResponseDTO => ({
          components,
          count,
          scope,
          message: message ?? `${count} composants trouvés`,
          tenantId,
          projectId,
          articleId,
        }),

        /**
         * Factory pour créer un ComponentSearchResponseDTO
         */
        createSearchResponseDTO: (
          results: { id: string; score: number; component: ComponentMetadataDTO }[],
          count: number,
          query: string
        ): ComponentSearchResponseDTO => ({
          results,
          count,
          query,
        }),
      },

      componentUsage: {
        /**
         * Factory pour créer un ComponentUsageDTO
         */
        createUsageDTO: (
          id: string,
          componentId: string,
          sectionId: string,
          props: Record<string, unknown>,
          position: number,
          isSectionHeader?: boolean
        ): ComponentUsageDTO => ({
          id,
          componentId,
          sectionId,
          props,
          position,
          isSectionHeader,
        }),

        /**
         * Factory pour créer un ComponentUsageListResponseDTO
         */
        createListResponseDTO: (
          usages: ComponentUsageDTO[],
          count: number,
          message?: string,
          sectionId?: string,
          articleId?: string,
          componentId?: string
        ): ComponentUsageListResponseDTO => ({
          usages,
          count,
          message: message ?? `${count} usages de composants trouvés`,
          sectionId,
          articleId,
          componentId,
        }),

        /**
         * Factory pour créer un ComponentUsageOperationResponseDTO
         */
        createOperationResponseDTO: (
          success: boolean,
          message: string,
          usage?: ComponentUsageDTO
        ): ComponentUsageOperationResponseDTO => ({
          success,
          message,
          usage,
        }),
      },

      /**
       * Utilitaires pour les réponses API standards
       */
      api: {
        /**
         * Factory pour créer une réponse API générique
         */
        createResponse: <T>(success: boolean, data?: T, error?: string): ApiResponse<T> => ({
          success,
          data,
          error: error ?? null,
        }),
      },
    },
  };
}
