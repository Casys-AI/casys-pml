import type { VaultNote } from "./types.ts";
import { VaultDB } from "./db/store.ts";
import { EmbeddingModel, type Embedder } from "./embeddings/model.ts";
import { indexVault } from "./embeddings/indexer.ts";
import { gnnForward } from "./gnn/forward.ts";
import { initParams } from "./gnn/params.ts";
import { DEFAULT_GNN_CONFIG } from "./gnn/types.ts";
import type { GNNNode } from "./gnn/types.ts";
import { generateStructuralTraces } from "./traces/synthetic.ts";
import { recordTrace } from "./traces/recorder.ts";

export interface InitResult {
  notesIndexed: number;
  embeddingsGenerated: number;
  gnnForwardDone: boolean;
  syntheticTraces: number;
}

export async function initVault(
  notes: VaultNote[],
  dbPath: string,
  embedder: Embedder,
): Promise<InitResult> {
  const db = await VaultDB.open(dbPath);
  const model = new EmbeddingModel(embedder);

  try {
    console.log("1/4 Indexing notes...");
    const stats = await indexVault(notes, db, model);
    console.log(`  ${stats.indexed} embedded, ${stats.skipped} skipped`);

    console.log("2/4 GNN forward pass...");
    const allNotes = await db.getAllNotes();
    const maxLevel = Math.max(...allNotes.map((n) => n.level), 0);

    let gnnDone = false;
    if (maxLevel > 0) {
      const gnnNodes: GNNNode[] = allNotes.map((row) => {
        const note = notes.find((n) => n.name === row.name);
        return {
          name: row.name,
          level: row.level,
          embedding: row.embedding ?? new Array(1024).fill(0),
          children: note?.wikilinks ?? [],
        };
      });

      const config = DEFAULT_GNN_CONFIG;
      const params = initParams(config, maxLevel + 1);
      const gnnEmbeddings = gnnForward(gnnNodes, params, config);

      for (const [name, emb] of gnnEmbeddings) {
        await db.updateNoteGnnEmbedding(name, emb);
      }
      gnnDone = true;
      console.log(`  ${gnnEmbeddings.size} GNN embeddings computed`);
    } else {
      console.log("  Skipped (all notes are leaves)");
    }

    console.log("3/4 Generating synthetic traces...");
    const syntheticTraces = generateStructuralTraces(notes);
    for (const trace of syntheticTraces) {
      await recordTrace(db, trace);
    }
    console.log(`  ${syntheticTraces.length} synthetic traces`);

    console.log("4/4 GRU training... (not yet implemented)");

    return {
      notesIndexed: stats.indexed,
      embeddingsGenerated: stats.indexed,
      gnnForwardDone: gnnDone,
      syntheticTraces: syntheticTraces.length,
    };
  } finally {
    db.close();
  }
}
