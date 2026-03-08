import type { VaultNote } from "../core/types.ts";
import type { Embedder } from "../embeddings/model.ts";

export interface RetrainResult {
  notesReindexed: number;
  gnnUpdated: boolean;
  tracesUsed: number;
  gruTrained: boolean;
  gruAccuracy: number;
  legacy: boolean;
  trainingMode: "notebook_first";
  message: string;
}

export interface RetrainOptions {
  maxEpochs?: number;
  skipReindex?: boolean;
  verbose?: boolean;
}

export const LEGACY_RETRAIN_MESSAGE =
  "Legacy notes-first retraining is disabled. Use init/sync/watch to request background live training for the DB-first build; use notebooks 05-topological-map.ipynb, 06-gnn-backprop-experiment.ipynb, and 08-openclaw-gru-sequences.ipynb for stats and evaluation.";

export function getLegacyRetrainMessage(): string {
  return LEGACY_RETRAIN_MESSAGE;
}

export async function retrain(
  _notes: VaultNote[],
  _dbPath: string,
  _embedder: Embedder | null,
  _options: RetrainOptions = {},
): Promise<RetrainResult> {
  return {
    notesReindexed: 0,
    gnnUpdated: false,
    tracesUsed: 0,
    gruTrained: false,
    gruAccuracy: 0,
    legacy: true,
    trainingMode: "notebook_first",
    message: getLegacyRetrainMessage(),
  };
}
