/**
 * Live retraining module for vault-exec.
 * Called after each `run` to incrementally improve GRU routing.
 *
 * Pipeline: re-index → GNN forward → load ALL traces → GRU train → save weights
 */

import type { VaultNote } from "./types.ts";
import { openVaultStore } from "./db/index.ts";
import { EmbeddingModel, type Embedder } from "./embeddings/model.ts";
import { indexVault } from "./embeddings/indexer.ts";
import { gnnForward } from "./gnn/forward.ts";
import { DEFAULT_GNN_CONFIG } from "./gnn/types.ts";
import type { GNNNode } from "./gnn/types.ts";
import { loadOrInitGnnParams, persistGnnParams } from "./gnn/runtime.ts";
import { getBlasStatus, initBlasAcceleration } from "./gnn/blas-ffi.ts";
import { initWeights } from "./gru/cell.ts";
import { trainEpoch } from "./gru/trainer.ts";
import type { TrainingExample } from "./gru/trainer.ts";
import { serializeWeights, deserializeWeights } from "./gru/weights.ts";
import { DEFAULT_GRU_CONFIG } from "./gru/types.ts";
import type { GRUVocabulary, VocabNode, GRUWeights } from "./gru/types.ts";

export interface RetrainResult {
  notesReindexed: number;
  gnnUpdated: boolean;
  tracesUsed: number;
  gruTrained: boolean;
  gruAccuracy: number;
}

export interface RetrainOptions {
  /** Max training epochs (default: 5 for live retrain) */
  maxEpochs?: number;
  /** Skip embedding re-index (if no notes changed) */
  skipReindex?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Retrain the GRU using ALL traces in the vault store (synthetic + real).
 * Optionally re-indexes notes and re-runs GNN forward pass.
 */
export async function retrain(
  notes: VaultNote[],
  dbPath: string,
  embedder: Embedder | null,
  options: RetrainOptions = {},
): Promise<RetrainResult> {
  const maxEpochs = options.maxEpochs ?? 5;
  const verbose = options.verbose ?? false;
  const log = verbose ? console.log.bind(console) : () => {};

  const db = await openVaultStore(dbPath);

  try {
    let notesReindexed = 0;
    let gnnUpdated = false;

    // ── Step 1: Re-index notes (embed new/changed only) ──
    if (!options.skipReindex && embedder) {
      const model = new EmbeddingModel(embedder);
      const stats = await indexVault(notes, db, model);
      notesReindexed = stats.indexed;
      log(`  Re-indexed: ${stats.indexed} new, ${stats.skipped} unchanged`);
    }

    // ── Step 2: GNN forward pass ──
    const allNotes = await db.getAllNotes();
    const maxLevel = Math.max(...allNotes.map((n) => n.level), 0);

    if (maxLevel > 0) {
      const blasReady = initBlasAcceleration();
      const blas = getBlasStatus();
      log(
        `  BLAS: ${blasReady ? `enabled${blas.path ? ` (${blas.path})` : ""}` : "disabled (JS fallback)"}`,
      );

      const gnnNodes: GNNNode[] = allNotes.map((row) => {
        if (!row.embedding) {
          throw new Error(`Note "${row.name}" has no embedding. Run init first.`);
        }
        const note = notes.find((n) => n.name === row.name);
        return {
          name: row.name,
          level: row.level,
          embedding: row.embedding,
          children: note?.wikilinks ?? [],
        };
      });

      const gnnConfig = DEFAULT_GNN_CONFIG;
      const { params, source } = await loadOrInitGnnParams(db, gnnConfig, maxLevel);
      const gnnEmbeddings = gnnForward(gnnNodes, params, gnnConfig);

      for (const [name, emb] of gnnEmbeddings) {
        await db.updateNoteGnnEmbedding(name, emb);
      }
      await persistGnnParams(db, params);
      gnnUpdated = true;
      log(`  GNN: ${gnnEmbeddings.size} embeddings updated (${source} params)`);
    }

    // ── Step 3: Build vocabulary from refreshed embeddings ──
    const refreshedNotes = await db.getAllNotes();
    const vocabNodes: VocabNode[] = refreshedNotes
      .filter((row) => row.gnnEmbedding || row.embedding)
      .map((row) => ({
        name: row.name,
        level: row.level,
        embedding: row.gnnEmbedding ?? row.embedding!,
      }));

    if (vocabNodes.length === 0) {
      return { notesReindexed, gnnUpdated, tracesUsed: 0, gruTrained: false, gruAccuracy: 0 };
    }

    const vocab: GRUVocabulary = {
      nodes: vocabNodes,
      nameToIndex: new Map(vocabNodes.map((n, i) => [n.name, i])),
      indexToName: vocabNodes.map((n) => n.name),
    };

    // ── Step 4: Load ALL traces from DB ──
    const allTraces = await db.getAllTraces();
    log(`  Traces in DB: ${allTraces.length} (${allTraces.filter(t => t.synthetic).length} synthetic, ${allTraces.filter(t => !t.synthetic).length} real)`);

    // Build parent/child maps
    const parentOf = new Map<string, string>();
    for (const note of notes) {
      for (const child of note.wikilinks) {
        parentOf.set(child, note.name);
      }
    }

    // Build training examples from ALL traces
    const config = DEFAULT_GRU_CONFIG;
    const examples: TrainingExample[] = [];

    for (const trace of allTraces) {
      if (trace.path.length < 2) continue;

      const targetName = trace.targetNote;
      const targetIdx = vocab.nameToIndex.get(targetName);
      if (targetIdx === undefined) continue; // target not in vocab

      const parent = parentOf.get(targetName);
      const parentIdx = parent !== undefined ? (vocab.nameToIndex.get(parent) ?? null) : null;

      const targetNote = notes.find((n) => n.name === targetName);
      const firstChild = targetNote?.wikilinks.find((c) => vocab.nameToIndex.has(c));
      const childIdx = firstChild !== undefined ? vocab.nameToIndex.get(firstChild)! : null;

      // Use intent embedding if available (real traces), else zero vector (synthetic)
      const intentEmb = (trace.intentEmbedding && trace.intentEmbedding.length > 0)
        ? trace.intentEmbedding
        : new Array(config.inputDim).fill(0);

      examples.push({
        intentEmb,
        path: trace.path,
        targetIdx,
        parentIdx,
        childIdx,
        negative: trace.success === false,
      });
    }

    if (examples.length === 0) {
      log("  No valid training examples");
      return { notesReindexed, gnnUpdated, tracesUsed: 0, gruTrained: false, gruAccuracy: 0 };
    }

    // ── Step 5: Train GRU (warm-start from existing weights if available) ──
    let weights: GRUWeights;
    const existingWeights = await db.getLatestWeights();
    if (existingWeights) {
      try {
        const deserialized = await deserializeWeights(existingWeights.blob);
        weights = deserialized.weights;
        log("  Warm-starting from existing GRU weights");
      } catch {
        weights = initWeights(config);
        log("  Failed to load existing weights, starting fresh");
      }
    } else {
      weights = initWeights(config);
      log("  No existing weights, starting fresh");
    }

    const lr = 0.001;
    const gamma = 2.0;
    let bestAccuracy = 0;
    let bestEpoch = 0;

    for (let epoch = 1; epoch <= maxEpochs; epoch++) {
      const result = trainEpoch(examples, weights, vocab, config, lr, gamma);
      if (result.accuracy > bestAccuracy) {
        bestAccuracy = result.accuracy;
        bestEpoch = epoch;
      }
      log(`  epoch ${epoch}/${maxEpochs}: loss=${result.avgLoss.toFixed(4)} acc=${(result.accuracy * 100).toFixed(1)}%`);
    }

    // ── Step 6: Save updated weights ──
    const serialized = await serializeWeights(weights, vocab, config);
    await db.saveGruWeights(serialized, vocabNodes.length, bestEpoch, bestAccuracy);
    log(`  Saved: ${vocabNodes.length} vocab, accuracy=${(bestAccuracy * 100).toFixed(1)}%`);

    return {
      notesReindexed,
      gnnUpdated,
      tracesUsed: examples.length,
      gruTrained: true,
      gruAccuracy: bestAccuracy,
    };
  } finally {
    db.close();
  }
}
