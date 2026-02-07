import { Hono } from 'hono';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import listRouter from '../content/index';

// Mock des services pour tester les branches
const mockListArticlesUseCase = {
  execute: vi.fn(),
  listAllArticles: vi.fn(),
};

function buildApp(withServices = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (withServices) {
      ctxSetUnsafe(c, 'useCases', { listArticlesUseCase: mockListArticlesUseCase } as any);
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
  app.route('/api/content', listRouter);
  return app;
}

describe('API /api/content/list (branches)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/content/articles -> 200 avec paramètres par défaut', async () => {
    mockListArticlesUseCase.listAllArticles = vi.fn().mockResolvedValueOnce({ indexedCount: 0, articles: [] });
    const app = buildApp();
    const res = await app.request('/api/content/articles');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/content/articles -> 500 si service absent', async () => {
    const app = buildApp(false); // sans services
    const res = await app.request('/api/content/articles');
    expect(res.status).toBe(500);
  });

  it('GET /api/content/articles -> 500 si service jette une erreur', async () => {
    mockListArticlesUseCase.listAllArticles = vi.fn().mockRejectedValueOnce(new Error('Database error'));
    const app = buildApp();
    const res = await app.request('/api/content/articles');
    expect(res.status).toBe(500);
  });

  it('GET /api/content/articles -> 200 avec résultats', async () => {
    mockListArticlesUseCase.listAllArticles = vi.fn().mockResolvedValueOnce({
      indexedCount: 2,
      articles: [
        { id: '1', title: 'Article 1' },
        { id: '2', title: 'Article 2' },
      ]
    });
    const app = buildApp();
    const res = await app.request('/api/content/articles');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/content/articles -> 200 liste vide', async () => {
    mockListArticlesUseCase.listAllArticles = vi.fn().mockResolvedValueOnce({ indexedCount: 0, articles: [] });
    const app = buildApp();
    const res = await app.request('/api/content/articles');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});