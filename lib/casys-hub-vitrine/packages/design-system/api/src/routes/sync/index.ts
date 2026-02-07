import { zValidator } from '@hono/zod-validator';
import { Hono, type ContextVariableMap } from 'hono';
import { z } from 'zod';

import { createLogger } from '../../utils/logger';

const logger = createLogger('SyncRoutes');

interface SyncBindings {
  Variables: Pick<ContextVariableMap, 'createApiResponse' | 'useCases'>;
}

const syncSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
});

type SyncBody = z.infer<typeof syncSchema>;

export const syncRoutes = new Hono<SyncBindings>();

// POST /api/sync/github
syncRoutes.post('/github', zValidator('json', syncSchema), async c => {
  try {
    const { tenantId, projectId } = c.req.valid('json') as SyncBody;
    const createApiResponse = c.get('createApiResponse');

    const useCases = c.get('useCases') as Record<string, unknown>;
    const syncUc = useCases.syncArticlesFromGithubUseCase as
      | { execute: (tenantId: string, projectId: string) => Promise<{
          success: boolean;
          indexed: number;
          updated: number;
          skipped: number;
          indexedArticleIds?: string[];
          updatedArticleIds?: string[];
          skippedArticleIds?: string[];
          errors: Error[];
          message: string;
        }> }
      | undefined;

    if (!syncUc || typeof syncUc.execute !== 'function') {
      const resp = createApiResponse(
        false,
        null,
        'SyncArticlesFromGithubUseCase indisponible'
      );
      return c.json(resp, 500);
    }

    logger.log(`🔄 Sync GitHub → Kuzu start`, { tenantId, projectId });
    const result = await syncUc.execute(tenantId, projectId);
    // Harmonized response: no misleading 'error' field on success
    return c.json({ success: result.success, data: result, message: result.message }, 200);
  } catch (e) {
    logger.error('❌ Erreur sync GitHub', e);
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ success: false, error: 'Sync échouée', message }, 500);
  }
});

export default syncRoutes;
