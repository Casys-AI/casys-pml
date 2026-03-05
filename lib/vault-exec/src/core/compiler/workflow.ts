import { stringify as stringifyYaml } from "jsr:@std/yaml";
import type { LLMClient } from "../ports/llm.ts";
import type { VaultNote } from "../types.ts";
import { parseLLMResponse, validateFrontmatter } from "./frontmatter.ts";
import { buildRetryPrompt, buildUserPrompt, SYSTEM_PROMPT } from "./prompt.ts";

const MAX_COMPILE_RETRIES = 3;

/** Check if a note needs compilation */
export function needsCompilation(note: VaultNote): boolean {
  return !note.frontmatter.compiled_at;
}

/** Reconstruct a .md file with new frontmatter prepended to the existing body */
export function reconstructNote(
  body: string,
  frontmatter: Record<string, unknown>,
): string {
  const yaml = stringifyYaml(frontmatter).trim();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
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

/** Re-compile a note with validation errors fed back to the LLM */
async function recompileNote(
  note: VaultNote,
  allNotes: VaultNote[],
  llm: LLMClient,
  prevFrontmatter: Record<string, unknown>,
  errors: string[],
): Promise<Record<string, unknown>> {
  const retryPrompt = buildRetryPrompt(note, allNotes, prevFrontmatter, errors);
  const response = await llm.chat(SYSTEM_PROMPT, retryPrompt);
  return parseLLMResponse(response, note.name);
}

/** Compile all uncompiled notes in the vault, with validate → re-compile loop */
export async function compileVault(
  notes: VaultNote[],
  llm: LLMClient,
  onProgress?: (note: string, index: number, total: number) => void,
): Promise<
  Map<string, { frontmatter: Record<string, unknown>; fullContent: string }>
> {
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

  // Pass 1: compile all notes in dependency order (leaves first).
  for (let i = 0; i < uncompiled.length; i++) {
    const note = uncompiled[i];
    onProgress?.(note.name, i + 1, uncompiled.length);

    const frontmatter = await compileNote(note, notes, llm);
    note.frontmatter = frontmatter;
    results.set(note.name, {
      frontmatter,
      fullContent: reconstructNote(note.body, frontmatter),
    });
  }

  // Pass 2+: validate all, re-compile broken notes (max 3 rounds).
  for (let round = 1; round <= MAX_COMPILE_RETRIES; round++) {
    const broken: Array<{ note: VaultNote; errors: string[] }> = [];
    for (const note of uncompiled) {
      const errors = validateFrontmatter(note.frontmatter, notes);
      if (errors.length > 0) broken.push({ note, errors });
    }

    if (broken.length === 0) break;

    console.log(
      `\n  Validation round ${round}: ${broken.length} note(s) with errors, re-compiling...`,
    );
    for (const { note, errors } of broken) {
      console.log(`    ✗ ${note.name}: ${errors[0]}`);
      const fixed = await recompileNote(
        note,
        notes,
        llm,
        note.frontmatter,
        errors,
      );
      note.frontmatter = fixed;
      results.set(note.name, {
        frontmatter: fixed,
        fullContent: reconstructNote(note.body, fixed),
      });
    }
  }

  // Final check — fail-fast if still broken.
  const remaining: string[] = [];
  for (const note of uncompiled) {
    const errors = validateFrontmatter(note.frontmatter, notes);
    if (errors.length > 0) {
      remaining.push(`${note.name}: ${errors.join("; ")}`);
    }
  }
  if (remaining.length > 0) {
    throw new Error(
      `Compilation failed after ${MAX_COMPILE_RETRIES} retry rounds:\n${
        remaining.join("\n")
      }`,
    );
  }

  return results;
}
