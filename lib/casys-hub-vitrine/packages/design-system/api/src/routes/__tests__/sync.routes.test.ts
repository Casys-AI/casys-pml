import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import syncRoutes from '../sync/index';

// Mocks
const mockSyncArticlesUseCase = {
  execute: vi.fn(),
};

function buildApp(withSyncUseCase = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const useCases: Record<string, unknown> = {};
    if (withSyncUseCase) useCases.syncArticlesFromGithubUseCase = mockSyncArticlesUseCase;

    ctxSetUnsafe(c, 'useCases', useCases as any);
    ctxSetUnsafe(
      c,
      'createApiResponse',
      (success: boolean, data: unknown, message?: string) => ({
        success,
        data,
        message,
      })
    );
    await next();
  });
  app.route('/api/sync', syncRoutes);
  return app;
}

describe('Sync Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/sync/github', () => {
    const validRequest = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
    };

    it('should return 400 for invalid request body', async () => {
      const app = buildApp();
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when tenantId is missing', async () => {
      const app = buildApp();
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test-project' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when projectId is missing', async () => {
      const app = buildApp();
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'test-tenant' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when tenantId is empty string', async () => {
      const app = buildApp();
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: '', projectId: 'test' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when projectId is empty string', async () => {
      const app = buildApp();
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'test', projectId: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 500 when syncArticlesFromGithubUseCase not available', async () => {
      const app = buildApp(false);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('SyncArticlesFromGithubUseCase indisponible');
    });

    it('should return 500 when use case execute is not a function', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        ctxSetUnsafe(c, 'useCases', { syncArticlesFromGithubUseCase: {} } as any);
        ctxSetUnsafe(
          c,
          'createApiResponse',
          (success: boolean, data: unknown, message?: string) => ({
            success,
            data,
            message,
          })
        );
        await next();
      });
      app.route('/api/sync', syncRoutes);

      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('should return 200 with sync results on success with all articles indexed', async () => {
      const mockResult = {
        success: true,
        indexed: 5,
        updated: 0,
        skipped: 0,
        indexedArticleIds: ['article-1', 'article-2', 'article-3', 'article-4', 'article-5'],
        updatedArticleIds: [],
        skippedArticleIds: [],
        errors: [],
        message: 'Successfully synced 5 articles',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockResult);
      expect(body.message).toBe('Successfully synced 5 articles');

      expect(mockSyncArticlesUseCase.execute).toHaveBeenCalledWith('test-tenant', 'test-project');
    });

    it('should return 200 with sync results on success with mixed operations', async () => {
      const mockResult = {
        success: true,
        indexed: 2,
        updated: 3,
        skipped: 1,
        indexedArticleIds: ['new-1', 'new-2'],
        updatedArticleIds: ['existing-1', 'existing-2', 'existing-3'],
        skippedArticleIds: ['unchanged-1'],
        errors: [],
        message: 'Synced 2 new, updated 3, skipped 1',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.indexed).toBe(2);
      expect(body.data.updated).toBe(3);
      expect(body.data.skipped).toBe(1);
    });

    it('should return 200 with sync results when no articles to sync', async () => {
      const mockResult = {
        success: true,
        indexed: 0,
        updated: 0,
        skipped: 0,
        indexedArticleIds: [],
        updatedArticleIds: [],
        skippedArticleIds: [],
        errors: [],
        message: 'No articles to sync',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.indexed).toBe(0);
      expect(body.message).toBe('No articles to sync');
    });

    it('should handle partial success with some errors', async () => {
      const mockResult = {
        success: true,
        indexed: 3,
        updated: 1,
        skipped: 0,
        indexedArticleIds: ['article-1', 'article-2', 'article-3'],
        updatedArticleIds: ['article-4'],
        skippedArticleIds: [],
        errors: [new Error('Failed to process article-5')],
        message: 'Partially synced: 4 successful, 1 error',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.errors).toHaveLength(1);
      expect(body.data.indexed).toBe(3);
      expect(body.data.updated).toBe(1);
    });

    it('should handle complete failure', async () => {
      const mockResult = {
        success: false,
        indexed: 0,
        updated: 0,
        skipped: 0,
        indexedArticleIds: [],
        updatedArticleIds: [],
        skippedArticleIds: [],
        errors: [new Error('GitHub API unavailable'), new Error('Network timeout')],
        message: 'Sync failed: GitHub API unavailable',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.data.errors).toHaveLength(2);
    });

    it('should handle use case execution errors', async () => {
      mockSyncArticlesUseCase.execute.mockRejectedValue(new Error('Unexpected sync error'));

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Sync échouée');
      expect(body.message).toBe('Unexpected sync error');
    });

    it('should handle non-Error exceptions', async () => {
      mockSyncArticlesUseCase.execute.mockRejectedValue('String error');

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toBe('String error');
    });

    it('should include optional article IDs arrays when provided', async () => {
      const mockResult = {
        success: true,
        indexed: 1,
        updated: 1,
        skipped: 1,
        indexedArticleIds: ['new-article-id'],
        updatedArticleIds: ['updated-article-id'],
        skippedArticleIds: ['skipped-article-id'],
        errors: [],
        message: 'Sync completed',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.indexedArticleIds).toEqual(['new-article-id']);
      expect(body.data.updatedArticleIds).toEqual(['updated-article-id']);
      expect(body.data.skippedArticleIds).toEqual(['skipped-article-id']);
    });

    it('should work without optional article IDs arrays', async () => {
      const mockResult = {
        success: true,
        indexed: 2,
        updated: 0,
        skipped: 0,
        errors: [],
        message: 'Sync completed without detailed IDs',
      };
      mockSyncArticlesUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true);
      const res = await app.request('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.indexed).toBe(2);
      expect(body.data.indexedArticleIds).toBeUndefined();
    });
  });
});
