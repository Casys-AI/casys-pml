import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { ProjectConfig, UserConfig } from '@casys/shared';

// Router /api/config
const app = new Hono();

function mapErrorToStatus(err: unknown): ContentfulStatusCode {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('not found') ?? msg.includes('introuvable') ?? msg.includes('missing'))
    return 404;
  if (msg.includes('invalid') ?? msg.includes('format') ?? msg.includes('schema')) return 400;
  return 500;
}

function ensureConfigReader(c: Context) {
  return c.get('configReader');
}

// GET /api/config/users -> string[]
app.get('/users', async c => {
  const reader = ensureConfigReader(c);
  if (!reader)
    return c.json({ success: false, error: 'ConfigReader indisponible' }, { status: 500 });
  try {
    const users = await reader.listUsers();
    return c.json({ success: true, data: users });
  } catch (err) {
    const status = mapErrorToStatus(err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status }
    );
  }
});

// GET /api/config/users/:userId -> UserConfig
app.get('/users/:userId', async c => {
  const reader = ensureConfigReader(c);
  if (!reader)
    return c.json({ success: false, error: 'ConfigReader indisponible' }, { status: 500 });
  const { userId } = c.req.param();
  try {
    const conf = await reader.getUserConfig(userId);
    return c.json({ success: true, data: conf });
  } catch (err) {
    const status = mapErrorToStatus(err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status }
    );
  }
});

// PUT /api/config/users/:userId -> void
app.put('/users/:userId', async c => {
  const reader = ensureConfigReader(c);
  if (!reader)
    return c.json({ success: false, error: 'ConfigReader indisponible' }, { status: 500 });
  const { userId } = c.req.param();
  try {
    const body = await c.req.json<unknown>();
    await reader.saveUserConfig(userId, body as UserConfig);
    return c.json({ success: true, message: 'UserConfig sauvegardée' });
  } catch (err) {
    const status = mapErrorToStatus(err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status }
    );
  }
});

// GET /api/config/users/:userId/projects -> string[]
app.get('/users/:userId/projects', async c => {
  const reader = ensureConfigReader(c);
  if (!reader)
    return c.json({ success: false, error: 'ConfigReader indisponible' }, { status: 500 });
  const { userId } = c.req.param();
  try {
    const projects = await reader.listUserProjects(userId);
    return c.json({ success: true, data: projects });
  } catch (err) {
    const status = mapErrorToStatus(err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status }
    );
  }
});

// GET /api/config/users/:userId/projects/:projectId -> ProjectConfig
app.get('/users/:userId/projects/:projectId', async c => {
  const reader = ensureConfigReader(c);
  if (!reader)
    return c.json({ success: false, error: 'ConfigReader indisponible' }, { status: 500 });
  const { userId, projectId } = c.req.param();
  try {
    const conf = await reader.getProjectConfig(userId, projectId);
    return c.json({ success: true, data: conf });
  } catch (err) {
    const status = mapErrorToStatus(err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status }
    );
  }
});

// PUT /api/config/users/:userId/projects/:projectId -> void
app.put('/users/:userId/projects/:projectId', async c => {
  const reader = ensureConfigReader(c);
  if (!reader)
    return c.json({ success: false, error: 'ConfigReader indisponible' }, { status: 500 });
  const { userId, projectId } = c.req.param();
  try {
    const body = await c.req.json<unknown>();
    await reader.saveProjectConfig(userId, projectId, body as ProjectConfig);
    return c.json({ success: true, message: 'ProjectConfig sauvegardée' });
  } catch (err) {
    const status = mapErrorToStatus(err);
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status }
    );
  }
});

export default app;
