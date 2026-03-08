import { assertEquals } from "jsr:@std/assert";
import { computeLevels, indexVault } from "./indexer.ts";
import { VaultKV } from "../db/store-kv.ts";
import { type Embedder, EmbeddingModel } from "./model.ts";
import type { VaultNote } from "../core/types.ts";

class MockEmbedder implements Embedder {
  calls: string[] = [];
  async encode(text: string): Promise<number[]> {
    this.calls.push(text);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.1);
  }
  isLoaded() {
    return true;
  }
  async load() {}
  async dispose() {}
}

function makeNote(
  name: string,
  body: string,
  wikilinks: string[] = [],
): VaultNote {
  return { path: `${name}.md`, name, body, frontmatter: {}, wikilinks };
}

Deno.test("indexVault - inserts notes with embeddings and levels", async () => {
  const db = await VaultKV.open(":memory:");
  const embedder = new MockEmbedder();
  const model = new EmbeddingModel(embedder);
  try {
    const notes = [
      makeNote("A", "Leaf note"),
      makeNote("B", "Depends on A", ["A"]),
    ];
    const stats = await indexVault(notes, db, model);
    assertEquals(stats.indexed, 2);

    const rows = await db.getAllNotes();
    assertEquals(rows.length, 2);
    const a = rows.find((r) => r.name === "A")!;
    const b = rows.find((r) => r.name === "B")!;
    assertEquals(a.level, 0);
    assertEquals(b.level, 1);
  } finally {
    db.close();
  }
});

Deno.test("indexVault - skips unchanged notes (same hash)", async () => {
  const db = await VaultKV.open(":memory:");
  const embedder = new MockEmbedder();
  const model = new EmbeddingModel(embedder);
  try {
    const notes = [makeNote("A", "Same body")];
    await indexVault(notes, db, model);

    embedder.calls = [];
    const stats = await indexVault(notes, db, model);
    assertEquals(stats.skipped, 1);
    assertEquals(embedder.calls.length, 0);
  } finally {
    db.close();
  }
});

Deno.test("computeLevels - handles cycles gracefully", () => {
  const notes = [
    makeNote("X", "links Y", ["Y"]),
    makeNote("Y", "links X", ["X"]),
  ];
  const levels = computeLevels(notes);
  // Should not throw — cycles are treated as depth 0 back-edges
  assertEquals(typeof levels.get("X"), "number");
  assertEquals(typeof levels.get("Y"), "number");
});

Deno.test("computeLevels - deterministic for stable input order", () => {
  const notes = [
    makeNote("A", "leaf"),
    makeNote("B", "mid", ["A"]),
    makeNote("C", "top", ["A", "B"]),
  ];

  const first = Array.from(computeLevels(notes).entries())
    .sort(([a], [b]) => a.localeCompare(b));
  const second = Array.from(computeLevels(notes).entries())
    .sort(([a], [b]) => a.localeCompare(b));

  assertEquals(second, first);
});
