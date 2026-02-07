import { zValidator } from '@hono/zod-validator';
import { Hono, type ContextVariableMap } from 'hono';
import { z } from 'zod';

import type { AnalyzeExistingArticlePort } from '@casys/core';

import { createLogger } from '../../utils/logger';

const logger = createLogger('ScanRoutes');

interface ScanBindings {
  Variables: Pick<ContextVariableMap, 'createApiResponse' | 'useCases'>;
}

// Zod schema for analyze-existing request
const analyzeSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  articleId: z.string().min(1),
  dryRun: z.boolean().optional(),
});

type AnalyzeBody = z.infer<typeof analyzeSchema>;

export const scanRoutes = new Hono<ScanBindings>();

// POST /api/scan/analyze
scanRoutes.post('/analyze', zValidator('json', analyzeSchema), async c => {
  try {
    const { tenantId, projectId, articleId, dryRun } = c.req.valid('json') as AnalyzeBody;
    const createApiResponse = c.get('createApiResponse');

    const useCases = c.get('useCases') as Record<string, unknown>;
    const uc = useCases.analyzeExistingArticleUseCase as AnalyzeExistingArticlePort | undefined;

    if (!uc) {
      const resp = createApiResponse(
        false,
        null,
        'AnalyzeExistingArticleUseCase indisponible'
      );
      return c.json(resp, 500);
    }

    // Ne pas contrôler la sync depuis l'API: déléguer au use case (défaut: pas de sync)
    const result = await uc.execute({ tenantId, projectId, articleId, dryRun });

    // Diagnostic: tracer la forme du résultat pour détecter d'éventuels objets non sérialisables
    try {
      const preview = (() => {
        try {
          return JSON.stringify(result)?.slice(0, 500);
        } catch {
          return '[unserializable-result]';
        }
      })();
      logger.debug('[ScanRoutes] analyze result', {
        resultType: typeof result,
        preview,
      });
    } catch {
      // ignore preview errors
    }

    // Protéger createResponse pour identifier si la fabrique jette une erreur
    let resp: Record<string, unknown>;
    try {
      resp = createApiResponse(true, result, 'Analyse article terminée');
    } catch (err) {
      const em = err instanceof Error ? err.message : String(err);
      logger.error('[ScanRoutes] createResponse failed', {
        message: em,
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
    return c.json(resp, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    logger.error('❌ Erreur analyse article', { message, stack });
    return c.json({ success: false, error: 'Analyse échouée', message }, 500);
  }
});

// Zod schema for analyze-project request
const analyzeProjectSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  limit: z.number().int().positive().optional(),
  dryRun: z.boolean().optional(),
});

type AnalyzeProjectBody = z.infer<typeof analyzeProjectSchema>;

// POST /api/scan/analyze-project
scanRoutes.post('/analyze-project', zValidator('json', analyzeProjectSchema), async c => {
  try {
    const { tenantId, projectId, limit, dryRun } = c.req.valid('json') as AnalyzeProjectBody;
    const createApiResponse = c.get('createApiResponse');

    const useCases = c.get('useCases') as Record<string, unknown>;
    const analyzeUc = useCases.analyzeExistingArticleUseCase as AnalyzeExistingArticlePort | undefined;
    const listUc = useCases.listArticlesUseCase as
      | {
          listArticlesByProject: (
            tenantId: string,
            projectId: string
          ) => Promise<{ indexedArticleIds: string[] }>;
        }
      | undefined;

    if (!analyzeUc || typeof analyzeUc.execute !== 'function') {
      const resp = createApiResponse(
        false,
        null,
        'AnalyzeExistingArticleUseCase indisponible'
      );
      return c.json(resp, 500);
    }
    if (!listUc || typeof listUc.listArticlesByProject !== 'function') {
      const resp = createApiResponse(false, null, 'ListArticlesUseCase indisponible');
      return c.json(resp, 500);
    }

    const listing = await listUc.listArticlesByProject(tenantId, projectId);
    let ids = listing.indexedArticleIds ?? [];
    if (typeof limit === 'number' && limit > 0) ids = ids.slice(0, limit);
    // Log-level visibility of how many articles are indexed and how many will be analyzed
    logger.log('[ScanRoutes] Articles indexés (Kuzu)', {
      tenantId,
      projectId,
      totalIndexed: (listing.indexedArticleIds ?? []).length,
      selectedForAnalysis: ids.length,
    });

    let analyzed = 0;
    const successes: string[] = [];
    const failures: { articleId: string; error: string }[] = [];

    for (const articleId of ids) {
      try {
        // Important: ne pas re-synchroniser à chaque article
        await analyzeUc.execute({
          tenantId,
          projectId,
          articleId,
          dryRun,
          syncBefore: false,
          skipGithubRead: true,
        });
        analyzed++;
        successes.push(articleId);
      } catch (e) {
        failures.push({ articleId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const resp = createApiResponse(
      true,
      {
        analyzed,
        total: ids.length,
        successes,
        failures,
      },
      `Analyse projet terminée: ${analyzed}/${ids.length}`
    );
    return c.json(resp, 200);
  } catch (e) {
    logger.error('❌ Erreur analyse projet', e);
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ success: false, error: 'Analyse projet échouée', message }, 500);
  }
});

export default scanRoutes;
