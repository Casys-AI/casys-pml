import type { VaultNote } from "../types.ts";
import type { IVaultStore } from "../db/types.ts";
import type { EmbeddingModel } from "./model.ts";

/** FNV-1a 32-bit hash — fast content fingerprint for change detection */
function hashBody(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Compute topological depth for each note (0 = leaf, no wikilinks).
 * Handles cycles defensively by treating back-edges as depth 0.
 */
export function computeLevels(notes: VaultNote[]): Map<string, number> {
  const levels = new Map<string, number>();
  const noteSet = new Set(notes.map((n) => n.name));
  const visiting = new Set<string>();

  function getLevel(name: string): number {
    if (levels.has(name)) return levels.get(name)!;
    if (visiting.has(name)) return 0; // cycle — treat as leaf to avoid infinite recursion

    visiting.add(name);
    const note = notes.find((n) => n.name === name);
    if (!note || note.wikilinks.length === 0) {
      levels.set(name, 0);
      visiting.delete(name);
      return 0;
    }

    const depLevels = note.wikilinks
      .filter((w) => noteSet.has(w))
      .map((w) => getLevel(w));
    const level = depLevels.length > 0 ? Math.max(...depLevels) + 1 : 0;
    levels.set(name, level);
    visiting.delete(name);
    return level;
  }

  for (const note of notes) getLevel(note.name);
  return levels;
}

export interface IndexStats {
  indexed: number;
  skipped: number;
}

/**
 * Index all vault notes with embeddings and hierarchy levels.
 *
 * For each note:
 * 1. Upsert the note row (name, path, hash, level) and its edges — always
 * 2. Skip embedding computation if body hash is unchanged
 * 3. Compute and store the embedding otherwise
 */
export async function indexVault(
  notes: VaultNote[],
  db: IVaultStore,
  model: EmbeddingModel,
): Promise<IndexStats> {
  const levels = computeLevels(notes);
  const existing = await db.getAllNotes();
  const existingHashes = new Map(existing.map((n) => [n.name, n.bodyHash]));
  let indexed = 0;
  let skipped = 0;

  for (const note of notes) {
    const hash = hashBody(note.body.trim());
    const level = levels.get(note.name) ?? 0;

    // Always upsert metadata + edges (level may change even if body didn't)
    await db.upsertNote({ name: note.name, path: note.path, bodyHash: hash, level });
    await db.setEdges(note.name, note.wikilinks);

    // Skip expensive embedding if body unchanged
    if (existingHashes.get(note.name) === hash) {
      skipped++;
      continue;
    }

    const embedding = await model.encodeNote(note.name, note.body);
    await db.updateNoteEmbedding(note.name, embedding);
    indexed++;
  }

  return { indexed, skipped };
}
