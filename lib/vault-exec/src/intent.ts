import type { LLMClient } from "./compiler.ts";
import type { VaultNote } from "./types.ts";

const SYSTEM_PROMPT = `You are a router for a vault-exec system. Given a user intent and a list of available notes (computation nodes), identify which note best answers the intent.

Reply with ONLY the exact note name. Nothing else — no explanation, no quotes, no punctuation.`;

function buildUserPrompt(intent: string, notes: VaultNote[]): string {
  const noteList = notes
    .map((n) => {
      const deps = n.wikilinks.length > 0 ? ` (depends on: ${n.wikilinks.join(", ")})` : "";
      const outputs = (n.frontmatter.outputs as string[]) ?? [];
      const outStr = outputs.length > 0 ? ` → outputs: ${outputs.join(", ")}` : "";
      return `- ${n.name}${outStr}${deps}: ${n.body.trim().split("\n")[0]}`;
    })
    .join("\n");

  return `## Available Notes
${noteList}

## User Intent
${intent}

Which note name best answers this intent? Reply with the exact note name only.`;
}

/** Resolve a natural language intent to a target note name */
export async function resolveIntent(
  intent: string,
  notes: VaultNote[],
  llm: LLMClient,
): Promise<string> {
  const response = await llm.chat(SYSTEM_PROMPT, buildUserPrompt(intent, notes));
  const target = response.trim();

  const match = notes.find((n) => n.name === target);
  if (!match) {
    // Fuzzy fallback: case-insensitive match
    const fuzzy = notes.find((n) => n.name.toLowerCase() === target.toLowerCase());
    if (fuzzy) return fuzzy.name;
    throw new Error(
      `Intent resolved to "${target}" but no note with that name exists. Available: ${notes.map((n) => n.name).join(", ")}`,
    );
  }
  return match.name;
}
