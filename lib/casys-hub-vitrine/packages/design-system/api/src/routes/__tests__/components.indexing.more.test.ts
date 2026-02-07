import { type Context, Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import { indexingComponentsRoutes as indexingRoutes } from '../components/indexing';

type MockFn = ReturnType<typeof vi.fn>;
interface DtoApi {
  createResponse: MockFn;
}
interface SharedContainer {
  dtos: { api: DtoApi };
}

function makeApp(setup: (c: Context) => void) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    setup(c);
    await next();
  });
  app.route('/', indexingRoutes);
  return app;
}

describe('Components Indexing - extra coverage', () => {
  let shared: SharedContainer;
  let indexUseCase: { execute: MockFn; indexBaseCatalog: MockFn; indexTenantCatalog: MockFn };
  let listUseCase: { execute: MockFn };

  beforeEach(() => {
    shared = {
      dtos: {
        api: {
          createResponse: vi.fn().mockImplementation((s, d, m) => ({
            success: s,
            data: d,
            message: m,
            error: s ? undefined : m,
          })),
        },
      },
    };
    indexUseCase = {
      execute: vi.fn(),
      indexBaseCatalog: vi.fn(),
      indexTenantCatalog: vi.fn(),
    };
    listUseCase = {
      execute: vi.fn(),
    };
  });

  it('POST /index-base-catalog -> 200', async () => {
    indexUseCase.indexBaseCatalog.mockResolvedValue({
      success: true,
      indexedCount: 3,
      failedCount: 0,
      scope: 'base',
    });
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { indexComponentsUseCase: indexUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    shared.dtos.api.createResponse.mockReturnValue({ success: true });
    const res = await app.request('/index-base-catalog', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(indexUseCase.indexBaseCatalog).toHaveBeenCalled();
  });

  it('POST /tenant/:tenantId/index-catalog -> 200', async () => {
    indexUseCase.indexTenantCatalog.mockResolvedValue({
      success: true,
      indexedCount: 2,
      failedCount: 0,
      scope: 'tenant',
      tenantId: 't1',
    });
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { indexComponentsUseCase: indexUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    shared.dtos.api.createResponse.mockReturnValue({ success: true });
    const res = await app.request('/tenant/t1/index-catalog', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(indexUseCase.indexTenantCatalog).toHaveBeenCalledWith('t1');
  });

  it('POST /tenant/:tenantId/index-catalog -> 500 on error', async () => {
    indexUseCase.indexTenantCatalog.mockRejectedValue(new Error('boom'));
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { indexComponentsUseCase: indexUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    shared.dtos.api.createResponse.mockReturnValue({ success: false });
    const res = await app.request('/tenant/t1/index-catalog', { method: 'POST' });
    expect(res.status).toBe(500);
  });

  it('GET /components -> 200', async () => {
    listUseCase.execute.mockResolvedValue({ components: [{ id: 'c1' }], scope: 'global' });
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { listComponentsUseCase: listUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    const res = await app.request('/components');
    expect(res.status).toBe(200);
    expect(listUseCase.execute).toHaveBeenCalledWith({});
  });

  it('GET /tenant/:tenantId/components -> 200', async () => {
    listUseCase.execute.mockResolvedValue({ components: [], scope: 'tenant' });
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { listComponentsUseCase: listUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    const res = await app.request('/tenant/tt/components');
    expect(res.status).toBe(200);
    expect(listUseCase.execute).toHaveBeenCalledWith({ tenantId: 'tt' });
  });

  it('GET /tenant/:tenantId/project/:projectId/components -> 200', async () => {
    listUseCase.execute.mockResolvedValue({ components: [], scope: 'project' });
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { listComponentsUseCase: listUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    const res = await app.request('/tenant/tt/project/pp/components');
    expect(res.status).toBe(200);
    expect(listUseCase.execute).toHaveBeenCalledWith({ tenantId: 'tt', projectId: 'pp' });
  });

  it('GET /tenant/:tenantId/project/:projectId/article/:articleId/components -> 200', async () => {
    listUseCase.execute.mockResolvedValue({ components: [], scope: 'article' });
    const app = makeApp(c => {
      ctxSetUnsafe(c, 'shared', shared);
      ctxSetUnsafe(c, 'useCases', { listComponentsUseCase: listUseCase } as any);
      ctxSetUnsafe(c, 'createApiResponse', shared.dtos.api.createResponse);
    });
    const res = await app.request('/tenant/tt/project/pp/article/aa/components');
    expect(res.status).toBe(200);
    expect(listUseCase.execute).toHaveBeenCalledWith({
      tenantId: 'tt',
      projectId: 'pp',
      articleId: 'aa',
    });
  });
});