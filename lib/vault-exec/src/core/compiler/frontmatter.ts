import { parse as parseYaml } from "jsr:@std/yaml";
import type { VaultNote } from "../types.ts";

const ALLOWED_NODE_TYPES = ["value", "code", "tool"] as const;

type PayloadType = (typeof ALLOWED_NODE_TYPES)[number];

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  if (typeof tags === "string") {
    const chunks = tags.includes(",") ? tags.split(",") : [tags];
    return chunks.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  return [];
}

export function inferPayloadType(
  frontmatter: Record<string, unknown>,
): PayloadType | null {
  const hasValue = frontmatter.value !== undefined;
  const hasCode = typeof frontmatter.code === "string" &&
    frontmatter.code.trim().length > 0;
  const hasTool = typeof frontmatter.tool === "string" &&
    frontmatter.tool.trim().length > 0;
  const payloadCount = Number(hasValue) + Number(hasCode) + Number(hasTool);
  if (payloadCount !== 1) return null;
  if (hasValue) return "value";
  if (hasCode) return "code";
  return "tool";
}

function inferTypeTag(frontmatter: Record<string, unknown>): string | null {
  const type = inferPayloadType(frontmatter);
  if (!type) return null;
  return `type:${type}`;
}

function ensureTypeTag(frontmatter: Record<string, unknown>): void {
  const typeTag = inferTypeTag(frontmatter);
  if (!typeTag) return;

  const tags = normalizeTags(frontmatter.tags);
  if (!tags.includes(typeTag)) tags.push(typeTag);
  frontmatter.tags = tags;
}

function ensureNodeType(frontmatter: Record<string, unknown>): void {
  const inferred = inferPayloadType(frontmatter);
  if (!inferred) return;
  if (
    typeof frontmatter.node_type === "string" &&
    frontmatter.node_type.trim().length > 0
  ) {
    return;
  }
  frontmatter.node_type = inferred;
}

export function enrichCompiledFrontmatter(
  frontmatter: Record<string, unknown>,
): void {
  if (!frontmatter.compiled_at) {
    frontmatter.compiled_at = new Date().toISOString();
  }
  ensureNodeType(frontmatter);
  ensureTypeTag(frontmatter);
}

/** Parse raw LLM YAML response into frontmatter object */
export function parseLLMResponse(
  response: string,
  noteName: string,
): Record<string, unknown> {
  const cleaned = response
    .replace(/^```ya?ml\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    const raw = parseYaml(cleaned);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(
        `LLM returned non-object YAML for note "${noteName}": ${cleaned}`,
      );
    }
    parsed = raw as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes(`note "${noteName}"`)) {
      throw err;
    }
    throw new Error(
      `LLM returned invalid YAML for note "${noteName}": ${cleaned}`,
    );
  }

  enrichCompiledFrontmatter(parsed);
  return parsed;
}

/** Validate a single compiled note's frontmatter against its dependencies */
export function validateFrontmatter(
  fm: Record<string, unknown>,
  allNotes: VaultNote[],
): string[] {
  const errors: string[] = [];

  const hasValue = fm.value !== undefined;
  const hasCode = typeof fm.code === "string" && fm.code.trim().length > 0;
  const hasTool = typeof fm.tool === "string" && fm.tool.trim().length > 0;
  const payloadCount = Number(hasValue) + Number(hasCode) + Number(hasTool);
  const payloadType = inferPayloadType(fm);
  const declaredNodeTypeRaw = typeof fm.node_type === "string"
    ? fm.node_type.trim()
    : "";
  const declaredNodeType = declaredNodeTypeRaw.length > 0
    ? declaredNodeTypeRaw
    : null;
  const outputs = fm.outputs as string[] | undefined;

  if (!outputs || outputs.length === 0) {
    errors.push(
      `Missing "outputs" field — every node must declare at least one output.`,
    );
  }
  if (payloadCount === 0) {
    errors.push(`Must have one payload field: "value", "code", or "tool".`);
  }
  if (payloadCount > 1) {
    errors.push(
      `Cannot combine payload fields ("value", "code", "tool") — pick exactly one.`,
    );
  }
  if (!declaredNodeType) {
    errors.push(
      `Missing "node_type" field — expected one of: value | code | tool.`,
    );
  } else if (!ALLOWED_NODE_TYPES.includes(declaredNodeType as PayloadType)) {
    errors.push(
      `Invalid node_type "${declaredNodeType}" — expected one of: value | code | tool.`,
    );
  } else if (payloadType && declaredNodeType !== payloadType) {
    errors.push(
      `node_type "${declaredNodeType}" does not match payload type "${payloadType}".`,
    );
  }

  // Check input references resolve to existing notes and outputs.
  const inputs = (fm.inputs ?? {}) as Record<string, string>;
  for (const [param, template] of Object.entries(inputs)) {
    let match: RegExpExecArray | null;
    const re = /\{\{([^}]+)\}\}/g;
    while ((match = re.exec(template)) !== null) {
      const parts = match[1].trim().split(".");
      const refNote = parts[0];
      const refOutput = parts.length > 1 ? parts.slice(1).join(".") : "output";
      if (refNote === "input" || refNote === "inputs") continue;
      const target = allNotes.find((n) => n.name === refNote);
      if (!target) {
        errors.push(
          `Input "${param}" references "{{${
            match[1]
          }}}" but note "${refNote}" does not exist.`,
        );
      } else {
        const targetOutputs = (target.frontmatter.outputs as string[]) ?? [];
        if (targetOutputs.length > 0 && !targetOutputs.includes(refOutput)) {
          errors.push(
            `Input "${param}" references "{{${
              match[1]
            }}}" but "${refNote}" outputs are [${
              targetOutputs.join(", ")
            }], not "${refOutput}".`,
          );
        }
      }
    }
  }

  return errors;
}
