import { type LogConfig, type LogLevel } from '@casys/shared';

function parseBool(v: string | undefined, d: boolean): boolean {
  if (v == null) return d;
  const s = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return d;
}

function parseLevel(v: string | undefined, d: LogLevel): LogLevel {
  const s = v?.trim().toLowerCase();
  if (s === 'debug' || s === 'log' || s === 'warn' || s === 'error') return s as LogLevel;
  return d;
}

export function resolveLogConfig(env: NodeJS.ProcessEnv = process.env): LogConfig {
  const level = parseLevel(env.LOG_LEVEL, 'log');
  const json = parseBool(env.LOG_JSON, false);
  const color = parseBool(env.LOG_COLOR, process.stdout.isTTY);
  const driver = (env.LOG_DRIVER?.trim().toLowerCase() as LogConfig['driver']) ?? 'console';
  const filePath =
    env.API_LOG_FILE?.trim() ||
    (env.CASYS_PROJECT_ROOT ? `${env.CASYS_PROJECT_ROOT}/logs/api.log` : undefined);

  return { level, json, color, driver, filePath };
}
