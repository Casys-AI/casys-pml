import { stringify as stringifyYaml } from "jsr:@std/yaml";
import type { VaultNote } from "../types.ts";

export const SYSTEM_PROMPT =
  `You are a compiler that transforms natural language Markdown notes into executable vault-exec nodes.

Each note is a computation node in a DAG. Your job: analyze the note and generate YAML frontmatter.

## Node Types

1. **value** — A literal value (a path, number, config object, list, etc.)
   Example:
   value: "/etc/app/config.json"
   outputs:
     - output

2. **code** — A computation on data from dependency notes. Write a single JS expression.
   Example:
   inputs:
     items: "{{Inventory.items}}"
   code: "items.reduce((sum, i) => sum + i.quantity, 0)"
   outputs:
     - totalQuantity

## Rules
- Generate ONLY valid YAML. No markdown fences, no explanation, no comments.
- For value nodes: the value field contains the literal data.
- For code nodes: the code field is a single JS expression (not a statement, no semicolons, no return keyword).
- Input references use {{NoteName.output_name}} syntax where NoteName matches a dependency note title exactly.
- If a dependency has a single output, you can use {{NoteName}} as shorthand for {{NoteName.output}}.
- Always include compiled_at with the current ISO timestamp.
- Always include tags in frontmatter. Add exactly one type tag:
  - value node -> tags includes "type:value"
  - code node -> tags includes "type:code"
- Output names should be descriptive (not just "output" unless the note is a simple value).
- CRITICAL: When dependency notes provide structured data, use the EXACT property names from their data schema. Do NOT guess or infer property names — use only the fields documented in the "Data Schemas" section below.`;

/** Describe the shape of a JS value for the LLM (type + property names, no actual data) */
function describeShape(val: unknown, depth = 0): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "string") return "string";
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    // Describe shape of first element only.
    return `Array<${describeShape(val[0], depth + 1)}>`;
  }
  if (typeof val === "object" && depth < 2) {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const fields = entries.map(([k, v]) =>
      `${k}: ${describeShape(v, depth + 1)}`
    );
    return `{ ${fields.join(", ")} }`;
  }
  return "object";
}

/** Build data schema lines for a note's dependencies. Returns empty array if no schemas. */
export function buildSchemaLines(
  note: VaultNote,
  allNotes: VaultNote[],
): string[] {
  const schemas: string[] = [];
  for (const depName of note.wikilinks) {
    const depNote = allNotes.find((n) => n.name === depName);
    if (!depNote?.frontmatter.compiled_at) continue;
    const fm = depNote.frontmatter;
    const outputs = (fm.outputs as string[]) ?? [];
    if ("value" in fm && fm.value !== undefined) {
      for (const out of outputs) {
        schemas.push(`- ${depName}.${out}: ${describeShape(fm.value)}`);
      }
    } else if ("code" in fm && fm.code) {
      for (const out of outputs) {
        schemas.push(`- ${depName}.${out}: (computed, see note body)`);
      }
    }
  }
  return schemas;
}

export function buildUserPrompt(
  note: VaultNote,
  allNotes: VaultNote[],
): string {
  const otherNotes = allNotes
    .filter((n) => n.name !== note.name)
    .map((n) => {
      const outputs = (n.frontmatter.outputs as string[]) ?? [];
      const compiled = n.frontmatter.compiled_at
        ? " (compiled)"
        : " (not yet compiled)";
      return `- ${n.name}: outputs=[${outputs.join(", ")}]${compiled}`;
    })
    .join("\n");

  const deps = note.wikilinks.length > 0
    ? note.wikilinks.map((w) => `- [[${w}]]`).join("\n")
    : "None";

  const schemas = buildSchemaLines(note, allNotes);
  const schemaSection = schemas.length > 0
    ? `\n## Data Schemas of Dependencies\nThese are the EXACT property names available. Use ONLY these field names in your code.\n${
      schemas.join("\n")
    }\n`
    : "";

  return `## Available Notes in This Vault
${otherNotes || "None"}

## Dependencies (from [[wikilinks]])
${deps}
${schemaSection}
## Note to Compile
Title: ${note.name}
Body:
${note.body}

Generate the YAML frontmatter now. Remember: ONLY valid YAML, no fences, no explanation.`;
}

export function buildRetryPrompt(
  note: VaultNote,
  allNotes: VaultNote[],
  prevFrontmatter: Record<string, unknown>,
  errors: string[],
): string {
  const schemas = buildSchemaLines(note, allNotes);
  const schemasBlock = schemas.length > 0
    ? `\nData Schemas of Dependencies (use EXACT property names):\n${
      schemas.join("\n")
    }`
    : "";

  return `Your previous YAML frontmatter for "${note.name}" had ${errors.length} validation error(s):

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Previous output:
${stringifyYaml(prevFrontmatter).trim()}

Context — other notes in the vault:
${
    allNotes.filter((n) => n.name !== note.name).map((n) => {
      const outs = (n.frontmatter.outputs as string[]) ?? [];
      return `- ${n.name}: outputs=[${outs.join(", ")}]`;
    }).join("\n")
  }
${schemasBlock}

Fix these errors and regenerate the YAML frontmatter. ONLY valid YAML, no fences, no explanation.`;
}
