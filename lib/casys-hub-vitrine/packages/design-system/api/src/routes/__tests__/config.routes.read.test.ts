import { Hono } from 'hono';
import { describe, expect,it } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import configRouter from '../config/index';

// Mock minimal pour la lecture (UserProjectConfigPort-like)
const mockReader = {
  listUsers: async () => ['john-doe', 'kelly-assist'],
  getUserConfig: async (userId: string) => {
    if (userId === 'not-found') throw new Error('User not found');
    if (userId === 'invalid-format') throw new Error('Invalid user format');
    return {
      name: userId,
      email: `${userId}@example.com`,
      apiUrl: 'http://localhost:3001',
      defaultTenant: userId,
    };
  },
  listUserProjects: async (userId: string) => {
    if (userId === 'not-found') throw new Error('User not found');
    return ['proj-a', 'proj-b'];
  },
  getProjectConfig: async (userId: string, projectId: string) => {
    if (userId === 'not-found' || projectId === 'not-found') throw new Error('Project not found');
    if (projectId === 'invalid-schema') throw new Error('Invalid project schema');
    return {
      name: projectId,
      type: 'astro',
      // champs optionnels/mocks pour correspondre à la forme attendue côté clients
      sources: {},
      publication: {},
      generation: { keywords: [], tone: 'professionnel', frequency: 'manual', length: '0-0' },
    };
  },
  saveUserConfig: async (userId: string, _config: unknown) => {
    if (userId === 'invalid-format') throw new Error('Invalid user format');
    if (userId === 'server-error') throw new Error('Database connection failed');
  },
  saveProjectConfig: async (userId: string, projectId: string, _config: unknown) => {
    if (userId === 'not-found' || projectId === 'not-found') throw new Error('Project not found');
    if (projectId === 'invalid-schema') throw new Error('Invalid project schema');
  },
} as const;

function buildApp(withConfigReader = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (withConfigReader) {
      ctxSetUnsafe(c, 'configReader', mockReader);
    }
    await next();
  });
  app.route('/api/config', configRouter);
  return app;
}

describe('API /api/config (lecture)', () => {
  it('GET /api/config/users -> liste des users', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(['john-doe', 'kelly-assist']);
  });

  it('GET /api/config/users/:userId -> UserConfig', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/john-doe');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaultTenant).toBe('john-doe');
  });

  it('GET /api/config/users/:userId/projects -> liste des projets', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/john-doe/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(['proj-a', 'proj-b']);
  });

  it('GET /api/config/users/:userId/projects/:projectId -> ProjectConfig', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/john-doe/projects/proj-a');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('proj-a');
  });

  // Tests d'erreur pour couvrir les branches manquantes
  it('GET /api/config/users/:userId -> 404 si user introuvable', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/not-found');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found');
  });

  it('GET /api/config/users/:userId -> 400 si format invalide', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/invalid-format');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid');
  });

  it('GET /api/config/users/:userId/projects -> 404 si user introuvable', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/not-found/projects');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('GET /api/config/users/:userId/projects/:projectId -> 404 si projet introuvable', async () => {
    const app = buildApp();
    const res = await app.request('/api/config/users/john-doe/projects/not-found');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('GET /api/config/users -> 500 si configReader absent', async () => {
    const app = buildApp(false); // sans configReader
    const res = await app.request('/api/config/users');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('ConfigReader indisponible');
  });
});
