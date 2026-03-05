import type { VaultGraph } from "./types.ts";
import { parseRef } from "./template.ts";

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
  issues: RuntimeInputValidationIssue[];
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
export function buildRuntimeInputSchema(graph: VaultGraph): RuntimeInputSchema | null {
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

    const properties = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
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

  // Fallback infer from runtime refs when no explicit input_schema exists.
  if (!hasDeclaredSchema) {
    const inferred = extractRuntimeInputKeys(graph);
    for (const key of inferred) {
      if (!merged.properties[key]) merged.properties[key] = { type: "string" };
      requiredSet.add(key);
    }
  }

  merged.required = [...requiredSet].sort();

  if (Object.keys(merged.properties).length === 0) return null;
  return merged;
}

function matchesType(value: unknown, schemaType: string): boolean {
  switch (schemaType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      // Unknown types are ignored for compatibility with partial schemas.
      return true;
  }
}

function propertyTypeIsValid(value: unknown, propertySchema: Record<string, unknown>): boolean {
  const declaredType = propertySchema.type;
  if (typeof declaredType === "string") {
    return matchesType(value, declaredType);
  }
  if (Array.isArray(declaredType)) {
    return declaredType.some((candidate) => typeof candidate === "string" && matchesType(value, candidate));
  }
  return true;
}

function deriveStatus(issues: RuntimeInputValidationIssue[]): RuntimeValidationStatus {
  if (issues.length === 0) return "OK";

  const kinds = new Set(issues.map((i) => i.kind));
  // Keep status labels simple and aligned with AX plan intent.
  if (kinds.size === 1 && kinds.has("missing")) return "MISSING";
  if (kinds.size === 1 && kinds.has("extra")) return "EXTRA";
  if (!kinds.has("invalid") && kinds.has("missing")) return "MISSING";
  if (!kinds.has("invalid") && kinds.has("extra")) return "EXTRA";
  return "INVALID";
}

/**
 * Validate runtime payload against the graph's runtime schema.
 * Returns normalized issues for candidate pre-validation and final run checks.
 */
export function validateRuntimeInputsForGraph(
  graph: VaultGraph,
  payload: Record<string, unknown>,
): RuntimeInputValidationResult {
  const schema = buildRuntimeInputSchema(graph);
  if (!schema) {
    return { ok: true, status: "OK", schema: null, issues: [] };
  }

  const issues: RuntimeInputValidationIssue[] = [];

  for (const requiredKey of schema.required) {
    if (!Object.hasOwn(payload, requiredKey)) {
      issues.push({
        kind: "missing",
        path: `/${requiredKey}`,
        message: `missing required input "${requiredKey}"`,
      });
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    const propertySchema = schema.properties[key];
    if (!propertySchema) {
      if (schema.additionalProperties === false) {
        issues.push({
          kind: "extra",
          path: `/${key}`,
          message: `unexpected input "${key}"`,
        });
      }
      continue;
    }

    if (!propertyTypeIsValid(value, propertySchema)) {
      const declaredType = Array.isArray(propertySchema.type)
        ? propertySchema.type.join("|")
        : String(propertySchema.type ?? "unknown");
      issues.push({
        kind: "invalid",
        path: `/${key}`,
        message: `expected type ${declaredType}`,
      });
    }
  }

  if (issues.length === 0) {
    return { ok: true, status: "OK", schema, issues: [] };
  }

  return {
    ok: false,
    status: deriveStatus(issues),
    schema,
    issues,
  };
}

export function summarizeRuntimeInputCompatibility(result: RuntimeInputValidationResult): string {
  if (result.status === "OK") return "OK";

  const missing = [...new Set(result.issues.filter((i) => i.kind === "missing").map((i) => i.path.split("/").pop()))]
    .filter((v): v is string => !!v)
    .sort();
  const extra = [...new Set(result.issues.filter((i) => i.kind === "extra").map((i) => i.path.split("/").pop()))]
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
