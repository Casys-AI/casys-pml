import { Hono } from 'hono';
import { describe, expect,it } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import componentsGenerate from '../components/generate';

function makeAppWithUseCase(useCase?: { execute: (input: unknown) => Promise<unknown> }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (useCase) {
      ctxSetUnsafe(c, 'useCases', { generateComponentFromCommentUseCase: useCase } as any);
    }
    ctxSetUnsafe(c, 'shared', { dtos: { api: { createResponse: (s: boolean, d?: unknown, m?: string) => ({ success: s, data: d, message: m }) } } });
    await next();
  });
  app.route('/components', componentsGenerate);
  return app;
}

describe('Route POST /components/generate', () => {
  const validBody = {
    commentText: 'Créer un composant bouton primaire',
    tenantId: 'tenant-x',
    textFragmentId: 'frag-1',
  };

  it('200 success avec use case présent', async () => {
    const useCase = {
      async execute() {
        return {
          success: true,
          generatedComponent: { id: 'comp-1', name: 'PrimaryButton', props: { label: 'OK' }, aiMetadata: { confidence: 0.9 } },
          componentUsage: { id: 'usage-1' },
        };
      },
    };
    const app = makeAppWithUseCase(useCase);
    const res = await app.request('/components/generate', { method: 'POST', body: JSON.stringify(validBody), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.componentId).toBe('comp-1');
  });

  it('500 lorsque le use case est absent', async () => {
    const app = makeAppWithUseCase(undefined);
    const res = await app.request('/components/generate', { method: 'POST', body: JSON.stringify(validBody), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(500);
  });

  it('400 si validation échoue (commentText manquant)', async () => {
    const app = makeAppWithUseCase({ execute: async () => ({ success: true }) });
    const res = await app.request('/components/generate', { method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });
});
