import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import scanRouter from '../scan';

// Mocks
const mockAnalyzeUseCase = { execute: vi.fn() };
const mockListUseCase = { listArticlesByProject: vi.fn() };

function buildApp(withAnalyze = true, withList = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const useCases: Record<string, unknown> = {};
    if (withAnalyze) useCases.analyzeExistingArticleUseCase = mockAnalyzeUseCase;
    if (withList) useCases.listArticlesUseCase = mockListUseCase;

    ctxSetUnsafe(c, 'useCases', useCases as any);
    // Set createApiResponse directly on context (not nested in shared)
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
  app.route('/api/scan', scanRouter);
  return app;
}

describe('API /api/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/scan/analyze', () => {
    it('400 si schéma invalide', async () => {
      const app = buildApp();
      const res = await app.request('/api/scan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      });
      expect(res.status).toBe(400);
    });

    it('500 si use case indisponible', async () => {
      const app = buildApp(false, true);
      const res = await app.request('/api/scan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 't', projectId: 'p', articleId: 'a' }),
      });
      expect(res.status).toBe(500);
    });

    it('200 avec succès', async () => {
      mockAnalyzeUseCase.execute.mockResolvedValueOnce({ success: true, articleId: 'a1' });
      const app = buildApp(true, true);
      const res = await app.request('/api/scan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 't', projectId: 'p', articleId: 'a1' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockAnalyzeUseCase.execute).toHaveBeenCalledWith({
        tenantId: 't',
        projectId: 'p',
        articleId: 'a1',
        dryRun: undefined,
      });
    });
  });

  describe('POST /api/scan/analyze-project', () => {
    it('500 si listArticlesUseCase indisponible', async () => {
      const app = buildApp(true, false);
      const res = await app.request('/api/scan/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 't', projectId: 'p' }),
      });
      expect(res.status).toBe(500);
    });

    it('200 et respecte limit', async () => {
      mockListUseCase.listArticlesByProject.mockResolvedValueOnce({
        indexedArticleIds: ['a1', 'a2', 'a3'],
      });
      mockAnalyzeUseCase.execute.mockResolvedValue({ success: true });

      const app = buildApp(true, true);
      const res = await app.request('/api/scan/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 't', projectId: 'p', limit: 2 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.analyzed).toBe(2);
      expect(mockAnalyzeUseCase.execute).toHaveBeenCalledTimes(2);
      expect(mockAnalyzeUseCase.execute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          tenantId: 't',
          projectId: 'p',
          articleId: 'a1',
          dryRun: undefined,
        })
      );
      expect(mockAnalyzeUseCase.execute).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          tenantId: 't',
          projectId: 'p',
          articleId: 'a2',
          dryRun: undefined,
        })
      );
    });
  });
});
