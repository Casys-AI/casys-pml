export const OUTPUT_VERSION = "ax.v1";

export type ErrorCategory = "validation" | "runtime" | "internal";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = stableValue(obj[key]);
    }
    return out;
  }
  return value;
}

export function eventJson(type: string, payload: Record<string, unknown> = {}): string {
  const record: Record<string, unknown> = {
    version: OUTPUT_VERSION,
    type,
    ...stableValue(payload) as Record<string, unknown>,
  };
  return JSON.stringify(record);
}

export function errorJson(args: {
  code: string;
  category: ErrorCategory;
  message: string;
  details?: Record<string, unknown>;
}): string {
  return eventJson("error", {
    code: args.code,
    category: args.category,
    message: args.message,
    ...(args.details ? { details: args.details } : {}),
  });
}
