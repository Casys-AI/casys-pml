import { parse as parseYaml, stringify as stringifyYaml } from "jsr:@std/yaml";
import type { VaultNote } from "./types.ts";

// ── LLM interface ──────────────────────────────────────────────────────────────

export interface LLMClient {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
}

// ── OpenAI implementation ──────────────────────────────────────────────────────

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content.trim();
  }
}

// ── Prompts ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a compiler that transforms natural language Markdown notes into executable vault-exec nodes.

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
    // Describe shape of first element only
    return `Array<${describeShape(val[0], depth + 1)}>`;
  }
  if (typeof val === "object" && depth < 2) {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const fields = entries.map(([k, v]) => `${k}: ${describeShape(v, depth + 1)}`);
    return `{ ${fields.join(", ")} }`;
  }
  return "object";
}

function buildUserPrompt(note: VaultNote, allNotes: VaultNote[]): string {
  const otherNotes = allNotes
    .filter((n) => n.name !== note.name)
    .map((n) => {
      const outputs = (n.frontmatter.outputs as string[]) ?? [];
      const compiled = n.frontmatter.compiled_at ? " (compiled)" : " (not yet compiled)";
      return `- ${n.name}: outputs=[${outputs.join(", ")}]${compiled}`;
    })
    .join("\n");

  const deps = note.wikilinks.length > 0
    ? note.wikilinks.map((w) => `- [[${w}]]`).join("\n")
    : "None";

  const schemas = buildSchemaLines(note, allNotes);
  const schemaSection = schemas.length > 0
    ? `\n## Data Schemas of Dependencies\nThese are the EXACT property names available. Use ONLY these field names in your code.\n${schemas.join("\n")}\n`
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

// ── Core functions ─────────────────────────────────────────────────────────────

/** Check if a note needs compilation */
export function needsCompilation(note: VaultNote): boolean {
  return !note.frontmatter.compiled_at;
}

const MAX_COMPILE_RETRIES = 3;

/** Parse raw LLM YAML response into frontmatter object */
function parseLLMResponse(response: string, noteName: string): Record<string, unknown> {
  const cleaned = response
    .replace(/^```ya?ml\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    const raw = parseYaml(cleaned);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`LLM returned non-object YAML for note "${noteName}": ${cleaned}`);
    }
    parsed = raw as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes(`note "${noteName}"`)) {
      throw err;
    }
    throw new Error(`LLM returned invalid YAML for note "${noteName}": ${cleaned}`);
  }

  if (!parsed.compiled_at) {
    parsed.compiled_at = new Date().toISOString();
  }

  return parsed;
}

/** Validate a single compiled note's frontmatter against its dependencies */
export function validateFrontmatter(
  fm: Record<string, unknown>,
  note: VaultNote,
  allNotes: VaultNote[],
): string[] {
  const errors: string[] = [];

  const hasValue = "value" in fm;
  const hasCode = "code" in fm;
  const outputs = fm.outputs as string[] | undefined;

  if (!outputs || outputs.length === 0) {
    errors.push(`Missing "outputs" field — every node must declare at least one output.`);
  }
  if (!hasValue && !hasCode) {
    errors.push(`Must have either "value" or "code" field.`);
  }
  if (hasValue && hasCode) {
    errors.push(`Cannot have both "value" and "code" — pick one.`);
  }

  // Check input references resolve to existing notes and outputs
  const inputs = (fm.inputs ?? {}) as Record<string, string>;
  for (const [param, template] of Object.entries(inputs)) {
    let match: RegExpExecArray | null;
    const re = /\{\{([^}]+)\}\}/g;
    while ((match = re.exec(template)) !== null) {
      const parts = match[1].trim().split(".");
      const refNote = parts[0];
      const refOutput = parts.length > 1 ? parts.slice(1).join(".") : "output";
      const target = allNotes.find((n) => n.name === refNote);
      if (!target) {
        errors.push(`Input "${param}" references "{{${match[1]}}}" but note "${refNote}" does not exist.`);
      } else {
        const targetOutputs = (target.frontmatter.outputs as string[]) ?? [];
        if (targetOutputs.length > 0 && !targetOutputs.includes(refOutput)) {
          errors.push(
            `Input "${param}" references "{{${match[1]}}}" but "${refNote}" outputs are [${targetOutputs.join(", ")}], not "${refOutput}".`,
          );
        }
      }
    }
  }

  return errors;
}

/** Compile a single note using the LLM (no validation — see compileVault for retry loop) */
export async function compileNote(
  note: VaultNote,
  allNotes: VaultNote[],
  llm: LLMClient,
): Promise<Record<string, unknown>> {
  const userPrompt = buildUserPrompt(note, allNotes);
  const response = await llm.chat(SYSTEM_PROMPT, userPrompt);
  return parseLLMResponse(response, note.name);
}

/** Build data schema lines for a note's dependencies. Returns empty array if no schemas. */
function buildSchemaLines(note: VaultNote, allNotes: VaultNote[]): string[] {
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

/** Re-compile a note with validation errors fed back to the LLM */
async function recompileNote(
  note: VaultNote,
  allNotes: VaultNote[],
  llm: LLMClient,
  prevFrontmatter: Record<string, unknown>,
  errors: string[],
): Promise<Record<string, unknown>> {
  const schemas = buildSchemaLines(note, allNotes);
  const schemasBlock = schemas.length > 0
    ? `\nData Schemas of Dependencies (use EXACT property names):\n${schemas.join("\n")}`
    : "";

  const retryPrompt = `Your previous YAML frontmatter for "${note.name}" had ${errors.length} validation error(s):

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Previous output:
${stringifyYaml(prevFrontmatter).trim()}

Context — other notes in the vault:
${allNotes.filter((n) => n.name !== note.name).map((n) => {
  const outs = (n.frontmatter.outputs as string[]) ?? [];
  return `- ${n.name}: outputs=[${outs.join(", ")}]`;
}).join("\n")}
${schemasBlock}

Fix these errors and regenerate the YAML frontmatter. ONLY valid YAML, no fences, no explanation.`;

  const response = await llm.chat(SYSTEM_PROMPT, retryPrompt);
  return parseLLMResponse(response, note.name);
}

/** Reconstruct a .md file with new frontmatter prepended to the existing body */
export function reconstructNote(
  body: string,
  frontmatter: Record<string, unknown>,
): string {
  const yaml = stringifyYaml(frontmatter).trim();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

/** Compile all uncompiled notes in the vault, with validate → re-compile loop */
export async function compileVault(
  notes: VaultNote[],
  llm: LLMClient,
  onProgress?: (note: string, index: number, total: number) => void,
): Promise<Map<string, { frontmatter: Record<string, unknown>; fullContent: string }>> {
  // Sort uncompiled notes: leaf nodes first (0 deps), then dependents.
  // This ensures value nodes are compiled before code nodes that reference them,
  // so data schemas are available when the LLM compiles downstream nodes.
  const uncompiled = notes.filter(needsCompilation);
  const noteNames = new Set(uncompiled.map((n) => n.name));
  uncompiled.sort((a, b) => {
    const aDeps = a.wikilinks.filter((w) => noteNames.has(w)).length;
    const bDeps = b.wikilinks.filter((w) => noteNames.has(w)).length;
    return aDeps - bDeps;
  });

  const results = new Map<
    string,
    { frontmatter: Record<string, unknown>; fullContent: string }
  >();

  // Pass 1: compile all notes in dependency order (leaves first)
  for (let i = 0; i < uncompiled.length; i++) {
    const note = uncompiled[i];
    onProgress?.(note.name, i + 1, uncompiled.length);

    const frontmatter = await compileNote(note, notes, llm);
    note.frontmatter = frontmatter;
    results.set(note.name, { frontmatter, fullContent: reconstructNote(note.body, frontmatter) });
  }

  // Pass 2+: validate all, re-compile broken notes (max 3 rounds)
  for (let round = 1; round <= MAX_COMPILE_RETRIES; round++) {
    const broken: Array<{ note: VaultNote; errors: string[] }> = [];
    for (const note of uncompiled) {
      const errors = validateFrontmatter(note.frontmatter, note, notes);
      if (errors.length > 0) broken.push({ note, errors });
    }

    if (broken.length === 0) break;

    console.log(`\n  Validation round ${round}: ${broken.length} note(s) with errors, re-compiling...`);
    for (const { note, errors } of broken) {
      console.log(`    ✗ ${note.name}: ${errors[0]}`);
      const fixed = await recompileNote(note, notes, llm, note.frontmatter, errors);
      note.frontmatter = fixed;
      results.set(note.name, { frontmatter: fixed, fullContent: reconstructNote(note.body, fixed) });
    }
  }

  // Final check — fail-fast if still broken
  const remaining: string[] = [];
  for (const note of uncompiled) {
    const errors = validateFrontmatter(note.frontmatter, note, notes);
    if (errors.length > 0) {
      remaining.push(`${note.name}: ${errors.join("; ")}`);
    }
  }
  if (remaining.length > 0) {
    throw new Error(
      `Compilation failed after ${MAX_COMPILE_RETRIES} retry rounds:\n${remaining.join("\n")}`,
    );
  }

  return results;
}
