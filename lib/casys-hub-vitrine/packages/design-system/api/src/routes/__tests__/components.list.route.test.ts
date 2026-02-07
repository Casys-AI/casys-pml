import { Hono } from 'hono';
import { describe, expect,it } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import listRoute from '../components/list';

function appWithList(useCase?: { execute: (params: unknown) => Promise<unknown> }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (useCase) {
      ctxSetUnsafe(c, 'useCases', { listComponentsUseCase: useCase } as any);
    }
    ctxSetUnsafe(c, 'shared', { dtos: { api: { createResponse: (s: boolean, d?: unknown, m?: string) => ({ success: s, data: d, message: m }) } } });
    await next();
  });
  app.route('/components', listRoute);
  return app;
}

describe('GET /components/list', () => {
  it('200 success avec paramètres par défaut', async () => {
    const app = appWithList({
      async execute(params) {
        expect(params).toMatchObject({ limit: 20, offset: 0 });
        return { count: 1, items: [{ id: 'c1' }] };
      },
    });
    const res = await app.request('/components/list');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(1);
  });

  it('200 success avec paramètres fournis', async () => {
    const app = appWithList({
      async execute(params) {
        expect(params).toMatchObject({ limit: 5, offset: 10, search: 'btn' });
        return { count: 0, items: [] };
      },
    });
    const res = await app.request('/components/list?limit=5&offset=10&search=btn');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(0);
  });

  it('500 en cas de validation invalide', async () => {
    // en envoyant des valeurs non parseables (ex: limit négatif), Zod va throw -> catch 500
    const app = appWithList({ execute: async () => ({ count: 0, items: [] }) });
    const res = await app.request('/components/list?limit=-1');
    expect(res.status).toBe(500);
  });
});
