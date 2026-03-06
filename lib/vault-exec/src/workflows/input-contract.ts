export type RuntimeInputSource = "empty" | "file" | "inline_json";

export type RuntimeInputParseErrorCode =
  | "INPUT_FILE_READ_ERROR"
  | "INPUT_JSON_PARSE_ERROR";

export interface RuntimeInputParseSuccess {
  ok: true;
  source: RuntimeInputSource;
  payload: Record<string, unknown>;
}

export interface RuntimeInputParseFailure {
  ok: false;
  source: Exclude<RuntimeInputSource, "empty">;
  code: RuntimeInputParseErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type RuntimeInputParseResult =
  | RuntimeInputParseSuccess
  | RuntimeInputParseFailure;

export function toInputParseErrorDetails(
  inputs: string,
  failure: RuntimeInputParseFailure,
): Record<string, unknown> {
  return {
    inputs,
    source: failure.source,
    parse_code: failure.code,
    ...(failure.details ?? {}),
  };
}

function parseJsonObject(
  raw: string,
  source: Exclude<RuntimeInputSource, "empty">,
): RuntimeInputParseResult {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
    ) {
      return {
        ok: false,
        source,
        code: "INPUT_JSON_PARSE_ERROR",
        message: "Runtime inputs must be a JSON object.",
        details: {
          received_type: Array.isArray(parsed) ? "array" : typeof parsed,
        },
      };
    }
    return { ok: true, source, payload: parsed as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      source,
      code: "INPUT_JSON_PARSE_ERROR",
      message: (err as Error).message,
    };
  }
}

async function parseJsonFile(path: string): Promise<RuntimeInputParseResult> {
  try {
    const text = await Deno.readTextFile(path);
    const parsed = parseJsonObject(text, "file");
    if (!parsed.ok) {
      return {
        ...parsed,
        details: {
          path,
          ...(parsed.details ?? {}),
        },
      };
    }
    return parsed;
  } catch (err) {
    return {
      ok: false,
      source: "file",
      code: "INPUT_FILE_READ_ERROR",
      message: (err as Error).message,
      details: { path },
    };
  }
}

async function detectExistingFile(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
}

export async function parseRuntimeInputsArg(
  raw?: string,
): Promise<RuntimeInputParseResult> {
  if (!raw) return { ok: true, source: "empty", payload: {} };

  if (raw.startsWith("@")) {
    const filePath = raw.slice(1);
    if (!filePath) {
      return {
        ok: false,
        source: "file",
        code: "INPUT_FILE_READ_ERROR",
        message: "Missing file path after '@' prefix.",
      };
    }
    return parseJsonFile(filePath);
  }

  if (await detectExistingFile(raw)) {
    return parseJsonFile(raw);
  }

  return parseJsonObject(raw, "inline_json");
}
