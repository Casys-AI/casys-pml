// Service WebSocket pour notifications temps réel
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import {
  applicationMiddleware,
  type ApplicationVariables,
} from './middleware/application.middleware';
import { diMiddleware } from './middleware/di.middleware';
import { sharedMiddleware } from './middleware/shared.middleware';
// Nouvelles routes organisées par domaines
import componentsRoutes from './routes/components'; // /components/*
import configRoutes from './routes/config';
import contentRoutes from './routes/content'; // /content/*
import healthRoutes from './routes/health'; // /health
import syncRoutes from './routes/sync'; // /sync/*
import leadRoutes from './routes/lead';
import projectsRoute from './routes/projects';
import rssRoutes from './routes/rss'; // /rss/*
import scanRoutes from './routes/scan';
import seoRoutes from './routes/seo';
import { ctxSet, ctxSetUnsafe } from './utils/hono-context';
import { createLogger } from './utils/logger';

interface CreateAppOptions {
  injectVars?: Partial<ApplicationVariables>;
}

export const createApp = (opts: CreateAppOptions = {}) => {
  const app = new Hono();
  const { injectVars } = opts;

  // Middleware HTTP utilisant le port Logger (adapter infra)
  const httpLogger = createLogger('HTTP');
  app.use('*', async (c, next) => {
    const started = Date.now();
    try {
      await next();
    } finally {
      const duration = Date.now() - started;
      const method = c.req.method;
      // c.req.path n'existe pas toujours, on recompose l'URL
      const url = c.req.url;
      const status = c.res.status;
      httpLogger.log(`${method} ${url} -> ${status}`, { durationMs: duration });
    }
  });

  // Middlewares globaux
  app.use(
    '*',
    cors({
      origin: ['http://localhost:4200', 'http://localhost:4321', 'http://localhost:4322'],
      credentials: true,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'If-None-Match'],
      exposeHeaders: ['ETag'],
    })
  );

  // Ordre important : DI → Shared → Application
  // infrastructureMiddleware supprimé - tout est résolu via Awilix
  app.use('*', diMiddleware);
  app.use('*', sharedMiddleware);
  app.use('*', applicationMiddleware);
  app.use('*', (c, next) => {
    // Service config minimal (clé typée dans ContextVariableMap)
    ctxSet(c, 'configService', { getSources: () => [] });
    // Injections dynamiques pour tests/overrides
    if (injectVars) {
      for (const [k, v] of Object.entries(injectVars)) {
        ctxSetUnsafe(c, k, v);
      }
    }
    return next();
  });

  // Routes API
  // Health check détaillé (affiche l'état des use cases)
  app.route('/health', healthRoutes);

  // Routes API principales
  app.route('/api/components', componentsRoutes);
  app.route('/api/content', contentRoutes);
  app.route('/api/sync', syncRoutes);
  app.route('/api/lead', leadRoutes);
  app.route('/api/projects', projectsRoute);
  app.route('/api/config', configRoutes);
  app.route('/api/rss', rssRoutes);
  app.route('/api/seo', seoRoutes);
  app.route('/api/scan', scanRoutes);

  // Gestion centralisée des erreurs applicatives (Hono)
  app.onError((err, c) => {
    try {
      const logger = createLogger('API');
      logger.error?.('Unhandled error', {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
        stack: (err as Error)?.stack,
        method: c?.req?.method,
        url: c?.req?.url,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[API][onError] logging failure', e);
    }
    return c.json({ error: 'Internal Server Error', message: (err as Error)?.message }, 500);
  });

  // 404 explicite avec log
  app.notFound(c => {
    try {
      const logger = createLogger('API');
      logger.warn?.('Not Found', { method: c.req.method, url: c.req.url });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[API][notFound] logging failure', e);
    }
    return c.json({ error: 'Not Found', path: c.req.url }, 404);
  });

  return app;
};
