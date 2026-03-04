import type { VaultGraph } from "./types.ts";
import { parseRef } from "./template.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

export interface RuntimeInputSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: boolean;
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

export function hasRuntimeInputs(graph: VaultGraph): boolean {
  return extractRuntimeInputKeys(graph).length > 0 ||
    [...graph.nodes.values()].some((n) => !!n.inputSchema);
}
