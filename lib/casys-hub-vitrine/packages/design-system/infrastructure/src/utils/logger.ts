/**
 * Logger unifié pour Infrastructure (config-driven)
 * Wrap du port/adaptateur central afin de ne rien casser côté imports existants.
 */
import { createLogAdapter } from '../adapters/server/logging/log.adapter';
import { resolveLogConfig } from '../config/logging.config';

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

/**
 * Crée un logger contextuel basé sur l'adaptateur unifié.
 */
export function createLogger(context: string): Logger {
  if (isTestMode()) {
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
  const adapter = createLogAdapter(baseConfig, context);
  return {
    debug: (message: string, ...args: unknown[]) => adapter.debug(message, ...args),
    log: (message: string, ...args: unknown[]) => adapter.log(message, ...args),
    warn: (message: string, ...args: unknown[]) => adapter.warn(message, ...args),
    error: (message: string, error?: unknown) => adapter.error(message, error),
  } satisfies Logger;
}

/**
 * Logger par défaut pour Infrastructure
 */
export const infraLogger = createLogger('Infrastructure');
