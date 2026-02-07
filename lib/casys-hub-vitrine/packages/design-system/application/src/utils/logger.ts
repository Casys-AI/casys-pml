/**
 * Logger Application (port-aware)
 * - Utilise le LoggerPort d'infrastructure si injecté
 * - No-op en test
 * - stdout/stderr en runtime (fallback)
 */
import { inspect } from 'node:util';

import type { LoggerPort } from '@casys/shared';
export type Logger = LoggerPort;

const isTestMode = () =>
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  typeof (globalThis as { describe?: unknown }).describe !== 'undefined';

function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return inspect(arg, { compact: true, breakLength: Infinity });
    }
  }
  return inspect(arg, { compact: true, breakLength: Infinity });
}

export function createLogger(context: string, port?: LoggerPort): LoggerPort {
  // Si un port d'infrastructure est injecté, on renvoie un wrapper contextuel
  if (port) {
    return {
      debug: (message: string, ...args: unknown[]) =>
        port.debug(`[${context}] ${message}`, ...args.map(formatArg)),
      log: (message: string, ...args: unknown[]) =>
        port.log(`[${context}] ${message}`, ...args.map(formatArg)),
      info: (message: string, ...args: unknown[]) =>
        port.info(`[${context}] ${message}`, ...args.map(formatArg)),
      warn: (message: string, ...args: unknown[]) =>
        port.warn(`[${context}] ${message}`, ...args.map(formatArg)),
      error: (message: string, ...args: unknown[]) =>
        port.error(`[${context}] ${message}`, ...args.map(formatArg)),
    };
  }

  // Fallbacks: no-op en test, stdout/stderr en runtime
  if (isTestMode()) {
    return {
      debug() {
        /* noop */
      },
      log() {
        /* noop */
      },
      info() {
        /* noop */
      },
      warn() {
        /* noop */
      },
      error() {
        /* noop */
      },
    };
  }

  return {
    debug: (message: string, ...args: unknown[]) => {
      const line = `[${context}] ${message} ${args.map(formatArg).join(' ')}`.trim() + '\n';
      try {
        process.stdout.write(line);
      } catch {
        /* ignore */
      }
    },
    log: (message: string, ...args: unknown[]) => {
      const line = `[${context}] ${message} ${args.map(formatArg).join(' ')}`.trim() + '\n';
      try {
        process.stdout.write(line);
      } catch {
        /* ignore */
      }
    },
    info: (message: string, ...args: unknown[]) => {
      const line = `[${context}] ${message} ${args.map(formatArg).join(' ')}`.trim() + '\n';
      try {
        process.stdout.write(line);
      } catch {
        /* ignore */
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      const line = `[${context}] ${message} ${args.map(formatArg).join(' ')}`.trim() + '\n';
      try {
        process.stderr.write(line);
      } catch {
        /* ignore */
      }
    },
    error: (message: string, ...args: unknown[]) => {
      const line = `[${context}] ${message} ${args.map(formatArg).join(' ')}`.trim() + '\n';
      try {
        process.stderr.write(line);
      } catch {
        /* ignore */
      }
    },
  };
}

export const applicationLogger = createLogger('Application');
