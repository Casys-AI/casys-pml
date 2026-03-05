import type { VaultNote } from "./types.ts";
import { openVaultStore } from "./db/index.ts";
import { EmbeddingModel, type Embedder } from "./embeddings/model.ts";
import { indexVault } from "./embeddings/indexer.ts";
import { gnnForward } from "./gnn/forward.ts";
import { DEFAULT_GNN_CONFIG } from "./gnn/types.ts";
import type { GNNNode } from "./gnn/types.ts";
import { loadOrInitGnnParams, persistGnnParams } from "./gnn/infrastructure/runtime-store.ts";
import { getBlasStatus, initBlasAcceleration } from "./gnn/infrastructure/blas-ffi.ts";
import { generateStructuralTraces } from "./traces/synthetic.ts";
import { recordTrace } from "./traces/recorder.ts";
import { initWeights } from "./gru/cell.ts";
import { trainEpoch } from "./gru/trainer.ts";
import type { TrainingExample } from "./gru/trainer.ts";
import { serializeWeights } from "./gru/weights.ts";
import { DEFAULT_GRU_CONFIG } from "./gru/types.ts";
import type { GRUVocabulary, VocabNode } from "./gru/types.ts";

export interface InitResult {
  notesIndexed: number;
  embeddingsGenerated: number;
  gnnForwardDone: boolean;
  syntheticTraces: number;
  gruTrained: boolean;
  gruAccuracy?: number;
}

export async function initVault(
  notes: VaultNote[],
  dbPath: string,
  embedder: Embedder,
): Promise<InitResult> {
  const db = await openVaultStore(dbPath);
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
      const blasReady = initBlasAcceleration();
      const blas = getBlasStatus();
      console.log(
        `  BLAS: ${blasReady ? `enabled${blas.path ? ` (${blas.path})` : ""}` : "disabled (JS fallback)"}`,
      );

      const gnnNodes: GNNNode[] = allNotes.map((row) => {
        if (!row.embedding) {
          throw new Error(
            `Note "${row.name}" has no embedding after indexing. This should not happen.`,
          );
        }
        const note = notes.find((n) => n.name === row.name);
        return {
          name: row.name,
          level: row.level,
          embedding: row.embedding,
          children: note?.wikilinks ?? [],
        };
      });

      const config = DEFAULT_GNN_CONFIG;
      const { params, source } = await loadOrInitGnnParams(db, config, maxLevel);
      const gnnEmbeddings = gnnForward(gnnNodes, params, config);

      for (const [name, emb] of gnnEmbeddings) {
        await db.updateNoteGnnEmbedding(name, emb);
      }
      await persistGnnParams(db, params);
      gnnDone = true;
      console.log(`  ${gnnEmbeddings.size} GNN embeddings computed (${source} params)`);
    } else {
      console.log("  Skipped (all notes are leaves)");
    }

    console.log("3/4 Generating synthetic traces...");
    const syntheticTraces = generateStructuralTraces(notes);

    // Deduplicate: only insert synthetic traces not already in DB
    const existingTraces = await db.getAllTraces();
    const existingPaths = new Set(
      existingTraces
        .filter((t) => t.synthetic)
        .map((t) => t.path.join("||")),
    );

    let newTraces = 0;
    for (const trace of syntheticTraces) {
      const pathKey = trace.path.join("||");
      if (!existingPaths.has(pathKey)) {
        await recordTrace(db, trace);
        newTraces++;
      }
    }
    console.log(`  ${newTraces} new synthetic traces (${existingPaths.size} already existed)`);

    console.log("4/4 GRU training...");

    // Build GRU vocabulary from the notes' embeddings (prefer GNN-enriched)
    const refreshedNotes = await db.getAllNotes();
    const vocabNodes: VocabNode[] = refreshedNotes
      .filter((row) => row.gnnEmbedding || row.embedding)
      .map((row) => ({
        name: row.name,
        level: row.level,
        embedding: row.gnnEmbedding ?? row.embedding!,
      }));

    if (vocabNodes.length === 0) {
      console.log("  Skipped (no embeddings available for vocabulary)");
      return {
        notesIndexed: stats.indexed,
        embeddingsGenerated: stats.indexed,
        gnnForwardDone: gnnDone,
        syntheticTraces: syntheticTraces.length,
        gruTrained: false,
      };
    }

    const vocab: GRUVocabulary = {
      nodes: vocabNodes,
      nameToIndex: new Map(vocabNodes.map((n, i) => [n.name, i])),
      indexToName: vocabNodes.map((n) => n.name),
    };

    // Build parent/child index maps for soft labels
    const parentOf = new Map<string, string>();
    for (const note of notes) {
      for (const child of note.wikilinks) {
        parentOf.set(child, note.name);
      }
    }

    // Build training examples from ALL traces in DB (synthetic + real)
    const config = DEFAULT_GRU_CONFIG;
    const allTraces = await db.getAllTraces();
    const examples: TrainingExample[] = allTraces
      .filter((t) => t.path.length >= 2)
      .filter((t) => vocab.nameToIndex.has(t.targetNote))
      .map((t) => {
        const targetName = t.targetNote;
        const targetIdx = vocab.nameToIndex.get(targetName)!;
        const parent = parentOf.get(targetName);
        const parentIdx = parent !== undefined ? (vocab.nameToIndex.get(parent) ?? null) : null;

        const targetNote = notes.find((n) => n.name === targetName);
        const firstChild = targetNote?.wikilinks.find((c) => vocab.nameToIndex.has(c));
        const childIdx = firstChild !== undefined ? vocab.nameToIndex.get(firstChild)! : null;

        // Use intent embedding if available (real traces), else zero vector (synthetic)
        const intentEmb = (t.intentEmbedding && t.intentEmbedding.length > 0)
          ? t.intentEmbedding
          : new Array(config.inputDim).fill(0);

        return {
          intentEmb,
          path: t.path,
          targetIdx,
          parentIdx,
          childIdx,
          negative: t.success === false,
        };
      });

    if (examples.length === 0) {
      console.log("  Skipped (no valid training examples)");
      return {
        notesIndexed: stats.indexed,
        embeddingsGenerated: stats.indexed,
        gnnForwardDone: gnnDone,
        syntheticTraces: syntheticTraces.length,
        gruTrained: false,
      };
    }

    // Train
    const lr = 0.001;
    const gamma = 2.0;
    const numEpochs = 10;
    const weights = initWeights(config);

    let bestAccuracy = 0;
    let bestEpoch = 0;

    for (let epoch = 1; epoch <= numEpochs; epoch++) {
      const result = trainEpoch(examples, weights, vocab, config, lr, gamma);
      if (result.accuracy > bestAccuracy) {
        bestAccuracy = result.accuracy;
        bestEpoch = epoch;
      }
      if (epoch === 1 || epoch === numEpochs || epoch % 5 === 0) {
        console.log(
          `  epoch ${epoch}/${numEpochs}: loss=${result.avgLoss.toFixed(4)} acc=${(result.accuracy * 100).toFixed(1)}%`,
        );
      }
    }

    // Serialize and persist weights
    const serialized = await serializeWeights(weights, vocab, config);
    await db.saveGruWeights(serialized, vocabNodes.length, bestEpoch, bestAccuracy);
    console.log(
      `  Saved: ${vocabNodes.length} vocab, best accuracy=${(bestAccuracy * 100).toFixed(1)}% (epoch ${bestEpoch})`,
    );

    return {
      notesIndexed: stats.indexed,
      embeddingsGenerated: stats.indexed,
      gnnForwardDone: gnnDone,
      syntheticTraces: syntheticTraces.length,
      gruTrained: true,
      gruAccuracy: bestAccuracy,
    };
  } finally {
    db.close();
  }
}
