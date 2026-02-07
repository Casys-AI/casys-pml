import { Hono } from 'hono';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import configRouter from '../config/index';

// Mock minimal pour l'écriture (UserProjectConfigPort-like)
const mockReader = {
  saveUserConfig: vi.fn().mockImplementation(async (userId: string, _config: unknown) => {
    if (userId === 'invalid-format') throw new Error('Invalid user format');
    if (userId === 'server-error') throw new Error('Database connection failed');
  }),
  saveProjectConfig: vi.fn().mockImplementation(async (userId: string, projectId: string, _config: unknown) => {
    if (userId === 'not-found' || projectId === 'not-found') throw new Error('Project not found');
    if (projectId === 'invalid-schema') throw new Error('Invalid project schema');
  }),
} as const;

function buildAppWithMock(mock: Record<string, unknown>) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    ctxSetUnsafe(c, 'configReader', mock);
    await next();
  });
  app.route('/api/config', configRouter);
  return app;
}

describe('API /api/config (écriture)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PUT /api/config/users/:userId -> sauvegarde UserConfig', async () => {
    const app = buildAppWithMock(mockReader);

    const payload = {
      name: 'jane-doe',
      email: 'jane@example.com',
      apiUrl: 'http://localhost:3001',
      defaultTenant: 'jane-doe',
    };

    const res = await app.request('/api/config/users/jane-doe', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockReader.saveUserConfig).toHaveBeenCalledWith('jane-doe', payload);
  });

  it('PUT /api/config/users/:userId/projects/:projectId -> sauvegarde ProjectConfig', async () => {
    const app = buildAppWithMock(mockReader);

    const payload = {
      name: 'proj-1',
      type: 'astro',
      sources: {},
      publication: {},
      generation: { keywords: [], tone: 'professionnel', frequency: 'manual', length: '0-0' },
    };

    const res = await app.request('/api/config/users/jane-doe/projects/proj-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockReader.saveProjectConfig).toHaveBeenCalledWith('jane-doe', 'proj-1', payload);
  });

  it('PUT /api/config/users/:userId/projects/:projectId -> sauvegarde ProjectConfig', async () => {
    const app = buildAppWithMock(mockReader);

    const res = await app.request('/api/config/users/john-doe/projects/proj-a', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'proj-a', type: 'astro' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockReader.saveProjectConfig).toHaveBeenCalledWith('john-doe', 'proj-a', {
      name: 'proj-a',
      type: 'astro',
    });
  });

  // Tests d'erreur pour couvrir les branches manquantes
  it('PUT /api/config/users/:userId -> 400 si format invalide', async () => {
    const app = buildAppWithMock(mockReader);

    const res = await app.request('/api/config/users/invalid-format', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid');
  });

  it('PUT /api/config/users/:userId -> 500 si erreur serveur', async () => {
    const app = buildAppWithMock(mockReader);

    const res = await app.request('/api/config/users/server-error', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Database');
  });

  it('PUT /api/config/users/:userId/projects/:projectId -> 404 si projet introuvable', async () => {
    const app = buildAppWithMock(mockReader);

    const res = await app.request('/api/config/users/john-doe/projects/not-found', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('PUT /api/config/users/:userId -> 500 si configReader absent', async () => {
    const app = new Hono();
    app.route('/api/config', configRouter);

    const res = await app.request('/api/config/users/john-doe', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('ConfigReader indisponible');
  });
});
