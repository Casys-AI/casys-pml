/**
 * Live retraining module for vault-exec.
 * Called after each `run` to incrementally improve GRU routing.
 *
 * Pipeline: re-index -> GNN forward -> load ALL traces -> GRU train -> save weights
 */

import type { VaultNote } from "../core/types.ts";
import { openVaultStore } from "../db/index.ts";
import { type Embedder, EmbeddingModel } from "../embeddings/model.ts";
import { indexVault } from "../embeddings/indexer.ts";
import { initWeights } from "../gru/cell.ts";
import { trainEpoch } from "../gru/trainer.ts";
import { deserializeWeights, serializeWeights } from "../gru/weights.ts";
import { DEFAULT_GRU_CONFIG } from "../gru/types.ts";
import type { GRUWeights } from "../gru/types.ts";
import {
  buildGruVocabulary,
  buildTrainingExamples,
  refreshGnnEmbeddings,
} from "./pipeline.ts";

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

    // 1) Re-index notes (embed new/changed only)
    if (!options.skipReindex && embedder) {
      const model = new EmbeddingModel(embedder);
      const stats = await indexVault(notes, db, model);
      notesReindexed = stats.indexed;
      log(`  Re-indexed: ${stats.indexed} new, ${stats.skipped} unchanged`);
    }

    // 2) GNN refresh
    const gnnRefresh = await refreshGnnEmbeddings(db, notes);
    if (gnnRefresh.updated) {
      log(
        `  BLAS: ${
          gnnRefresh.blasReady
            ? `enabled${gnnRefresh.blasPath ? ` (${gnnRefresh.blasPath})` : ""}`
            : "disabled (JS fallback)"
        }`,
      );
      log(
        `  GNN: ${gnnRefresh.embeddingCount} embeddings updated (${gnnRefresh.paramsSource} params)`,
      );
    }

    // 3) Build vocabulary from refreshed embeddings
    const refreshedNotes = await db.getAllNotes();
    const vocab = buildGruVocabulary(refreshedNotes);
    if (vocab.nodes.length === 0) {
      return {
        notesReindexed,
        gnnUpdated: gnnRefresh.updated,
        tracesUsed: 0,
        gruTrained: false,
        gruAccuracy: 0,
      };
    }

    // 4) Load traces and build examples
    const allTraces = await db.getAllTraces();
    log(
      `  Traces in DB: ${allTraces.length} (${
        allTraces.filter((t) => t.synthetic).length
      } synthetic, ${allTraces.filter((t) => !t.synthetic).length} real)`,
    );

    const config = DEFAULT_GRU_CONFIG;
    const examples = buildTrainingExamples(allTraces, notes, vocab);
    if (examples.length === 0) {
      log("  No valid training examples");
      return {
        notesReindexed,
        gnnUpdated: gnnRefresh.updated,
        tracesUsed: 0,
        gruTrained: false,
        gruAccuracy: 0,
      };
    }

    // 5) Train GRU (warm-start from existing weights if available)
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
      log(
        `  epoch ${epoch}/${maxEpochs}: loss=${result.avgLoss.toFixed(4)} acc=${
          (result.accuracy * 100).toFixed(1)
        }%`,
      );
    }

    // 6) Save updated weights
    const serialized = await serializeWeights(weights, vocab, config);
    await db.saveGruWeights(
      serialized,
      vocab.nodes.length,
      bestEpoch,
      bestAccuracy,
    );
    log(
      `  Saved: ${vocab.nodes.length} vocab, accuracy=${
        (bestAccuracy * 100).toFixed(1)
      }%`,
    );

    return {
      notesReindexed,
      gnnUpdated: gnnRefresh.updated,
      tracesUsed: examples.length,
      gruTrained: true,
      gruAccuracy: bestAccuracy,
    };
  } finally {
    db.close();
  }
}
