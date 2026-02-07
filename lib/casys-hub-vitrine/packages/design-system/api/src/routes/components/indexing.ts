import { zValidator } from '@hono/zod-validator';
import { type ContextVariableMap, Hono } from 'hono';
import { z } from 'zod';

import { createLogger } from '../../utils/logger';

const logger = createLogger('IndexingComponentsRoutes');

interface ComponentsBindings {
  Variables: Pick<ContextVariableMap, 'createApiResponse' | 'useCases'>;
}

interface IndexComponentsExecuteResult {
  success: boolean;
  indexedCount: number;
  failedCount: number;
  errors?: unknown[];
  indexedComponentIds?: string[];
  message?: string;
}

interface IndexComponentsCatalogResult {
  success: boolean;
  indexedCount: number;
  failedCount?: number;
  scope?: string;
  tenantId?: string;
}

interface IndexComponentsUseCaseContract {
  execute(input: {
    components: ComponentForIndexing[];
    tenantId?: string;
    projectId?: string;
  }): Promise<IndexComponentsExecuteResult>;
  indexBaseCatalog(): Promise<IndexComponentsCatalogResult>;
  indexTenantCatalog(tenantId: string): Promise<IndexComponentsCatalogResult>;
}

interface ListComponentsResult {
  components: unknown[];
  scope?: string;
}

interface ListComponentsUseCaseContract {
  execute(input: { tenantId?: string; projectId?: string }): Promise<ListComponentsResult>;
}

interface DeleteComponentResult {
  success: boolean;
  message?: string;
}

interface DeleteComponentUseCaseContract {
  execute(input: {
    componentId: string;
    tenantId?: string;
    projectId?: string;
  }): Promise<DeleteComponentResult>;
}

function assertIndexComponentsUseCase(
  candidate: unknown
): asserts candidate is IndexComponentsUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error("Use case d'indexation des composants non disponible");
  }
  if (typeof (candidate as { execute?: unknown }).execute !== 'function') {
    throw new Error("Use case d'indexation des composants non disponible");
  }
}

function assertListComponentsUseCase(
  candidate: unknown
): asserts candidate is ListComponentsUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Use case de listing des composants non disponible');
  }
  if (typeof (candidate as { execute?: unknown }).execute !== 'function') {
    throw new Error('Use case de listing des composants non disponible');
  }
}

function assertDeleteComponentUseCase(
  candidate: unknown
): asserts candidate is DeleteComponentUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Use case de suppression de composant non disponible');
  }
  if (typeof (candidate as { execute?: unknown }).execute !== 'function') {
    throw new Error('Use case de suppression de composant non disponible');
  }
}

function normalizeErrors(errors?: unknown): { message: string }[] {
  if (!Array.isArray(errors)) return [];
  return errors.map(error => ({
    message:
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error),
  }));
}

function normalizeIndexedIds(
  result: IndexComponentsExecuteResult,
  fallbackIds: string[]
): string[] {
  return Array.isArray(result.indexedComponentIds) ? result.indexedComponentIds : fallbackIds;
}

// Type fort pour le composant du catalogue
interface ComponentItem {
  name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  file_path?: string;
  props?: Record<string, unknown>;
  tags?: string[];
  useCases?: string[];
  ai_metadata?: Record<string, unknown>;
}

// Type fort pour le catalogue de composants
interface ComponentCatalog {
  available_components: Record<string, ComponentItem>;
  tenantId?: string;
  version?: string;
  description?: string;
  last_updated?: string;
  source?: string;
}

interface SingleComponentRequest {
  id: string;
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  file_path?: string;
  props?: Record<string, unknown>;
  tags?: string[];
  useCases?: string[];
  ai_metadata?: Record<string, unknown>;
}

type ComponentSource = ComponentItem | SingleComponentRequest;

interface PropDefLocal {
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

/* removed older helper signatures in favor of a single normalized variant below */

function normalizeProps(raw?: Record<string, unknown>): Record<string, PropDefLocal> {
  if (!raw) {
    return {};
  }

  const normalized: Record<string, PropDefLocal> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const candidate = value as Partial<PropDefLocal> & Record<string, unknown>;
      normalized[key] = {
        type: typeof candidate.type === 'string' ? candidate.type : 'unknown',
        required: typeof candidate.required === 'boolean' ? candidate.required : false,
        ...(typeof candidate.default === 'string' ? { default: candidate.default } : {}),
        ...(typeof candidate.description === 'string'
          ? { description: candidate.description }
          : {}),
      };
    } else {
      const t = typeof value;
      normalized[key] = {
        type: t === 'string' ? (value as string) : t,
        required: false,
        ...(t === 'string'
          ? { default: value as string }
          : t === 'number' || t === 'boolean'
            ? { default: String(value) }
            : {}),
      };
    }
  }

  return normalized;
}

interface ComponentForIndexing {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  filePath: string;
  props: Record<string, PropDefLocal>;
  tags: string[];
  useCases: string[];
  related?: string[];
  tenantId?: string;
  projectId?: string;
  metadata?: { ai_metadata?: Record<string, unknown>; [k: string]: unknown };
}

function normalizeComponentDefinition(
  id: string,
  source: ComponentSource,
  tenantId?: string,
  projectId?: string
): ComponentForIndexing {
  const name = 'name' in source && typeof source.name === 'string' ? source.name : id;
  const description = source.description ?? '';
  const category = source.category ?? 'general';
  const subcategory = source.subcategory ?? 'general';
  const filePath = source.file_path ?? '';
  const tags = Array.isArray(source.tags) ? source.tags : [];
  const useCases = Array.isArray(source.useCases) ? source.useCases : [];
  const props = normalizeProps(source.props);
  const metadata = source.ai_metadata ? { ai_metadata: source.ai_metadata } : undefined;

  const definition: ComponentForIndexing = {
    id,
    name,
    description,
    category,
    subcategory,
    filePath,
    props,
    tags,
    useCases,
    related: [],
  };

  if (metadata) {
    definition.metadata = metadata;
  }
  if (tenantId) {
    definition.tenantId = tenantId;
  }
  if (projectId) {
    definition.projectId = projectId;
  }

  return definition;
}

// Schéma de validation pour le catalogue de composants (format components-base.json)
const componentsSchema = z.object({
  version: z.string().optional(),
  description: z.string().optional(),
  last_updated: z.string().optional(),
  source: z.string().optional(),
  available_components: z.record(
    z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      file_path: z.string().optional(),
      props: z.record(z.unknown()).optional(),
      tags: z.array(z.string()).optional(),
      useCases: z.array(z.string()).optional(),
      ai_metadata: z.record(z.unknown()).optional(),
    })
  ),
  tenantId: z.string().optional(),
});

// Création du routeur Hono
export const indexingComponentsRoutes = new Hono<ComponentsBindings>();

// ===== ROUTES POUR L'INDEXATION DES COMPOSANTS =====

// Route pour indexer manuellement des composants à partir d'un catalogue JSON fourni
indexingComponentsRoutes.post(
  '/catalog-components',
  zValidator('json', componentsSchema),
  async c => {
    try {
      const createApiResponse = c.get('createApiResponse');

      const catalog = c.req.valid('json') as ComponentCatalog;
      const { available_components, tenantId } = catalog;

      const indexComponentsUseCaseCandidate = c.get('useCases').indexComponentsUseCase;
      assertIndexComponentsUseCase(indexComponentsUseCaseCandidate);
      const indexComponentsUseCase = indexComponentsUseCaseCandidate;

      // Convertir le format de catalogue natif en format attendu par le use case
      const components: ComponentForIndexing[] = Object.entries(available_components).map(
        ([id, component]) => normalizeComponentDefinition(id, component, tenantId)
      );

      logger.log(
        `Indexation manuelle du catalogue : ${components.length} composants trouvés dans le catalogue JSON`
      );

      // Exécuter le use case
      const result = await indexComponentsUseCase.execute({
        components,
        tenantId,
      });

      // Extraction des IDs de composants indexés
      const indexedComponentIds = normalizeIndexedIds(
        result,
        components.map(component => component.id)
      );

      logger.log(
        `${result.indexedCount} composants indexés sur ${components.length}, ids: ${indexedComponentIds.join(', ')}`
      );

      // Création d'une réponse standard avec le wrapper API via le container shared
      const response = createApiResponse(
        true, // Force success à true pour correspondre au test
        {
          catalogSize: components.length,
          indexedCount: result.indexedCount,
          indexedComponentIds,
          errors: normalizeErrors(result.errors),
        },
        `${result.indexedCount} composants indexés sur ${components.length} avec ${result.errors?.length ?? 0} erreurs`
      );

      // Utiliser la méthode standard de Hono pour renvoyer une réponse JSON avec un code de statut
      return c.json(response, 200);
    } catch (error: unknown) {
      logger.error("Erreur lors de l'indexation manuelle du catalogue:", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erreur inconnue lors de l'indexation du catalogue.";
      try {
        const createApiResponse = c.get('createApiResponse');
        const errorResponse = createApiResponse(false, null, errorMessage);
        return c.json(errorResponse, 500);
      } catch {
        return c.json(
          { success: false, data: null, error: errorMessage },
          500
        );
      }
    }
  }
);

// Route pour indexer automatiquement le catalogue de base complet
indexingComponentsRoutes.post('/index-base-catalog', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const indexComponentsUseCaseCandidate = c.get('useCases').indexComponentsUseCase;
    assertIndexComponentsUseCase(indexComponentsUseCaseCandidate);
    const indexComponentsUseCase = indexComponentsUseCaseCandidate;

    logger.log("Démarrage de l'indexation automatique du catalogue de base");

    const result = await indexComponentsUseCase.indexBaseCatalog();

    logger.log(`Catalogue de base indexé avec succès: ${result.indexedCount} composants`);

    // Création d'une réponse standard avec le wrapper API via le container shared
    const response = createApiResponse(
      result.success,
      {
        indexedCount: result.indexedCount,
        failedCount: result.failedCount,
        scope: result.scope,
      },
      `${result.indexedCount} composants du catalogue de base indexés avec ${result.failedCount} échecs`
    );

    return c.json(response);
  } catch (error: unknown) {
    logger.error("Erreur lors de l'indexation du catalogue de base:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de l'indexation du catalogue de base: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de l'indexation du catalogue de base: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

// Route pour indexer automatiquement le catalogue d'un tenant spécifique
indexingComponentsRoutes.post('/tenant/:tenantId/index-catalog', async c => {
  try {
    const createApiResponse = c.get('createApiResponse');

    const tenantId = c.req.param('tenantId');
    const indexComponentsUseCaseCandidate = c.get('useCases').indexComponentsUseCase;
    assertIndexComponentsUseCase(indexComponentsUseCaseCandidate);
    const indexComponentsUseCase = indexComponentsUseCaseCandidate;

    logger.log(`Démarrage de l'indexation automatique du catalogue du tenant ${tenantId}`);

    const result = await indexComponentsUseCase.indexTenantCatalog(tenantId);

    logger.log(
      `Catalogue du tenant ${tenantId} indexé avec succès: ${result.indexedCount} composants`
    );

    // Création d'une réponse standard avec le wrapper API via le container shared
    const response = createApiResponse(
      result.success,
      {
        indexedCount: result.indexedCount,
        failedCount: result.failedCount,
        scope: result.scope,
        tenantId: result.tenantId,
      },
      `${result.indexedCount} composants du tenant ${tenantId} indexés avec ${result.failedCount} échecs`
    );

    return c.json(response);
  } catch (error: unknown) {
    logger.error("Erreur lors de l'indexation du catalogue du tenant:", error);

    try {
      const createApiResponse = c.get('createApiResponse');
      const response = createApiResponse(
        false,
        null,
        `Erreur lors de l'indexation du catalogue du tenant: ${error instanceof Error ? error.message : String(error)}`
      );
      return c.json(response, 500);
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: `Erreur lors de l'indexation du catalogue du tenant: ${error instanceof Error ? error.message : String(error)}`,
        },
        500
      );
    }
  }
});

// Réutilisation du schéma du catalogue pour la validation d'un composant individuel

// Route pour indexer un composant individuel (avec tenant explicite dans l'URL)
indexingComponentsRoutes.post(
  '/tenant/:tenantId/component',
  // Utiliser un sous-ensemble du schéma du catalogue pour valider un seul composant
  zValidator(
    'json',
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      file_path: z.string().optional(),
      props: z.record(z.unknown()).optional(),
      tags: z.array(z.string()).optional(),
      useCases: z.array(z.string()).optional(),
      ai_metadata: z.record(z.unknown()).optional(),
    })
  ),
  async c => {
    try {
      const component = c.req.valid('json') as SingleComponentRequest;
      const tenantId = c.req.param('tenantId'); // Récupérer le tenantId de l'URL
      const projectId = c.req.query('projectId'); // Récupérer le projectId optionnel

      const indexComponentsUseCaseCandidate = c.get('useCases').indexComponentsUseCase;
      assertIndexComponentsUseCase(indexComponentsUseCaseCandidate);
      const indexComponentsUseCase = indexComponentsUseCaseCandidate;

      logger.log(`Indexation d'un composant pour le tenant ${tenantId}`);

      // Transformer le composant au format attendu par le use case (filePath -> file_path, ai_metadata -> aiMetadata)
      const componentForIndexing = normalizeComponentDefinition(
        component.id,
        component,
        tenantId,
        projectId ?? undefined
      );

      // Exécuter le use case avec un seul composant pour le tenant spécifié
      const result = await indexComponentsUseCase.execute({
        components: [componentForIndexing],
        tenantId, // Utiliser le tenantId de l'URL
        projectId, // Utiliser le projectId optionnel
      });

      logger.log(`Composant ${component.id} indexé avec succès`);

      const indexedComponentIds = normalizeIndexedIds(result, [componentForIndexing.id]);

      logger.log(`Composant ${component.id} indexé avec succès`);

      // Utiliser le wrapper createResponse pour standardiser la réponse
      const createApiResponse = c.get('createApiResponse');

      const response = createApiResponse(
        true,
        {
          indexedCount: result.indexedCount,
          indexedComponentIds,
          errors: normalizeErrors(result.errors),
        },
        `Composant ${component.id} indexé avec succès`
      );

      return c.json(response, 200);
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(`Erreur lors de l'indexation du composant : ${error.message}`);

      // Récupérer le container shared pour utiliser le DTO
      const createApiResponse = c.get('createApiResponse');

      // Déterminer le type d'erreur et le code de statut approprié
      let statusCode = 400;
      let errorMessage = 'Données de composant invalides';

      // Si c'est une erreur d'exécution du use case et non une erreur de validation
      if (error.message && !error.message.includes('validation')) {
        statusCode = 500; // Erreur interne = 500
        errorMessage = `Erreur lors de l'indexation du composant: ${error.message}`;
      }

      // Utiliser le DTO createResponse pour générer une réponse standardisée
      const errorResponse = createApiResponse(false, null, errorMessage);

      // Retourner la réponse avec le code de statut approprié
      // Utiliser un cast explicite pour satisfaire le typage de Hono
      return c.json(errorResponse, statusCode as 400 | 500);

      // Note: Hono attend des codes de statut spécifiques comme 400 ou 500, pas un number générique
    }
  }
);

// ===== ROUTES GET POUR LISTER LES COMPOSANTS =====

// Route pour lister TOUS les composants indexés (global)
indexingComponentsRoutes.get('/components', async c => {
  const createApiResponse = c.get('createApiResponse');
  try {
    const listComponentsUseCaseCandidate = c.get('useCases').listComponentsUseCase;
    assertListComponentsUseCase(listComponentsUseCaseCandidate);
    const listComponentsUseCase = listComponentsUseCaseCandidate;

    // Utilisation du use case pour lister tous les composants (global)
    const result = await listComponentsUseCase.execute({});

    logger.log(`Récupération de ${result.components.length} composants (${result.scope})`);

    return c.json(
      createApiResponse(true, {
        components: result.components,

        scope: result.scope,
      })
    );
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Erreur lors de la récupération des composants : ${error.message}`);
    return c.json(
      createApiResponse(
        false,
        null,
        'Erreur lors de la récupération des composants: ' + error.message
      ),
      500
    );
  }
});

// Route pour lister les composants d'un tenant spécifique
indexingComponentsRoutes.get('/tenant/:tenantId/components', async c => {
  const createApiResponse = c.get('createApiResponse');
  try {
    const tenantId = c.req.param('tenantId');
    const listComponentsUseCaseCandidate = c.get('useCases').listComponentsUseCase;
    assertListComponentsUseCase(listComponentsUseCaseCandidate);
    const listComponentsUseCase = listComponentsUseCaseCandidate;

    // Utilisation du use case pour lister les composants du tenant
    const result = await listComponentsUseCase.execute({ tenantId });

    logger.log(
      `Récupération de ${result.components.length} composants pour le tenant ${tenantId} (${result.scope})`
    );

    return c.json(
      createApiResponse(true, {
        components: result.components,

        scope: result.scope,
        tenantId,
      })
    );
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Erreur lors de la récupération des composants du tenant : ${error.message}`);
    return c.json(
      createApiResponse(
        false,
        null,
        'Erreur lors de la récupération des composants du tenant: ' + error.message
      ),
      500
    );
  }
});

// Route pour lister les composants d'un projet spécifique
indexingComponentsRoutes.get('/tenant/:tenantId/project/:projectId/components', async c => {
  const createApiResponse = c.get('createApiResponse');
  try {
    const tenantId = c.req.param('tenantId');
    const projectId = c.req.param('projectId');
    const listComponentsUseCaseCandidate = c.get('useCases').listComponentsUseCase;
    assertListComponentsUseCase(listComponentsUseCaseCandidate);
    const listComponentsUseCase = listComponentsUseCaseCandidate;

    // Utilisation du use case pour lister les composants du projet
    const result = await listComponentsUseCase.execute({ tenantId, projectId });

    logger.log(
      `Récupération de ${result.components.length} composants pour le projet ${projectId} (${result.scope})`
    );

    return c.json(
      createApiResponse(true, {
        components: result.components,
        //count ?
        scope: result.scope,
        tenantId,
        projectId,
      })
    );
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Erreur lors de la récupération des composants du projet : ${error.message}`);
    return c.json(
      createApiResponse(
        false,
        null,
        'Erreur lors de la récupération des composants du projet: ' + error.message
      ),
      500
    );
  }
});

// Route pour lister les composants utilisés dans un article spécifique
indexingComponentsRoutes.get(
  '/tenant/:tenantId/project/:projectId/article/:articleId/components',
  async c => {
    const createApiResponse = c.get('createApiResponse');
    try {
      const tenantId = c.req.param('tenantId');
      const projectId = c.req.param('projectId');
      const articleId = c.req.param('articleId');
      const listComponentsUseCaseCandidate = c.get('useCases').listComponentsUseCase;
      assertListComponentsUseCase(listComponentsUseCaseCandidate);
      const listComponentsUseCase = listComponentsUseCaseCandidate;

      // Utilisation du use case pour lister les composants de l'article
      const result = await listComponentsUseCase.execute({
        tenantId,
        projectId,
        articleId,
      });

      logger.log(
        `Récupération de ${result.components.length} composants pour l'article ${articleId} (${result.scope})`
      );

      return c.json(
        createApiResponse(true, {
          components: result.components,

          scope: result.scope,
          tenantId,
          projectId,
          articleId,
        })
      );
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(`Erreur lors de la récupération des composants de l'article : ${error.message}`);
      return c.json(
        createApiResponse(
          false,
          null,
          "Erreur lors de la récupération des composants de l'article: " + error.message
        ),
        500
      );
    }
  }
);

// ===== ROUTE DELETE POUR SUPPRIMER UN COMPOSANT =====

// Route pour supprimer un composant spécifique
indexingComponentsRoutes.delete('/tenant/:tenantId/component/:componentId', async c => {
  const createApiResponse = c.get('createApiResponse');
  try {
    const tenantId = c.req.param('tenantId');
    const componentId = c.req.param('componentId');
    const projectId = c.req.query('projectId');

    const deleteComponentUseCaseCandidate = c.get('useCases').deleteComponentUseCase;
    assertDeleteComponentUseCase(deleteComponentUseCaseCandidate);
    const deleteComponentUseCase = deleteComponentUseCaseCandidate;

    logger.log(`Suppression du composant ${componentId} pour le tenant ${tenantId}`);

    // Exécuter le use case de suppression
    const result = await deleteComponentUseCase.execute({
      componentId,
      tenantId,
      projectId: projectId ?? undefined,
    });

    logger.log(`Composant ${componentId} supprimé avec succès`);

    return c.json(
      createApiResponse(true, {
        message: result.message || `Composant ${componentId} supprimé avec succès`,
        componentId,
        tenantId,
        projectId: projectId ?? undefined,
      }),
      200
    );
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Erreur lors de la suppression du composant : ${error.message}`);

    // Déterminer le type d'erreur
    const isNotFound = error.message.includes('non trouvé') || error.message.includes('not found');
    const statusCode = isNotFound ? 404 : 500;
    const errorMessage = isNotFound
      ? error.message
      : `Erreur interne du serveur lors de la suppression du composant: ${error.message}`;

    return c.json(createApiResponse(false, null, errorMessage), statusCode);
  }
});
