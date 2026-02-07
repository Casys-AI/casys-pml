// DTOs de logging partagés (purs, sans dépendances)

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';

export interface LogConfig {
  level: LogLevel;
  // Chemin fichier si activé (absolu de préférence)
  filePath?: string;
  // Affichage couleur en console (dev)
  color?: boolean;
  // Format JSON (true) ou human readable (false) pour la console
  json?: boolean;
  // Driver sous-jacent (console|pino)
  driver?: 'console' | 'pino';
}

export interface LoggerPort {
  debug(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, errOrData?: unknown): void;
}
