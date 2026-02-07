import type { AwilixContainer } from 'awilix';
import { createMiddleware } from 'hono/factory';

import { createRootContainer } from '../di/container';
import { ctxSetUnsafe } from '../utils/hono-context';
import { appLogger } from '../utils/logger';

let rootContainer: AwilixContainer | null = null;

export const diMiddleware = createMiddleware(async (c, next) => {
  try {
    rootContainer ??= createRootContainer();
    const requestContainer = rootContainer.createScope();

    // Optionally pre-resolve common services (kept lazy to avoid boot cost per request)
    // await requestContainer.resolve('shared');
    // await requestContainer.resolve('infraServices');
    // await requestContainer.resolve('appServices');

    // Expose the DI container on context for downstream middlewares/routes
    ctxSetUnsafe(c, 'container', requestContainer);
  } catch (e) {
    appLogger.warn?.('[diMiddleware] initialization failed', e as Error);
  }

  await next();
});
