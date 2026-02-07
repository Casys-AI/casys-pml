import type { LoggerPort } from '@casys/shared';
import { createLogAdapter, resolveLogConfig } from '@casys/infrastructure';

/**
 * Logger centralisé (port + adapter infra)
 * API publique: createLogger(context), appLogger
 */

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  error(message: string, error?: unknown): void;
  warn(message: string, ...args: unknown[]): void;
}

const isTestMode = () =>
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  typeof (globalThis as { describe?: unknown }).describe !== 'undefined';

const baseConfig = resolveLogConfig(process.env);

export function createLogger(context: string): Logger {
  if (isTestMode()) {
    // Silence complet en test
    const noop: Logger = {
      debug(message: string, ...args: unknown[]) {
        void message;
        void args;
      },
      log(message: string, ...args: unknown[]) {
        void message;
        void args;
      },
      warn(message: string, ...args: unknown[]) {
        void message;
        void args;
      },
      error(message: string, error?: unknown) {
        void message;
        void error;
      },
    };
    return noop;
  }
  const adapter: LoggerPort = createLogAdapter(baseConfig, context);
  return {
    debug: (message: string, ...args: unknown[]) => adapter.debug(message, ...args),
    log: (message: string, ...args: unknown[]) => adapter.log(message, ...args),
    warn: (message: string, ...args: unknown[]) => adapter.warn(message, ...args),
    error: (message: string, error?: unknown) => adapter.error(message, error),
  } satisfies Logger;
}

export const appLogger = createLogger('App');

// Middleware logger Hono (pour les requêtes HTTP)
// Middleware Hono logger supprimé (non utilisé). Utiliser createLogger/appLogger.
