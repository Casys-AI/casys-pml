import { zValidator } from '@hono/zod-validator';
import { type ContextVariableMap, Hono } from 'hono';
import { z } from 'zod';

import { createLogger } from '../../utils/logger';

const logger = createLogger('IndexingArticlesRoutes');

interface ArticlesBindings {
  Variables: Pick<ContextVariableMap, 'createApiResponse' | 'useCases'>;
}

interface IndexArticlesExecuteResult {
  success: boolean;
  indexedCount: number;
  failedCount?: number;
  scope?: string;
  tenantId?: string;
  projectId?: string;
  articleId?: string;
  errors?: unknown[];
}

interface IndexArticlesUseCaseContract {
  execute(input: {
    articles: unknown[];
    tenantId?: string;
    projectId?: string;
  }): Promise<IndexArticlesExecuteResult>;
  indexGlobalCatalog(): Promise<IndexArticlesExecuteResult>;
  indexTenantCatalog(tenantId: string): Promise<IndexArticlesExecuteResult>;
  indexProjectCatalog(tenantId: string, projectId: string): Promise<IndexArticlesExecuteResult>;
  indexArticle(articleId: string): Promise<IndexArticlesExecuteResult>;
}


function assertIndexArticlesUseCase(
  candidate: unknown
): asserts candidate is IndexArticlesUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error("Use case d'indexation des articles non disponible");
  }
  if (typeof (candidate as { execute?: unknown }).execute !== 'function') {
    throw new Error("Use case d'indexation des articles non disponible");
  }
}

// Schéma de validation pour l'indexation des articles
const indexArticlesSchema = z.object({
  articles: z.array(
    z.object({
      article: z.object({
        id: z.string(),
        title: z.string(),
        content: z.string().optional(),
        // Autres propriétés de l'article...
      }),
      sections: z
        .array(
          z.object({
            id: z.string(),
            articleId: z.string(),
            title: z.string(),
            content: z.string(),
            order: z.number(),
          })
        )
        .optional(),
      componentUsages: z
        .array(
          z.object({
            id: z.string(),
            articleId: z.string(),
            componentId: z.string().optional(),
            // Autres propriétés des composants...
          })
        )
        .optional(),
      comments: z
        .array(
          z.object({
            id: z.string(),
            content: z.string().optional(),
            // Autres propriétés des commentaires...
          })
        )
        .optional(),
    })
  ),
  tenantId: z.string().optional(),
  projectId: z.string().optional(),
});

type IndexArticlesRequest = z.infer<typeof indexArticlesSchema>;

// Création du routeur Hono pour l'indexation des articles
export const indexingArticlesRoutes = new Hono<ArticlesBindings>();

// Route pour indexer des articles (général)
indexingArticlesRoutes.post('/articles', zValidator('json', indexArticlesSchema), async c => {
  try {
    const { articles, tenantId, projectId } = c.req.valid('json') as IndexArticlesRequest;

    const createApiResponse = c.get('createApiResponse');

    try {
      const indexArticlesUseCaseCandidate: unknown = c.get('useCases').indexArticlesUseCase;
      assertIndexArticlesUseCase(indexArticlesUseCaseCandidate);
      const indexArticlesUseCase = indexArticlesUseCaseCandidate;

      // Exécuter le use case
      const result = await indexArticlesUseCase.execute({
        articles: articles,
        tenantId: tenantId,
        projectId: projectId,
      });

      logger.log(`✅ ${result.indexedCount} articles indexés avec succès`);

      // Utilisation du DTO via le container shared
      const response = createApiResponse(
        true,
        result,
        `${result.indexedCount} articles indexés avec succès`
      );

      return c.json(response, 200);
    } catch (error) {
      logger.error("❌ Erreur lors de l'indexation des articles:", error);

      // Création d'une réponse d'erreur standardisée
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de l'indexation des articles: ${error instanceof Error ? error.message : String(error)}`
      );

      return c.json(response, 500);
    }
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`❌ Erreur lors de l'indexation des articles : ${error.message}`);

    // En cas d'erreur de validation, on peut ne pas avoir accès au container shared
    // On utilise donc un format de réponse simple mais cohérent
    return c.json(
      {
        success: false,
        error: "Erreur lors de l'indexation des articles",
        message: error.message,
        data: null,
      },
      500
    );
  }
});

// Route pour indexer le catalogue global
indexingArticlesRoutes.post('/articles/global', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const indexArticlesUseCaseCandidate: unknown = c.get('useCases').indexArticlesUseCase;
    assertIndexArticlesUseCase(indexArticlesUseCaseCandidate);
    const indexArticlesUseCase = indexArticlesUseCaseCandidate;

    const result = await indexArticlesUseCase.indexGlobalCatalog();

    logger.log(`✅ Indexation globale: ${result.indexedCount} articles indexés`);

    // Utilisation du DTO via le container shared
    const response = createApiResponse(
      true,
      result,
      `Indexation globale réussie: ${result.indexedCount} articles indexés`
    );

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de l'indexation globale:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de l'indexation globale: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de l'indexation globale: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

// Route pour indexer par tenant
indexingArticlesRoutes.post('/articles/tenant/:tenantId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const tenantId = c.req.param('tenantId');
    const indexArticlesUseCaseCandidate: unknown = c.get('useCases').indexArticlesUseCase;
    assertIndexArticlesUseCase(indexArticlesUseCaseCandidate);
    const indexArticlesUseCase = indexArticlesUseCaseCandidate;

    const result = await indexArticlesUseCase.indexTenantCatalog(tenantId);

    logger.log(`✅ Indexation tenant ${tenantId}: ${result.indexedCount} articles indexés`);

    const response = createApiResponse(
      true,
      result,
      `Indexation du tenant ${tenantId} réussie: ${result.indexedCount} articles indexés`
    );

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de l'indexation par tenant:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de l'indexation par tenant: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de l'indexation par tenant: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

// Route pour indexer par projet
indexingArticlesRoutes.post('/articles/project/:tenantId/:projectId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const tenantId = c.req.param('tenantId');
    const projectId = c.req.param('projectId');
    const indexArticlesUseCaseCandidate: unknown = c.get('useCases').indexArticlesUseCase;
    assertIndexArticlesUseCase(indexArticlesUseCaseCandidate);
    const indexArticlesUseCase = indexArticlesUseCaseCandidate;

    const result = await indexArticlesUseCase.indexProjectCatalog(tenantId, projectId);

    logger.log(
      `✅ Indexation projet ${projectId} (tenant ${tenantId}): ${result.indexedCount} articles indexés`
    );

    const response = createApiResponse(
      true,
      result,
      `Indexation du projet ${projectId} (tenant ${tenantId}) réussie: ${result.indexedCount} articles indexés`
    );

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de l'indexation par projet:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de l'indexation par projet: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de l'indexation par projet: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

// Route pour indexer un article spécifique
indexingArticlesRoutes.post('/articles/:articleId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const articleId = c.req.param('articleId');
    const indexArticlesUseCaseCandidate: unknown = c.get('useCases').indexArticlesUseCase;
    assertIndexArticlesUseCase(indexArticlesUseCaseCandidate);
    const indexArticlesUseCase = indexArticlesUseCaseCandidate;

    const result = await indexArticlesUseCase.indexArticle(articleId);

    logger.log(`✅ Article ${articleId} indexé: ${result.success ? 'succès' : 'échec'}`);

    const response = createApiResponse(
      true,
      result,
      `Indexation de l'article ${articleId} réussie`
    );

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de l'indexation de l'article:", error);

    const createErrorResponse = c.get('createApiResponse');

    const response = createErrorResponse(
          false,
          null,
          `Erreur lors de l'indexation de l'article: ${error instanceof Error ? error.message : String(error)}`
        );

    return c.json(response, 500);
  }
});

// Route pour synchroniser intelligemment depuis GitHub (avec diff)
indexingArticlesRoutes.post('/articles/github/:tenantId/:projectId', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const tenantId = c.req.param('tenantId');
    const projectId = c.req.param('projectId');

    // Récupérer le use case de synchronisation depuis le contexte
    const syncUseCase: unknown = c.get('useCases').syncArticlesFromGithubUseCase;
    
    if (!syncUseCase || typeof syncUseCase !== 'object') {
      return c.json(
        createApiResponse(
          false,
          null,
          'SyncArticlesFromGithubUseCase non disponible dans le contexte'
        ),
        500
      );
    }

    const execute = (syncUseCase as { execute?: unknown }).execute;
    
    if (typeof execute !== 'function') {
      return c.json(
        createApiResponse(
          false,
          null,
          'SyncArticlesFromGithubUseCase.execute non disponible'
        ),
        500
      );
    }

    // Exécuter la synchronisation intelligente (avec diff)
    logger.log(`🔄 Synchronisation GitHub → Kuzu pour ${tenantId}/${projectId}`);
    const result = await execute.call(syncUseCase, tenantId, projectId);

    logger.log(
      `✅ Synchronisation terminée: ${result.indexed} nouveaux, ${result.updated} mis à jour, ${result.skipped} inchangés`
    );

    // Construire une réponse détaillée
    const response = createApiResponse(
      result.success,
      {
        indexed: result.indexed,
        indexedArticleIds: result.indexedArticleIds,
        updated: result.updated,
        updatedArticleIds: result.updatedArticleIds,
        skipped: result.skipped,
        skippedArticleIds: result.skippedArticleIds,
        errors: result.errors,
        message: result.message,
      },
      `Synchronisation GitHub réussie: ${result.message}`
    );

    return c.json(response, 200);
  } catch (error) {
    logger.error("❌ Erreur lors de la synchronisation GitHub:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de la synchronisation GitHub: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de la synchronisation GitHub: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});
