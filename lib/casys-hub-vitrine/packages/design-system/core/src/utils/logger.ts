/**
 * Logger Core (temporaire, sans dépendance externe)
 * - No-op en test
 * - Console en runtime
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

/**
 * Crée un logger avec un contexte spécifique
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
      error(message: string, error?: unknown) {
        void message;
        void error;
      },
      warn(message: string, ...args: unknown[]) {
        void message;
        void args;
      },
    };
    return noop;
  }
  /* eslint-disable no-console */
  return {
    debug: (message: string, ...args: unknown[]) =>
      console.debug(`[${context}] ${message}`, ...args),
    log: (message: string, ...args: unknown[]) => console.log(`[${context}] ${message}`, ...args),
    error: (message: string, error?: unknown) => console.error(`[${context}] ${message}`, error),
    warn: (message: string, ...args: unknown[]) => console.warn(`[${context}] ${message}`, ...args),
  } satisfies Logger;
  /* eslint-enable no-console */
}

// Logger par défaut supprimé: inutile côté @casys/core (Knip)
