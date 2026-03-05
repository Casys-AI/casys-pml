import type { VaultNote } from "../core/types.ts";
import { openVaultStore } from "../db/index.ts";
import { type Embedder, EmbeddingModel } from "../embeddings/model.ts";
import { indexVault } from "../embeddings/indexer.ts";
import { generateStructuralTraces } from "../traces/synthetic.ts";
import { recordTrace } from "../traces/recorder.ts";
import { initWeights } from "../gru/cell.ts";
import { trainEpoch } from "../gru/trainer.ts";
import { serializeWeights } from "../gru/weights.ts";
import { DEFAULT_GRU_CONFIG } from "../gru/types.ts";
import {
  buildGruVocabulary,
  buildTrainingExamples,
  refreshGnnEmbeddings,
} from "./pipeline.ts";

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
    const gnnRefresh = await refreshGnnEmbeddings(db, notes);
    if (gnnRefresh.updated) {
      console.log(
        `  BLAS: ${
          gnnRefresh.blasReady
            ? `enabled${gnnRefresh.blasPath ? ` (${gnnRefresh.blasPath})` : ""}`
            : "disabled (JS fallback)"
        }`,
      );
      console.log(
        `  ${gnnRefresh.embeddingCount} GNN embeddings computed (${gnnRefresh.paramsSource} params)`,
      );
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
    console.log(
      `  ${newTraces} new synthetic traces (${existingPaths.size} already existed)`,
    );

    console.log("4/4 GRU training...");

    // Build GRU vocabulary from note embeddings (prefer GNN-enriched)
    const refreshedNotes = await db.getAllNotes();
    const vocab = buildGruVocabulary(refreshedNotes);
    const vocabNodes = vocab.nodes;

    if (vocabNodes.length === 0) {
      console.log("  Skipped (no embeddings available for vocabulary)");
      return {
        notesIndexed: stats.indexed,
        embeddingsGenerated: stats.indexed,
        gnnForwardDone: gnnRefresh.updated,
        syntheticTraces: syntheticTraces.length,
        gruTrained: false,
      };
    }

    // Build training examples from ALL traces in DB (synthetic + real)
    const config = DEFAULT_GRU_CONFIG;
    const allTraces = await db.getAllTraces();
    const examples = buildTrainingExamples(allTraces, notes, vocab);

    if (examples.length === 0) {
      console.log("  Skipped (no valid training examples)");
      return {
        notesIndexed: stats.indexed,
        embeddingsGenerated: stats.indexed,
        gnnForwardDone: gnnRefresh.updated,
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
          `  epoch ${epoch}/${numEpochs}: loss=${
            result.avgLoss.toFixed(4)
          } acc=${(result.accuracy * 100).toFixed(1)}%`,
        );
      }
    }

    // Serialize and persist weights
    const serialized = await serializeWeights(weights, vocab, config);
    await db.saveGruWeights(
      serialized,
      vocabNodes.length,
      bestEpoch,
      bestAccuracy,
    );
    console.log(
      `  Saved: ${vocabNodes.length} vocab, best accuracy=${
        (bestAccuracy * 100).toFixed(1)
      }% (epoch ${bestEpoch})`,
    );

    return {
      notesIndexed: stats.indexed,
      embeddingsGenerated: stats.indexed,
      gnnForwardDone: gnnRefresh.updated,
      syntheticTraces: syntheticTraces.length,
      gruTrained: true,
      gruAccuracy: bestAccuracy,
    };
  } finally {
    db.close();
  }
}
