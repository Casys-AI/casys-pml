import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, parse } from 'node:path';
import pino from 'pino';

import { type LogConfig, type LoggerPort, type LogLevel } from '@casys/shared';

function levelAllows(target: LogLevel, msgLevel: LogLevel): boolean {
  const order: LogLevel[] = ['debug', 'log', 'info', 'warn', 'error'];
  return order.indexOf(msgLevel) >= order.indexOf(target);
}

function initFileSink(filePath?: string): ((line: string) => void) | null {
  if (!filePath) return null;
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stream = createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
    return (line: string) => stream.write(line + '\n');
  } catch {
    // fail-soft: pas de crash si le fichier log échoue
    return null;
  }
}

// Date compacte (YYMMDD) pour le nommage par jour
function formatDateShort(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yy}${mm}${dd}`;
}

// Sanitize du contexte pour l’utiliser dans un nom de fichier
function sanitizeContext(ctx: string): string {
  return (
    (ctx || 'App')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'App'
  );
}

// Cache (basePath + context) -> chemin final pour CE process
const perContextPathCache = new Map<string, string>();

/**
 * Renvoie TOUJOURS le même fichier pour un (basePath, context) dans le process.
 * Nommage: name-YYMMDD-<context>.log
 */
function resolvePerContextLogPath(basePath: string, context: string): string {
  const cacheKey = `${basePath}::${context}`;
  const cached = perContextPathCache.get(cacheKey);
  if (cached) return cached;

  const { dir, name, ext } = parse(basePath);
  const extension = ext || '.log';
  const day = formatDateShort(new Date());
  const ctxSlug = sanitizeContext(context);

  // Assure le dossier
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // noop
  }

  const finalPath = join(dir, `${name}-${day}-${ctxSlug}${extension}`);

  // Purge des fichiers plus vieux que N jours (défaut 3)
  const retentionDays = Number(process.env.LOG_RETENTION_DAYS ?? '3');
  const maxAgeMs = retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : 0;
  try {
    const files = readdirSync(dir);
    const prefix = `${name}-`;
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith(prefix)) continue;
      // ⚠️ filtrer sur l'extension réelle
      if (extension && !f.endsWith(extension)) continue;
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (maxAgeMs > 0 && now - st.mtimeMs > maxAgeMs) {
          unlinkSync(full);
        }
      } catch {
        // ignore erreurs de stat/unlink
      }
    }
  } catch {
    // ignore erreurs de purge/dir
  }

  perContextPathCache.set(cacheKey, finalPath);
  return finalPath;
}

function formatLine(
  ts: string,
  level: LogLevel,
  ctx: string,
  message: string,
  extra: unknown[]
): string {
  const extras = extra?.length ? ' ' + extra.map(safeInspect).join(' ') : '';
  return `${ts} ${level.toUpperCase()} [${ctx}] ${message}${extras}`;
}

function safeInspect(v: unknown): string {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function createLogAdapter(config: LogConfig, context = 'App'): LoggerPort {
  // Driver Pino optionnel
  if (config.driver === 'pino') {
    let destination: pino.DestinationStream | undefined;
    if (config.filePath) {
      // S'assurer que le dossier existe avant d'ouvrir la destination pino
      try {
        const dir = dirname(config.filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      } catch {
        // En cas d'échec, on laisse pino écrire sur stdout
      }
      const perContextPath = resolvePerContextLogPath(config.filePath, context);
      destination = pino.destination({ dest: perContextPath, minLength: 4096, sync: false });
    }

    const toPinoLevel = (lvl: LogLevel): 'debug' | 'info' | 'warn' | 'error' => {
      switch (lvl) {
        case 'log':
          return 'info';
        case 'info':
          return 'info';
        case 'debug':
          return 'debug';
        case 'warn':
          return 'warn';
        case 'error':
          return 'error';
        default:
          return 'info';
      }
    };

    const logger = pino(
      {
        level: toPinoLevel(config.level),
        // Sortie JSON structurée par défaut
      },
      destination
    );

    return {
      debug: (m: string, ...a: unknown[]) => {
        if (levelAllows(config.level, 'debug')) logger.debug({ extra: a }, m);
      },
      log: (m: string, ...a: unknown[]) => {
        if (levelAllows(config.level, 'log')) logger.info({ extra: a }, m);
      },
      info: (m: string, ...a: unknown[]) => {
        if (levelAllows(config.level, 'info')) logger.info({ extra: a }, m);
      },
      warn: (m: string, ...a: unknown[]) => {
        if (levelAllows(config.level, 'warn')) logger.warn({ extra: a }, m);
      },
      error: (m: string, e?: unknown) => {
        if (levelAllows(config.level, 'error')) logger.error(e ? { err: e } : undefined, m);
      },
    };
  }

  // Driver console + fichier (human readable)
  const filePath = config.filePath ? resolvePerContextLogPath(config.filePath, context) : undefined;
  const fileWrite = initFileSink(filePath);

  const colorize = config.color ?? process.stdout.isTTY;
  const pad = (s: string) => (s + '     ').slice(0, 5);
  const color = {
    dim: (s: string) => (colorize ? `\x1b[2m${s}\x1b[0m` : s),
    gray: (s: string) => (colorize ? `\x1b[90m${s}\x1b[0m` : s),
    blue: (s: string) => (colorize ? `\x1b[34m${s}\x1b[0m` : s),
    green: (s: string) => (colorize ? `\x1b[32m${s}\x1b[0m` : s),
    yellow: (s: string) => (colorize ? `\x1b[33m${s}\x1b[0m` : s),
    red: (s: string) => (colorize ? `\x1b[31m${s}\x1b[0m` : s),
    cyan: (s: string) => (colorize ? `\x1b[36m${s}\x1b[0m` : s),
    magenta: (s: string) => (colorize ? `\x1b[35m${s}\x1b[0m` : s),
    brightCyan: (s: string) => (colorize ? `\x1b[96m${s}\x1b[0m` : s),
  } as const;

  /**
   * Attribue une couleur selon la couche architecturale (DDD layers)
   */
  function contextColor(ctx: string): (s: string) => string {
    const lower = ctx.toLowerCase();
    
    // API Layer (HTTP, routes, controllers, middleware)
    if (lower.includes('api') || lower.includes('http') || lower.includes('middleware')) {
      return color.cyan;
    }
    
    // Application Layer (use cases, orchestration, services)
    if (lower.includes('usecase') || lower.includes('application') || lower.includes('orchestrat')) {
      return color.brightCyan;
    }
    
    // Infrastructure Layer (adapters, persistence, external APIs)
    if (
      lower.includes('infrastructure') ||
      lower.includes('adapter') ||
      lower.includes('repository') ||
      lower.includes('store') ||
      lower.includes('neo4j') ||
      lower.includes('provider') ||
      lower.includes('fetcher') ||
      lower.includes('scraping')
    ) {
      return color.magenta;
    }
    
    // Core/Domain Layer (entities, value objects, domain services)
    if (lower.includes('core') || lower.includes('domain') || lower.includes('entity')) {
      return color.blue;
    }
    
    // Shared Layer (DTOs, types, utils)
    if (lower.includes('shared') || lower.includes('dto') || lower.includes('util')) {
      return color.gray;
    }
    
    // Fallback: couleur basée sur le hash pour cohérence
    const hash = ctx.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [color.cyan, color.magenta, color.brightCyan, color.blue];
    return colors[hash % colors.length];
  }

  function lvlColor(lvl: LogLevel): (s: string) => string {
    switch (lvl) {
      case 'debug':
        return color.blue;
      case 'log':
        return color.green;
      case 'info':
        return color.green;
      case 'warn':
        return color.yellow;
      case 'error':
        return color.red;
      default:
        return (s: string) => s;
    }
  }

  const write = (lvl: LogLevel, m: string, extra: unknown[]) => {
    if (!levelAllows(config.level, lvl)) return;
    const ts = new Date().toISOString();
    const ctx = contextColor(context)(`[${context}]`);
    const levelTxt = lvlColor(lvl)(pad(lvl.toUpperCase()));
    const extras = extra?.length ? ' ' + extra.map(safeInspect).join(' ') : '';
    const consoleLine = `${color.dim(ts)} ${levelTxt} ${ctx} ${m}${extras}`;
    const fileLine = formatLine(ts, lvl, context, m, extra);
    // no-console: écrire via stdout/stderr directement
    if (lvl === 'error') {
      process.stderr.write(consoleLine + '\n');
    } else {
      process.stdout.write(consoleLine + '\n');
    }
    if (fileWrite) fileWrite(fileLine);
  };

  return {
    debug: (m: string, ...a: unknown[]) => write('debug', m, a),
    log: (m: string, ...a: unknown[]) => write('log', m, a),
    info: (m: string, ...a: unknown[]) => write('info', m, a),
    warn: (m: string, ...a: unknown[]) => write('warn', m, a),
    error: (m: string, e?: unknown) => write('error', m, e ? [e] : []),
  };
}
