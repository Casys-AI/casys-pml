import { type Context , Hono } from 'hono';
import { z } from 'zod';
import type { ApplicationServiceMap } from '@casys/application';

import { createLogger } from '../../utils/logger';

const logger = createLogger('ListComponentsRoutes');

const list = new Hono();

// Schema Zod pour valider les paramètres de liste
const listComponentsSchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).default(0),
  search: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
});

/**
 * GET /components/list
 * Liste les composants avec ListComponentsUseCase
 */
list.get('/list', async (c: Context) => {
  try {
    // 1. Validation des paramètres de requête
    const queryParams = c.req.query();
    const validatedParams = listComponentsSchema.parse({
      limit: queryParams.limit ? parseInt(queryParams.limit) : 20,
      offset: queryParams.offset ? parseInt(queryParams.offset) : 0,
      search: queryParams.search,
      category: queryParams.category,
      subcategory: queryParams.subcategory,
      tags: queryParams.tags ? queryParams.tags.split(',') : undefined,
      useCases: queryParams.useCases ? queryParams.useCases.split(',') : undefined,
    });

    logger.log('📋 Liste des composants demandée:', validatedParams);

    // 2. Récupération des services depuis le contexte
    const useCases = c.get('useCases') as ApplicationServiceMap;
    const listComponentsUseCaseCandidate: unknown = useCases.listComponentsUseCase;
    const sharedServicesCandidate: unknown = c.get('shared');

    // Assert sharedServices shape
    const hasApiFactory =
      !!sharedServicesCandidate &&
      typeof sharedServicesCandidate === 'object' &&
      'dtos' in (sharedServicesCandidate as Record<string, unknown>) &&
      typeof (
        sharedServicesCandidate as {
          dtos?: { api?: { createResponse?: unknown } };
        }
      ).dtos?.api?.createResponse === 'function';
    if (!hasApiFactory) {
      logger.error('❌ Services partagés non disponibles');
      return c.json({ success: false, error: 'Service non disponible' }, 500);
    }
    const sharedServices = sharedServicesCandidate as {
      dtos: { api: { createResponse: (ok: boolean, data: unknown, msg?: string) => unknown } };
    };

    // Assert use case contract
    if (
      !listComponentsUseCaseCandidate ||
      typeof listComponentsUseCaseCandidate !== 'object' ||
      typeof (listComponentsUseCaseCandidate as { execute?: unknown }).execute !== 'function'
    ) {
      logger.error('❌ Use case non disponible');
      return c.json(sharedServices.dtos.api.createResponse(false, null, 'Service non disponible'), 500);
    }
    const listComponentsUseCase = listComponentsUseCaseCandidate as {
      execute: (input: unknown) => Promise<{ count: number } & Record<string, unknown>>;
    };

    // 3. Exécution du use case
    logger.log('📋 Appel de ListComponentsUseCase...');
    const result = await listComponentsUseCase.execute(validatedParams);

    logger.log(`✅ ${result.count} composants récupérés`);

    // 4. Formatage de la réponse avec le DTO standard
    // Le `result` est déjà un ComponentListResponseDTO, on peut le passer directement.
    const response = sharedServices.dtos.api.createResponse(
      true,
      result,
      `${result.count} composants trouvés` // Utilisation de result.count au lieu de result.total
    );

    return c.json(response);
  } catch (error: unknown) {
    logger.error('❌ Erreur lors de la validation ou du listing:', error);
    const sharedServices = c.get('shared');
    const response = sharedServices
      ? sharedServices.dtos.api.createResponse(
          false,
          null,
          `Erreur interne: ${error instanceof Error ? error.message : ''}`
        )
      : { success: false, error: 'Erreur interne du serveur' };

    return c.json(response, 500);
  }
});

export default list;
