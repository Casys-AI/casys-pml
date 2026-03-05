import { assertEquals } from "jsr:@std/assert";
import type { VaultNote } from "../core/types.ts";
import { computeLevels, indexVault } from "../embeddings/indexer.ts";
import { type Embedder, EmbeddingModel } from "../embeddings/model.ts";
import { VaultKV } from "../db/store-kv.ts";
import { gnnForward } from "../gnn/application/forward.ts";
import { initParams } from "../gnn/domain/params.ts";
import { DEFAULT_GNN_CONFIG } from "../gnn/domain/types.ts";
import type { GNNNode } from "../gnn/domain/types.ts";
import { generateStructuralTraces } from "../traces/synthetic.ts";
import { GRUInference } from "../gru/inference.ts";
import { initWeights } from "../gru/cell.ts";
import { DEFAULT_GRU_CONFIG } from "../gru/types.ts";
import type { GRUVocabulary, VocabNode } from "../gru/types.ts";

class MockEmbedder implements Embedder {
  async encode(text: string): Promise<number[]> {
    const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i) * 0.1);
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

Deno.test("integration: full pipeline parse -> embed -> GNN -> traces -> GRU predict", async () => {
  const notes = [
    makeNote("Team Members", "List of people: Alice (senior), Bob (junior)"),
    makeNote("Senior Filter", "Keep seniors from [[Team Members]]", [
      "Team Members",
    ]),
    makeNote("Summary", "Summarize [[Senior Filter]]", ["Senior Filter"]),
  ];

  const levels = computeLevels(notes);
  assertEquals(levels.get("Team Members"), 0);
  assertEquals(levels.get("Senior Filter"), 1);
  assertEquals(levels.get("Summary"), 2);

  const db = await VaultKV.open(":memory:");
  const model = new EmbeddingModel(new MockEmbedder());
  try {
    const stats = await indexVault(notes, db, model);
    assertEquals(stats.indexed, 3);

    const allNotes = await db.getAllNotes();
    const gnnNodes: GNNNode[] = allNotes.map((row) => ({
      name: row.name,
      level: row.level,
      embedding: Array.from(
        { length: 1024 },
        (_, i) => Math.sin(row.name.charCodeAt(0) + i) * 0.1,
      ),
      children: notes.find((n) => n.name === row.name)?.wikilinks ?? [],
    }));

    const config = DEFAULT_GNN_CONFIG;
    const params = initParams(config, 3);
    const gnnEmbeddings = gnnForward(gnnNodes, params, config);
    assertEquals(gnnEmbeddings.size, 3);

    const traces = generateStructuralTraces(notes);
    assertEquals(traces.length, 2);

    const vocabNodes: VocabNode[] = Array.from(gnnEmbeddings.entries()).map((
      [name, emb],
    ) => ({
      name,
      level: levels.get(name) ?? 0,
      embedding: emb,
    }));
    const vocab: GRUVocabulary = {
      nodes: vocabNodes,
      nameToIndex: new Map(vocabNodes.map((n, i) => [n.name, i])),
      indexToName: vocabNodes.map((n) => n.name),
    };
    const gruWeights = initWeights(DEFAULT_GRU_CONFIG);
    const gru = new GRUInference(gruWeights, vocab, DEFAULT_GRU_CONFIG);

    const intent = await model.encode("who are the senior people?");
    const prediction = gru.predictNext(intent, []);
    assertEquals(vocab.nameToIndex.has(prediction.name), true);

    const path = gru.buildPath(intent, 5);
    assertEquals(path.length > 0, true);
  } finally {
    db.close();
  }
});
