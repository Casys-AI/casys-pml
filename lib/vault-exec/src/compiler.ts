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
     data: "{{Source Note.output}}"
   code: "data.filter(item => item.active)"
   outputs:
     - result

## Rules
- Generate ONLY valid YAML. No markdown fences, no explanation, no comments.
- For value nodes: the value field contains the literal data.
- For code nodes: the code field is a single JS expression (not a statement, no semicolons, no return keyword).
- Input references use {{NoteName.output_name}} syntax where NoteName matches a dependency note title exactly.
- If a dependency has a single output, you can use {{NoteName}} as shorthand for {{NoteName.output}}.
- Always include compiled_at with the current ISO timestamp.
- Output names should be descriptive (not just "output" unless the note is a simple value).`;

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

  return `## Available Notes in This Vault
${otherNotes || "None"}

## Dependencies (from [[wikilinks]])
${deps}

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

/** Compile a single note using the LLM */
export async function compileNote(
  note: VaultNote,
  allNotes: VaultNote[],
  llm: LLMClient,
): Promise<Record<string, unknown>> {
  const userPrompt = buildUserPrompt(note, allNotes);
  const response = await llm.chat(SYSTEM_PROMPT, userPrompt);

  // Clean up response — remove markdown fences if LLM added them
  const cleaned = response
    .replace(/^```ya?ml\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    const raw = parseYaml(cleaned);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`LLM returned non-object YAML for note "${note.name}": ${cleaned}`);
    }
    parsed = raw as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes(`note "${note.name}"`)) {
      throw err;
    }
    throw new Error(`LLM returned invalid YAML for note "${note.name}": ${cleaned}`);
  }

  // Ensure compiled_at is set
  if (!parsed.compiled_at) {
    parsed.compiled_at = new Date().toISOString();
  }

  return parsed;
}

/** Reconstruct a .md file with new frontmatter prepended to the existing body */
export function reconstructNote(
  body: string,
  frontmatter: Record<string, unknown>,
): string {
  const yaml = stringifyYaml(frontmatter).trim();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

/** Compile all uncompiled notes in the vault */
export async function compileVault(
  notes: VaultNote[],
  llm: LLMClient,
  onProgress?: (note: string, index: number, total: number) => void,
): Promise<Map<string, { frontmatter: Record<string, unknown>; fullContent: string }>> {
  const uncompiled = notes.filter(needsCompilation);
  const results = new Map<
    string,
    { frontmatter: Record<string, unknown>; fullContent: string }
  >();

  // Compile in order — the LLM receives partial context for already-compiled notes
  for (let i = 0; i < uncompiled.length; i++) {
    const note = uncompiled[i];
    onProgress?.(note.name, i + 1, uncompiled.length);

    const frontmatter = await compileNote(note, notes, llm);
    const fullContent = reconstructNote(note.body, frontmatter);

    // Update the note's frontmatter so subsequent compilations have richer context
    note.frontmatter = frontmatter;

    results.set(note.name, { frontmatter, fullContent });
  }

  return results;
}
