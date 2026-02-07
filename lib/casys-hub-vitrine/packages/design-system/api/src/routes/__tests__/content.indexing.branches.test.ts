import { Hono } from 'hono';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import indexingRouter from '../content/index';

// Mock des services pour tester les branches
const mockIndexArticlesUseCase = {
  execute: vi.fn(),
};

function buildApp(withServices = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (withServices) {
      ctxSetUnsafe(c, 'useCases', { indexArticlesUseCase: mockIndexArticlesUseCase } as any);
      const shared = {
        dtos: {
          api: {
            createResponse: (success: boolean, data: unknown, message?: string) => ({
              success,
              data,
              message,
            }),
          },
        },
      };
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    }
    await next();
  });
  app.route('/api/content', indexingRouter);
  return app;
}

describe('API /api/content/indexing (branches)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/content/articles -> 400 si body manquant', async () => {
    const app = buildApp();
    const res = await app.request('/api/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/content/articles -> 400 si schéma invalide', async () => {
    const app = buildApp();
    const res = await app.request('/api/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'schema' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/content/articles -> 500 si service absent', async () => {
    const app = buildApp(false); // sans services
    const res = await app.request('/api/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: [{
          article: { id: 'test', title: 'Test Article' },
        }],
      }),
    });
    expect(res.status).toBe(500);
  });

  it('POST /api/content/articles -> 500 si service jette une erreur', async () => {
    mockIndexArticlesUseCase.execute.mockRejectedValueOnce(new Error('Database error'));
    const app = buildApp();
    const res = await app.request('/api/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: [{
          article: { id: 'test', title: 'Test Article' },
        }],
      }),
    });
    expect(res.status).toBe(500);
  });

  it('POST /api/content/articles -> 200 si aucun item indexé', async () => {
    mockIndexArticlesUseCase.execute.mockResolvedValueOnce([]);
    const app = buildApp();
    const res = await app.request('/api/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: [{
          article: { id: 'test', title: 'Test Article' },
        }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('POST /api/content/articles -> 200 avec succès', async () => {
    mockIndexArticlesUseCase.execute.mockResolvedValueOnce([{ id: 'test', indexed: true }]);
    const app = buildApp();
    const res = await app.request('/api/content/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: [{
          article: { id: 'test', title: 'Test Article' },
        }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});