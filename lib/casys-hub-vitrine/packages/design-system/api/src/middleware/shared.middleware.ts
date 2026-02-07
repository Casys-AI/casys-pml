import { createMiddleware } from 'hono/factory';

import { ctxSet } from '../utils/hono-context';
import { createLogger } from '../utils/logger';

/**
 * Middleware Hono pour injecter les services Shared
 * Résout depuis le container Awilix (DI)
 */

export const sharedMiddleware = createMiddleware(async (c, next) => {
  const logger = createLogger('API');

  try {
    const container = c.get('container');

    if (container) {
      // Exposer les services shared directement sur le contexte Hono pour un accès type-safe
      const createApiResponse = container.resolve('createApiResponse');
      ctxSet(c, 'createApiResponse', createApiResponse);
      
      // Injecter le logger
      const containerLogger = container.resolve('logger');
      ctxSet(c, 'logger', containerLogger);

      logger.log('✅ Services shared exposés sur le contexte Hono');
    } else {
      // Fallback si container non disponible (tests, etc.)
      logger.warn('⚠️ Container Awilix non disponible, skipping shared services');
      ctxSet(c, 'logger', logger);
    }
  } catch (error) {
    logger.error("❌ Erreur lors de l'injection des services shared", { error });
    // Inject logger anyway for downstream middlewares
    ctxSet(c, 'logger', logger);
  }

  await next();
});
