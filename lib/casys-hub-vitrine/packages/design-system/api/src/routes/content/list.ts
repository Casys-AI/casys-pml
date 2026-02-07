import { type ContextVariableMap, Hono } from 'hono';

import { createLogger } from '../../utils/logger';

const logger = createLogger('ListArticlesRoutes');

interface ListArticlesBindings {
  Variables: Pick<ContextVariableMap, 'createApiResponse' | 'useCases'>;
}

// Création du routeur Hono pour le listing des articles
export const listArticlesRoutes = new Hono<ListArticlesBindings>();

interface IndexSummary {
  indexedCount: number;
}

interface ArticlesWithMetaSummary {
  count: number;
}

interface ArticleLookupResult {
  found: boolean;
  article: unknown;
}

interface ListArticlesUseCaseContract {
  listAllArticles(): Promise<IndexSummary>;
  listAllArticlesWithMeta(): Promise<ArticlesWithMetaSummary>;
  listArticlesByTenant(tenantId: string): Promise<IndexSummary>;
  listArticlesByProject(tenantId: string, projectId: string): Promise<IndexSummary>;
  getArticle(input: {
    articleId: string;
    tenantId?: string;
    projectId?: string;
  }): Promise<ArticleLookupResult>;
  getArticleDetails(articleId: string): Promise<unknown>;
}

function assertListArticlesUseCase(
  candidate: unknown
): asserts candidate is ListArticlesUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    logger.error('[assertListArticlesUseCase] candidate is not an object', { candidate });
    throw new Error('Use case de listing des articles non disponible');
  }

  const methods = {
    listAllArticles: typeof (candidate as { listAllArticles?: unknown }).listAllArticles,
    listAllArticlesWithMeta: typeof (candidate as { listAllArticlesWithMeta?: unknown })
      .listAllArticlesWithMeta,
    listArticlesByTenant: typeof (candidate as { listArticlesByTenant?: unknown })
      .listArticlesByTenant,
    listArticlesByProject: typeof (candidate as { listArticlesByProject?: unknown })
      .listArticlesByProject,
    getArticle: typeof (candidate as { getArticle?: unknown }).getArticle,
    getArticleDetails: typeof (candidate as { getArticleDetails?: unknown }).getArticleDetails,
  };

  const missingMethods = Object.entries(methods).filter(([, type]) => type !== 'function');
  if (missingMethods.length > 0) {
    logger.error('[assertListArticlesUseCase] Missing methods', { missingMethods });
    throw new Error(
      `Use case de listing des articles non disponible: manque ${missingMethods.map(([name]) => name).join(', ')}`
    );
  }
}

/**
 * GET /articles - Liste tous les articles (catalogue global)
 * Utilise le container shared pour créer les DTOs
 */
listArticlesRoutes.get('/articles', async c => {
  try {
    // Récupération de createApiResponse depuis le contexte
    const createApiResponse = c.get('createApiResponse');

    const listArticlesUseCaseCandidate: unknown = c.get('useCases').listArticlesUseCase;
    // Validation minimale: seule la méthode listAllArticles est nécessaire pour cette route
    if (
      !listArticlesUseCaseCandidate ||
      typeof listArticlesUseCaseCandidate !== 'object' ||
      typeof (listArticlesUseCaseCandidate as { listAllArticles?: unknown }).listAllArticles !==
        'function'
    ) {
      throw new Error('Use case de listing des articles non disponible');
    }
    const listArticlesUseCase = listArticlesUseCaseCandidate as unknown as {
      listAllArticles: () => Promise<IndexSummary>;
    };

    const result = await listArticlesUseCase.listAllArticles();

    logger.log(`✅ ${result.indexedCount} articles trouvés dans le catalogue global`);

    // Création d'une réponse standard avec le wrapper API
    const response = createApiResponse(true, result);

    return c.json(response, 200);
  } catch (error) {
    logger.error('❌ Erreur lors du listing global des articles:', error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors du listing global des articles: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      // Fallback si createApiResponse n'est pas disponible
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors du listing global des articles: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

/**
 * GET /articles/with-meta - Liste tous les articles avec métadonnées
 * Utilise le container shared pour créer les DTOs
 */
listArticlesRoutes.get('/articles/with-meta', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');
    
    // Récupération du use case injecté directement par le middleware application
    const listArticlesUseCaseCandidate: unknown = c.get('useCases').listArticlesUseCase;
    assertListArticlesUseCase(listArticlesUseCaseCandidate);
    const listArticlesUseCase = listArticlesUseCaseCandidate;

    // Appel du use case qui retourne déjà des DTOs ArticleMetadataDTO[]
    const articlesWithMeta = await listArticlesUseCase.listAllArticlesWithMeta();

    // Création d'une réponse standard avec le wrapper API
    const response = createApiResponse(true, articlesWithMeta);

    logger.log(`✅ ${articlesWithMeta.count} articles trouvés avec métadonnées`);
    return c.json(response, 200);
  } catch (error) {
    logger.error('❌ Erreur lors du listing des articles avec métadonnées:', error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors du listing des articles avec métadonnées: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      // Fallback si createApiResponse n'est pas disponible
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors du listing des articles avec métadonnées: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

/**
 * GET /articles/tenant/:tenantId - Liste les articles d'un tenant
 * Utilise le container shared pour créer les DTOs
 */
listArticlesRoutes.get('/articles/tenant/:tenantId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const tenantId = c.req.param('tenantId');
    const listArticlesUseCaseCandidate: unknown = c.get('useCases').listArticlesUseCase;
    assertListArticlesUseCase(listArticlesUseCaseCandidate);
    const listArticlesUseCase = listArticlesUseCaseCandidate;

    const result = await listArticlesUseCase.listArticlesByTenant(tenantId);

    logger.log(`✅ ${result.indexedCount} articles trouvés pour le tenant ${tenantId}`);

    // Création d'une réponse standard avec le wrapper API
    const response = createApiResponse(true, result);

    return c.json(response, 200);
  } catch (error) {
    logger.error('❌ Erreur lors du listing des articles par tenant:', error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors du listing des articles par tenant: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      // Fallback si createApiResponse n'est pas disponible
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors du listing des articles par tenant: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

/**
 * GET /articles/project/:tenantId/:projectId - Liste les articles d'un projet
 * Utilise le container shared pour créer les DTOs
 */
listArticlesRoutes.get('/articles/project/:tenantId/:projectId', async c => {
  try {
    // Récupération du service depuis le contexte Hono (type-safe)
    const createApiResponse = c.get('createApiResponse');

    const tenantId = c.req.param('tenantId');
    const projectId = c.req.param('projectId');
    const source = (c.req.query('source') ?? 'fs').toLowerCase();

    if (source === 'github') {
      // Listing direct depuis GitHub (non récursif) via infraServices.githubArticleRepository
      // NOTE: on ne change pas les types de Variables ici, on cast prudemment.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const infra: any = (c as unknown as { get: (k: string) => unknown }).get('infraServices');
      const ghRepo = infra?.githubArticleRepository as
        | { findByProject: (tenantId: string, projectId: string) => Promise<unknown[]> }
        | undefined;

      if (!ghRepo || typeof ghRepo.findByProject !== 'function') {
        const response = createApiResponse(
          false,
          null,
          'GithubArticleStructureRepository indisponible'
        );
        return c.json(response, 500);
      }

      const articles = await ghRepo.findByProject(tenantId, projectId);
      const items = Array.isArray(articles)
        ? articles
            .map(a => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              id: (a as any)?.article?.id as string | undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              title: (a as any)?.article?.title as string | undefined,
            }))
            .filter(x => typeof x.id === 'string')
        : [];
      const result = { count: items.length, items };

      logger.log(
        `✅ (GitHub) ${result.count} articles trouvés pour le projet ${projectId} (tenant ${tenantId})`
      );

      const response = createApiResponse(
        true,
        result,
        `(GitHub) ${result.count} articles trouvés pour le projet ${projectId} (tenant ${tenantId})`
      );
      return c.json(response, 200);
    } else {
      // Source FS (par défaut): use case existant
      const useCasesFromContext = c.get('useCases');
      logger.debug('[Route] useCases from context:', {
        hasUseCases: !!useCasesFromContext,
        useCasesType: typeof useCasesFromContext,
        hasListArticles: !!(useCasesFromContext as any)?.listArticlesUseCase,
      });

      const listArticlesUseCaseCandidate: unknown = useCasesFromContext?.listArticlesUseCase;
      assertListArticlesUseCase(listArticlesUseCaseCandidate);
      const listArticlesUseCase = listArticlesUseCaseCandidate;

      const result = await listArticlesUseCase.listArticlesByProject(tenantId, projectId);

      logger.log(
        `✅ ${result.indexedCount} articles trouvés pour le projet ${projectId} (tenant ${tenantId})`
      );

      const response = createApiResponse(true, result);

      return c.json(response, 200);
    }
  } catch (error) {
    logger.error('❌ Erreur lors du listing des articles par projet:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors du listing des articles par projet: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      // Fallback si createApiResponse n'est pas disponible
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors du listing des articles par projet: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

/**
 * GET /articles/:articleId - Récupère un article spécifique
 * Utilise le container shared pour créer les DTOs
 */
listArticlesRoutes.get('/articles/:articleId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const articleId = c.req.param('articleId');
    const tenantId = c.req.query('tenantId');
    const projectId = c.req.query('projectId');

    const listArticlesUseCaseCandidate: unknown = c.get('useCases').listArticlesUseCase;
    assertListArticlesUseCase(listArticlesUseCaseCandidate);
    const listArticlesUseCase = listArticlesUseCaseCandidate;

    const result = await listArticlesUseCase.getArticle({
      articleId,
      tenantId,
      projectId,
    });

    if (!result.found) {
      // Création d'une réponse d'erreur standard pour les 404
      const notFoundResponse = createApiResponse(
        false,
        null,
        `Article ${articleId} non trouvé`
      );
      return c.json(notFoundResponse, 404);
    }

    logger.log(`✅ Article ${articleId} récupéré avec succès`);

    // Création d'une réponse standard avec le wrapper API
    const response = createApiResponse(true, result.article);

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de la récupération de l'article:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      // Création d'une réponse d'erreur standard
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de la récupération de l'article: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      // Fallback si createApiResponse n'est pas disponible
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de la récupération de l'article: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

/**
 * GET /articles/details/:articleId - Récupère les détails d'un article
 * Utilise le container shared pour créer les DTOs
 */
listArticlesRoutes.get('/articles/details/:articleId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const articleId = c.req.param('articleId');
    const listArticlesUseCaseCandidate: unknown = c.get('useCases').listArticlesUseCase;
    assertListArticlesUseCase(listArticlesUseCaseCandidate);
    const listArticlesUseCase = listArticlesUseCaseCandidate;

    const result = await listArticlesUseCase.getArticleDetails(articleId);

    logger.log(`✅ Détails de l'article ${articleId} récupérés avec succès`);

    // Création d'une réponse standard avec le wrapper API
    const response = createApiResponse(true, result);

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de la récupération des détails de l'article:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      // Création d'une réponse d'erreur standard
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de la récupération des détails de l'article: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      // Fallback si createApiResponse n'est pas disponible
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de la récupération des détails de l'article: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});
