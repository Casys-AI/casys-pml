import {
  normalizeVaultPath,
  resolveVaultConfigPath,
} from "../service/lifecycle.ts";

export interface TraceSourceConfig {
  kind: "openclaw";
  path: string;
}

export interface TraceConfig {
  traceSources: TraceSourceConfig[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function normalizeSourcePath(path: string): string {
  return normalizeVaultPath(path);
}

function parseTraceSource(
  value: unknown,
  index: number,
): TraceSourceConfig {
  if (!isObjectRecord(value)) {
    throw new Error(
      `[trace-config] Invalid trace source at index ${index}: expected object`,
    );
  }

  const kind = value.kind;
  if (kind !== "openclaw") {
    throw new Error(
      `[trace-config] Invalid trace source at index ${index}: unsupported kind "${
        String(kind)
      }"`,
    );
  }

  const path = value.path;
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new Error(
      `[trace-config] Invalid trace source at index ${index}: missing non-empty path`,
    );
  }

  return {
    kind,
    path: normalizeSourcePath(path),
  };
}

export function resolveVaultExecConfigPath(vaultPath: string): string {
  return resolveVaultConfigPath(vaultPath);
}

export async function loadTraceConfig(vaultPath: string): Promise<TraceConfig> {
  const path = resolveVaultExecConfigPath(vaultPath);
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { traceSources: [] };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `[trace-config] Invalid JSON in ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!isObjectRecord(parsed)) {
    throw new Error(
      `[trace-config] Invalid config in ${path}: expected object`,
    );
  }

  const rawSources = parsed.traceSources;
  if (rawSources === undefined) {
    return { traceSources: [] };
  }
  if (!Array.isArray(rawSources)) {
    throw new Error(
      `[trace-config] Invalid config in ${path}: traceSources must be an array`,
    );
  }

  return {
    traceSources: rawSources.map((source, index) =>
      parseTraceSource(source, index)
    ),
  };
}
