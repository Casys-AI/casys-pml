import AjvModule from "npm:ajv";
import type { ErrorObject } from "npm:ajv";
import type { VaultGraph } from "../core/contracts.ts";
import { parseRef } from "../core/template.ts";

// deno-lint-ignore no-explicit-any
const Ajv = (AjvModule as any).default ?? AjvModule;

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

export interface RuntimeInputSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: boolean;
}

export type RuntimeValidationStatus = "OK" | "MISSING" | "EXTRA" | "INVALID";

export interface RuntimeInputValidationIssue {
  kind: "missing" | "extra" | "invalid";
  /** JSON Pointer-like path. */
  path: string;
  message: string;
}

export interface RuntimeInputValidationResult {
  ok: boolean;
  status: RuntimeValidationStatus;
  schema: RuntimeInputSchema | null;
  schemaSource: RuntimeInputSchemaSource;
  issues: RuntimeInputValidationIssue[];
}

export type RuntimeInputSchemaSource = "none" | "declared" | "inferred";

export interface RuntimeInputSchemaBuildResult {
  schema: RuntimeInputSchema | null;
  source: RuntimeInputSchemaSource;
}

export const RUNTIME_PAYLOAD_MODES = ["strict", "project"] as const;
export type RuntimePayloadMode = (typeof RUNTIME_PAYLOAD_MODES)[number];

export interface RuntimePayloadModeParseResult {
  ok: boolean;
  mode?: RuntimePayloadMode;
  received: string;
  allowedModes: RuntimePayloadMode[];
}

export interface RuntimeInputPreparationResult {
  mode: RuntimePayloadMode;
  payload: Record<string, unknown>;
  projected: boolean;
  droppedKeys: string[];
  validation: RuntimeInputValidationResult;
}

export function parseRuntimePayloadMode(
  rawMode?: string,
): RuntimePayloadModeParseResult {
  const received = (rawMode ?? "strict").trim().toLowerCase();
  const allowedModes: RuntimePayloadMode[] = [...RUNTIME_PAYLOAD_MODES];
  if (
    (RUNTIME_PAYLOAD_MODES as readonly string[]).includes(received)
  ) {
    return {
      ok: true,
      mode: received as RuntimePayloadMode,
      received,
      allowedModes,
    };
  }
  return { ok: false, received, allowedModes };
}

function isRuntimeRefNote(note: string): boolean {
  return note === "input" || note === "inputs";
}

/** Extract runtime input keys from {{input.foo}} / {{inputs.foo}} templates */
export function extractRuntimeInputKeys(graph: VaultGraph): string[] {
  const keys = new Set<string>();

  for (const node of graph.nodes.values()) {
    for (const template of Object.values(node.inputs)) {
      const re = new RegExp(TEMPLATE_RE.source, "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(template)) !== null) {
        const ref = parseRef(match[1]);
        if (isRuntimeRefNote(ref.note)) {
          keys.add(ref.output);
        }
      }
    }
  }

  return [...keys].sort();
}

/**
 * Build runtime schema from node frontmatter `input_schema` if present.
 * Fallback: infer required string fields from runtime refs.
 */
export function buildRuntimeInputSchema(
  graph: VaultGraph,
): RuntimeInputSchema | null {
  return buildRuntimeInputSchemaWithSource(graph).schema;
}

export function buildRuntimeInputSchemaWithSource(
  graph: VaultGraph,
): RuntimeInputSchemaBuildResult {
  const merged: RuntimeInputSchema = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  };

  const requiredSet = new Set<string>();
  let hasDeclaredSchema = false;

  for (const node of graph.nodes.values()) {
    const schema = node.inputSchema;
    if (!schema || typeof schema !== "object") continue;

    const properties = (schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined) ?? {};
    const required = (schema.required as string[] | undefined) ?? [];

    for (const [k, v] of Object.entries(properties)) {
      if (!merged.properties[k]) merged.properties[k] = v;
    }
    for (const key of required) requiredSet.add(key);

    if (typeof schema.additionalProperties === "boolean") {
      merged.additionalProperties = schema.additionalProperties;
    }

    hasDeclaredSchema = true;
  }

  const inferred = extractRuntimeInputKeys(graph);
  for (const key of inferred) {
    if (!merged.properties[key]) merged.properties[key] = { type: "string" };
    requiredSet.add(key);
  }

  merged.required = [...requiredSet].sort();

  if (Object.keys(merged.properties).length === 0) {
    return { schema: null, source: "none" };
  }

  return {
    schema: merged,
    source: hasDeclaredSchema ? "declared" : "inferred",
  };
}

function issueFromAjvError(err: ErrorObject): RuntimeInputValidationIssue {
  if (err.keyword === "required") {
    const missing = String(
      (err.params as { missingProperty?: string }).missingProperty ?? "unknown",
    );
    return {
      kind: "missing",
      path: `${err.instancePath || ""}/${missing}`,
      message: `missing required input "${missing}"`,
    };
  }

  if (err.keyword === "additionalProperties") {
    const extra = String(
      (err.params as { additionalProperty?: string }).additionalProperty ??
        "unknown",
    );
    return {
      kind: "extra",
      path: `${err.instancePath || ""}/${extra}`,
      message: `unexpected input "${extra}"`,
    };
  }

  return {
    kind: "invalid",
    path: err.instancePath || "/",
    message: err.message ?? "invalid runtime input",
  };
}

function deriveStatus(
  issues: RuntimeInputValidationIssue[],
): RuntimeValidationStatus {
  if (issues.length === 0) return "OK";

  const kinds = new Set(issues.map((i) => i.kind));
  // Keep status labels simple and aligned with the runtime input contract.
  if (kinds.size === 1 && kinds.has("missing")) return "MISSING";
  if (kinds.size === 1 && kinds.has("extra")) return "EXTRA";
  if (!kinds.has("invalid") && kinds.has("missing")) return "MISSING";
  if (!kinds.has("invalid") && kinds.has("extra")) return "EXTRA";
  return "INVALID";
}

function validatePayloadAgainstSchema(
  schema: RuntimeInputSchema,
  source: RuntimeInputSchemaSource,
  payload: Record<string, unknown>,
): RuntimeInputValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema as unknown as Record<string, unknown>);
  const ok = validate(payload);
  if (ok) {
    return { ok: true, status: "OK", schema, schemaSource: source, issues: [] };
  }

  const issues = (validate.errors ?? []).map(issueFromAjvError);
  return {
    ok: false,
    status: deriveStatus(issues),
    schema,
    schemaSource: source,
    issues,
  };
}

/**
 * Validate runtime payload against the graph's runtime schema.
 * Returns normalized issues for candidate pre-validation and final run checks.
 */
export function validateRuntimeInputsForGraph(
  graph: VaultGraph,
  payload: Record<string, unknown>,
): RuntimeInputValidationResult {
  const { schema, source } = buildRuntimeInputSchemaWithSource(graph);
  if (!schema) {
    return {
      ok: true,
      status: "OK",
      schema: null,
      schemaSource: source,
      issues: [],
    };
  }

  return validatePayloadAgainstSchema(schema, source, payload);
}

function projectPayloadToSchema(
  payload: Record<string, unknown>,
  schema: RuntimeInputSchema,
): { projectedPayload: Record<string, unknown>; droppedKeys: string[] } {
  if (schema.additionalProperties) {
    return { projectedPayload: payload, droppedKeys: [] };
  }

  const allowed = new Set(Object.keys(schema.properties));
  const droppedKeys = Object.keys(payload)
    .filter((key) => !allowed.has(key))
    .sort();

  if (droppedKeys.length === 0) {
    return { projectedPayload: payload, droppedKeys: [] };
  }

  const projectedPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => allowed.has(key)),
  );
  return { projectedPayload, droppedKeys };
}

export function prepareRuntimeInputsForGraph(
  graph: VaultGraph,
  payload: Record<string, unknown>,
  mode: RuntimePayloadMode,
): RuntimeInputPreparationResult {
  const { schema, source } = buildRuntimeInputSchemaWithSource(graph);
  if (!schema) {
    return {
      mode,
      payload,
      projected: false,
      droppedKeys: [],
      validation: {
        ok: true,
        status: "OK",
        schema: null,
        schemaSource: source,
        issues: [],
      },
    };
  }

  const initialValidation = validatePayloadAgainstSchema(
    schema,
    source,
    payload,
  );
  if (mode === "strict") {
    return {
      mode,
      payload,
      projected: false,
      droppedKeys: [],
      validation: initialValidation,
    };
  }

  const { projectedPayload, droppedKeys } = projectPayloadToSchema(
    payload,
    schema,
  );
  if (droppedKeys.length === 0) {
    return {
      mode,
      payload,
      projected: false,
      droppedKeys: [],
      validation: initialValidation,
    };
  }

  return {
    mode,
    payload: projectedPayload,
    projected: true,
    droppedKeys,
    validation: validatePayloadAgainstSchema(schema, source, projectedPayload),
  };
}

export function summarizeRuntimeInputCompatibility(
  result: RuntimeInputValidationResult,
): string {
  if (result.status === "OK") return "OK";

  const missing = [
    ...new Set(
      result.issues.filter((i) => i.kind === "missing").map((i) =>
        i.path.split("/").pop()
      ),
    ),
  ]
    .filter((v): v is string => !!v)
    .sort();
  const extra = [
    ...new Set(
      result.issues.filter((i) => i.kind === "extra").map((i) =>
        i.path.split("/").pop()
      ),
    ),
  ]
    .filter((v): v is string => !!v)
    .sort();
  const invalidCount = result.issues.filter((i) => i.kind === "invalid").length;

  const details: string[] = [];
  if (missing.length > 0) details.push(`missing=[${missing.join(",")}]`);
  if (extra.length > 0) details.push(`extra=[${extra.join(",")}]`);
  if (invalidCount > 0) details.push(`invalid=${invalidCount}`);

  return `${result.status}${details.length > 0 ? ` ${details.join(" ")}` : ""}`;
}

export function hasRuntimeInputs(graph: VaultGraph): boolean {
  return extractRuntimeInputKeys(graph).length > 0 ||
    [...graph.nodes.values()].some((n) => !!n.inputSchema);
}
